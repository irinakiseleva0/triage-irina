import { z } from "zod";

export const TriageSchema = z.object({
  category: z.enum([
    "billing",
    "technical_bug",
    "account",
    "feature_request",
  ]),
  priority: z.enum(["low", "medium", "high"]),
  summary: z.string().min(1).max(300),
  suggested_action: z.string().min(1).max(500),
});

export type TriageResult = z.infer<typeof TriageSchema>;
export const StrategySchema = z.enum(["llm", "dm", "dm_llm"]);
export type Strategy = z.infer<typeof StrategySchema>;

export function ticketToText({ subject, body }: { subject: string; body: string }): string {
  return subject.trim() ? `${subject}\n\n${body}` : body;
}

export const TriageRequestSchema = z.object({
  strategy: StrategySchema.default("llm"),
  ticket: z.object({
    subject: z.string().trim(),
    body: z.string().trim().min(1, "Body is required"),
  }),
}).refine(
  ({ ticket }) => ticketToText(ticket).length <= 5000,
  { message: "Ticket is too long (max 5000 characters)" }
);

export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
}).nullable();

export const TriageResponseSchema = z.object({
  category: TriageSchema.shape.category,
  priority: TriageSchema.shape.priority,
  summary: z.string().max(300).nullable(),
  suggested_action: z.string().max(500).nullable(),
  promptVersion: z.string(),
  model: z.string(),
  strategy: StrategySchema,
  usage: TokenUsageSchema,
  confidence: z.object({
    category: z.number().min(0).max(1),
    priority: z.number().min(0).max(1),
  }).nullable(),
}).refine(
  (value) => value.strategy === "dm" || (
    typeof value.summary === "string" && value.summary.length > 0 &&
    typeof value.suggested_action === "string" && value.suggested_action.length > 0
  ),
  { message: "Summary and suggested action are required for this strategy." },
);

export type TriageRequest = z.infer<typeof TriageRequestSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type TriageResponse = z.infer<typeof TriageResponseSchema>;
