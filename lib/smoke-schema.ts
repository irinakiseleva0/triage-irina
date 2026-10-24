import { z } from "zod";
import { TriageSchema } from "./schema";

export const StrategySchema = z.enum(["llm"]);
export const DatasetSchema = z.enum(["labelled_100", "all_500"]);
export const OutcomeSchema = z.enum([
  "ok", "rejected_400", "invalid_model_output", "rate_limited",
  "triage_unavailable", "triage_timeout", "internal_error",
]);

export const SmokeRequestSchema = z.object({
  dataset: DatasetSchema,
  sampleSize: z.number().int().min(1).max(100),
  strategy: StrategySchema,
});

const count = z.number().int().nonnegative();
const measurement = z.number().nonnegative();
export const SmokeRowSchema = z.object({
  ticketId: z.string(),
  tags: z.array(z.string()),
  outcome: OutcomeSchema,
  predictedCategory: TriageSchema.shape.category.nullable(),
  predictedPriority: TriageSchema.shape.priority.nullable(),
  expectedCategory: TriageSchema.shape.category.nullable(),
  expectedPriority: TriageSchema.shape.priority.nullable(),
  categoryMatch: z.boolean().nullable(),
  priorityMatch: z.boolean().nullable(),
  latencyMs: measurement.nullable(),
  inputTokens: count.nullable(),
  outputTokens: count.nullable(),
  totalTokens: count.nullable(),
  costUsd: measurement.nullable(),
});

export const SmokeSummarySchema = z.object({
  runId: z.uuid(),
  timestamp: z.iso.datetime(),
  dataset: DatasetSchema,
  sampleSize: z.number().int().min(1).max(100),
  strategy: StrategySchema,
  model: z.string(),
  promptVersion: z.string(),
  outcomes: z.record(OutcomeSchema, count),
  labelled: z.boolean(),
  categoryMismatches: count.nullable(),
  priorityMismatches: count.nullable(),
  categoryAccuracy: z.number().min(0).max(1).nullable(),
  priorityAccuracy: z.number().min(0).max(1).nullable(),
  avgLatencyMs: measurement.nullable(),
  totalLatencyMs: measurement,
  totalInputTokens: count,
  totalOutputTokens: count,
  totalTokens: count,
  totalCostUsd: measurement.nullable(),
});

export const SmokeRunRecordSchema = z.object({
  summary: SmokeSummarySchema,
  rows: z.array(SmokeRowSchema),
});
export const SmokeResponseSchema = SmokeRunRecordSchema;

export type Strategy = z.infer<typeof StrategySchema>;
export type Dataset = z.infer<typeof DatasetSchema>;
export type Outcome = z.infer<typeof OutcomeSchema>;
export type SmokeRequest = z.infer<typeof SmokeRequestSchema>;
export type SmokeRow = z.infer<typeof SmokeRowSchema>;
export type SmokeSummary = z.infer<typeof SmokeSummarySchema>;
export type SmokeRunRecord = z.infer<typeof SmokeRunRecordSchema>;
export type SmokeResponse = z.infer<typeof SmokeResponseSchema>;
