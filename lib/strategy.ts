import "server-only";
import { dmTriage, DmError } from "./dm";
import { PROMPT_VERSION } from "./prompt";
import { summarizeTicket, SUMMARY_PROMPT_VERSION } from "./summary";
import { triageTicket, mapTriageError } from "./triage";
import { calculateCost } from "./usage";
import type { Strategy, TokenUsage, TriageResult } from "./schema";

type StrategyResult = {
  result: Pick<TriageResult, "category" | "priority"> & { summary: string | null; suggested_action: string | null };
  usage: TokenUsage;
  latencyMs: number;
  model: string;
  promptVersion: string;
  confidence: { category: number; priority: number } | null;
  costUsd: number | null;
};

export function strategyPromptVersion(strategy: Strategy): string {
  switch (strategy) {
    case "llm": return PROMPT_VERSION;
    case "dm": return "dm-v1";
    case "dm_llm": return `dm-v1+${SUMMARY_PROMPT_VERSION}`;
  }
}

function dmCost(usage: TokenUsage): number | null {
  const price = Number(process.env.DM_INPUT_PRICE_PER_1M ?? 0);
  if (!Number.isFinite(price) || price < 0) return null;
  if (price === 0) return 0;
  return usage === null ? null : usage.inputTokens * price / 1_000_000;
}

export async function runStrategy(
  ticket: { subject: string; body: string }, strategy: Strategy,
): Promise<StrategyResult> {
  const startedAt = Date.now();
  switch (strategy) {
    case "llm": {
      const response = await triageTicket(ticket);
      return {
        ...response, promptVersion: PROMPT_VERSION, confidence: null,
        costUsd: calculateCost(response.usage?.inputTokens ?? null, response.usage?.outputTokens ?? null),
      };
    }
    case "dm": {
      const response = await dmTriage(ticket);
      return {
        result: { category: response.category, priority: response.priority, summary: null, suggested_action: null },
        usage: response.usage, latencyMs: Date.now() - startedAt, model: response.model,
        confidence: response.confidence, promptVersion: strategyPromptVersion(strategy),
        costUsd: dmCost(response.usage),
      };
    }
    case "dm_llm": {
      const decision = await dmTriage(ticket);
      const text = await summarizeTicket(ticket, decision);
      const decisionCost = dmCost(decision.usage);
      const textCost = calculateCost(text.usage?.inputTokens ?? null, text.usage?.outputTokens ?? null);
      return {
        result: { category: decision.category, priority: decision.priority, summary: text.summary, suggested_action: text.suggested_action },
        usage: decision.usage && text.usage ? {
          inputTokens: decision.usage.inputTokens + text.usage.inputTokens,
          outputTokens: decision.usage.outputTokens + text.usage.outputTokens,
          totalTokens: decision.usage.totalTokens + text.usage.totalTokens,
        } : null,
        latencyMs: Date.now() - startedAt,
        model: `${decision.model} + ${text.model}`,
        promptVersion: strategyPromptVersion(strategy), confidence: decision.confidence,
        costUsd: decisionCost === null || textCost === null ? null : decisionCost + textCost,
      };
    }
    default: throw new Error("Unsupported strategy.");
  }
}

export function mapStrategyError(error: unknown): { status: number; error: string } {
  if (error instanceof DmError) {
    switch (error.code) {
      case "dm_rate_limited": return { status: 429, error: "rate_limited" };
      case "dm_timeout": return { status: 504, error: "triage_timeout" };
      case "dm_unavailable": return { status: 502, error: "triage_unavailable" };
      case "dm_invalid_output": return { status: 502, error: "invalid_model_output" };
      case "dm_config": return { status: 500, error: "internal_error" };
    }
  }
  return mapTriageError(error);
}
