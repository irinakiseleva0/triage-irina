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
export const TriageRequestSchema = z.object({
  ticket: z.object({
    subject: z.string().trim().min(1, "Subject is required"),
    body: z.string().trim().min(1, "Body is required"),
  }),
}).refine(
  ({ ticket }) => ticket.subject.length + 2 + ticket.body.length <= 5000,
  { message: "Ticket is too long (max 5000 characters)" }
);

export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
}).nullable();

export const TriageResponseSchema = TriageSchema.extend({
  promptVersion: z.string(),
  model: z.string(),
  usage: TokenUsageSchema,
});

export type TriageRequest = z.infer<typeof TriageRequestSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type TriageResponse = z.infer<typeof TriageResponseSchema>;
