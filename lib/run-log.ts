import "server-only";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SmokeRunRecordSchema, SmokeSummarySchema,
  type SmokeRunRecord, type SmokeSummary,
} from "./smoke-schema";

export async function logSmokeRun(record: SmokeRunRecord): Promise<void> {
  // Parsing strips unknown fields before anything is persisted.
  const safe = SmokeRunRecordSchema.parse(record);
  const logs = path.join(process.cwd(), "logs");
  const runs = path.join(process.cwd(), "runs");
  const { summary } = safe;
  const filename = `${summary.timestamp.slice(0, 10)}-${summary.promptVersion}-${summary.model}-${summary.runId}.json`
    .replace(/[^A-Za-z0-9._-]/g, "_");
  try {
    await mkdir(logs, { recursive: true });
    await appendFile(path.join(logs, "smoke-runs.jsonl"), JSON.stringify(summary) + "\n", "utf8");
  } catch {
    console.error("Unable to append smoke run summary", { runId: summary.runId });
  }
  try {
    await mkdir(runs, { recursive: true });
    await writeFile(path.join(runs, filename), JSON.stringify(safe, null, 2) + "\n", "utf8");
  } catch {
    console.error("Unable to write smoke run record", { runId: summary.runId });
  }
}

export async function readSmokeRuns(): Promise<SmokeSummary[]> {
  let text: string;
  try {
    text = await readFile(path.join(process.cwd(), "logs", "smoke-runs.jsonl"), "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") return [];
    throw new Error("Unable to read smoke run log.");
  }
  const summaries: SmokeSummary[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = SmokeSummarySchema.safeParse(JSON.parse(line));
      if (parsed.success) summaries.push(parsed.data);
    } catch {
      // Ignore malformed or partially written log lines.
    }
  }
  return summaries.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}
