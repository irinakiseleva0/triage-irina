import "server-only";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { TriageRequestSchema, TriageSchema } from "./schema";
import { mapStrategyError, runStrategy, strategyPromptVersion } from "./strategy";
import { calculateCost } from "./usage";
import {
  OutcomeSchema, SmokeRequestSchema, SmokeResponseSchema,
  type Dataset, type SmokeRequest, type SmokeResponse, type SmokeRow,
  type Strategy,
} from "./smoke-schema";

const TicketSchema = z.object({
  ticket_id: z.string(),
  subject: z.string(),
  body: z.string(),
});
const LabelledTicketSchema = TicketSchema.extend({
  category: TriageSchema.shape.category,
  priority: TriageSchema.shape.priority,
  tags: z.string(),
});
type Ticket = z.infer<typeof TicketSchema> | z.infer<typeof LabelledTicketSchema>;

export async function loadDataset(dataset: Dataset): Promise<Ticket[]> {
  const filename = dataset === "labelled_100"
    ? "support_tickets_100_labelled.json" : "support_tickets_500.json";
  const text = await readFile(path.join(process.cwd(), "data", filename), "utf8");
  const raw: unknown = JSON.parse(text.replace(/^\uFEFF/, ""));
  return dataset === "labelled_100"
    ? z.array(LabelledTicketSchema).parse(raw)
    : z.array(TicketSchema).parse(raw);
}

export function sampleTickets<T>(tickets: readonly T[], size: number): T[] {
  if (!Number.isInteger(size) || size < 1 || size > tickets.length) {
    throw new Error("Invalid sample size for dataset.");
  }
  const shuffled = [...tickets];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, size);
}

export async function runTicket(ticket: { subject: string; body: string }, strategy: Strategy) {
  return runStrategy(ticket, strategy);
}

export async function runSmoke(input: SmokeRequest): Promise<SmokeResponse> {
  const request = SmokeRequestSchema.parse(input);
  const runId = randomUUID();
  const timestamp = new Date().toISOString();
  const tickets = sampleTickets(await loadDataset(request.dataset), request.sampleSize);
  const labelled = request.dataset === "labelled_100";
  const configuredDelay = Number(process.env.SMOKE_DELAY_MS);
  const delay = Number.isFinite(configuredDelay) && configuredDelay >= 0 ? configuredDelay : 0;
  const rows: SmokeRow[] = [];
  let model = request.strategy === "llm" ? process.env.LLM_MODEL ?? "unknown"
    : request.strategy === "dm" ? process.env.DM_MODEL ?? "unknown"
    : `${process.env.DM_MODEL ?? "unknown"} + ${process.env.LLM_MODEL ?? "unknown"}`;
  let promptVersion = strategyPromptVersion(request.strategy);
  let called = false;

  for (const ticket of tickets) {
    const expected = labelled && "category" in ticket ? ticket : null;
    const row: SmokeRow = {
      ticketId: ticket.ticket_id,
      tags: expected ? expected.tags.split("|").map((tag) => tag.trim()).filter(Boolean) : [],
      outcome: "rejected_400",
      predictedCategory: null, predictedPriority: null,
      expectedCategory: expected?.category ?? null,
      expectedPriority: expected?.priority ?? null,
      categoryMatch: null, priorityMatch: null,
      latencyMs: null, inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null,
    };
    const parsed = TriageRequestSchema.safeParse({
      ticket: { subject: ticket.subject, body: ticket.body },
    });
    if (parsed.success) {
      if (called && delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      called = true;
      try {
        const response = await runTicket(parsed.data.ticket, request.strategy);
        model = response.model;
        promptVersion = response.promptVersion;
        Object.assign(row, {
          outcome: "ok",
          predictedCategory: response.result.category,
          predictedPriority: response.result.priority,
          categoryMatch: expected ? response.result.category === expected.category : null,
          priorityMatch: expected ? response.result.priority === expected.priority : null,
          latencyMs: response.latencyMs,
          inputTokens: response.usage?.inputTokens ?? null,
          outputTokens: response.usage?.outputTokens ?? null,
          totalTokens: response.usage?.totalTokens ?? null,
          costUsd: response.costUsd,
        });
      } catch (error) {
        row.outcome = OutcomeSchema.parse(mapStrategyError(error).error);
        // Never log provider error objects: they may contain credentials or ticket text.
        console.error("Smoke ticket failed", { ticketId: row.ticketId, outcome: row.outcome });
      }
    }
    rows.push(row);
  }

  const outcomes = Object.fromEntries(OutcomeSchema.options.map((key) => [key, 0])) as SmokeResponse["summary"]["outcomes"];
  for (const row of rows) outcomes[row.outcome]++;
  const ok = rows.filter((row) => row.outcome === "ok");
  const categoryMismatches = ok.filter((row) => row.categoryMatch === false).length;
  const priorityMismatches = ok.filter((row) => row.priorityMatch === false).length;
  const totalLatencyMs = ok.reduce((sum, row) => sum + (row.latencyMs ?? 0), 0);
  return SmokeResponseSchema.parse({
    rows,
    summary: {
      runId, timestamp, ...request, model, promptVersion, outcomes, labelled,
      categoryMismatches: labelled ? categoryMismatches : null,
      priorityMismatches: labelled ? priorityMismatches : null,
      categoryAccuracy: labelled && ok.length ? (ok.length - categoryMismatches) / ok.length : null,
      priorityAccuracy: labelled && ok.length ? (ok.length - priorityMismatches) / ok.length : null,
      avgLatencyMs: ok.length ? totalLatencyMs / ok.length : null,
      totalLatencyMs,
      totalInputTokens: ok.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0),
      totalOutputTokens: ok.reduce((sum, row) => sum + (row.outputTokens ?? 0), 0),
      totalTokens: ok.reduce((sum, row) => sum + (row.totalTokens ?? 0), 0),
      totalCostUsd: (request.strategy !== "dm" && calculateCost(0, 0) === null) || ok.some((row) => row.costUsd === null)
        ? null : ok.reduce((sum, row) => sum + (row.costUsd ?? 0), 0),
    },
  });
}
