
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type UsageRecord = {
  timestamp: string;
  model: string;
  promptVersion: string;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
};

export function calculateCost(
  inputTokens: number | null,
  outputTokens: number | null
): number | null {
  const inputPrice = Number(process.env.LLM_INPUT_PRICE_PER_1M);
  const outputPrice = Number(process.env.LLM_OUTPUT_PRICE_PER_1M);

  if (
    inputTokens === null ||
    outputTokens === null ||
    !process.env.LLM_INPUT_PRICE_PER_1M ||
    !process.env.LLM_OUTPUT_PRICE_PER_1M ||
    !Number.isFinite(inputPrice) ||
    !Number.isFinite(outputPrice) ||
    inputPrice < 0 ||
    outputPrice < 0
  ) {
    return null;
  }

  return (
    (inputTokens / 1_000_000) * inputPrice +
    (outputTokens / 1_000_000) * outputPrice
  );
}

export async function logUsage(record: UsageRecord) {
  const directory = path.join(process.cwd(), "logs");
  await mkdir(directory, { recursive: true });

  const file = path.join(directory, "llm-calls.jsonl");

  await appendFile(
    file,
    JSON.stringify(record) + "\n",
    "utf8"
  );
}
