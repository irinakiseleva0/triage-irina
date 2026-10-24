import OpenAI from "openai";
import { llm, model } from "./llm";
import { TRIAGE_SYSTEM_PROMPT } from "./prompt";
import { TriageSchema, ticketToText, type TriageResult, type TokenUsage } from "./schema";

export class LlmInvalidOutputError extends Error {}

export async function triageTicket(ticket: {
  subject: string;
  body: string;
}): Promise<{
  result: TriageResult;
  usage: TokenUsage;
  latencyMs: number;
  model: string;
}> {
  const ticketText = ticketToText(ticket);

  if (!model) {
    throw new Error("LLM_MODEL is not configured.");
  }

  const mode = process.env.LLM_STRUCTURED_OUTPUT ?? "prompt";

  if (mode !== "prompt" && mode !== "json_schema") {
    throw new Error("Invalid LLM_STRUCTURED_OUTPUT configuration.");
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: TRIAGE_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: `<ticket>\n${ticketText}\n</ticket>`,
    },
  ];

  const startedAt = Date.now();
  const completion = await llm.chat.completions.create({
    model,
    messages,
    ...(mode === "json_schema"
      ? {
          response_format: {
            type: "json_schema" as const,
            json_schema: {
              name: "support_triage",
              strict: true,
              schema: (() => {
                const { $schema, ...schema } =
                  TriageSchema.toJSONSchema();
                return schema;
              })(),
            },
          },
        }
      : {}),
  });

  const latencyMs = Date.now() - startedAt;

  const choice = completion.choices[0];

  if (!choice || choice.finish_reason === "length") {
    throw new LlmInvalidOutputError("Incomplete model output.");
  }

  let text = choice.message.content ?? "";

  // Remove an optional Markdown JSON code fence.
  text = text.trim().replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch {
    throw new LlmInvalidOutputError("Model returned invalid JSON.");
  }

  const parsed = TriageSchema.safeParse(raw);

  if (!parsed.success) {
    throw new LlmInvalidOutputError("Model output failed schema validation.");
  }

  const usage: TokenUsage = completion.usage
    && typeof completion.usage.prompt_tokens === "number"
    && typeof completion.usage.completion_tokens === "number"
    && typeof completion.usage.total_tokens === "number"
    ? {
        inputTokens: completion.usage.prompt_tokens,
        outputTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
      }
    : null;

  return { result: parsed.data, usage, latencyMs, model };
}

export function mapTriageError(error: unknown): { status: number; error: string } {
  if (error instanceof LlmInvalidOutputError) {
    return { status: 502, error: "invalid_model_output" };
  }

  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return { status: 504, error: "triage_timeout" };
  }

  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      return { status: 429, error: "rate_limited" };
    }

    if (error.status === 408) {
      return { status: 504, error: "triage_timeout" };
    }

    if (error.status === undefined || error.status >= 500) {
      return { status: 502, error: "triage_unavailable" };
    }
  }

  return { status: 500, error: "internal_error" };
}
