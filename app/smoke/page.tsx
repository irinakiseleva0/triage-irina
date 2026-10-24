"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  SmokeRequestSchema, SmokeResponseSchema,
  type Dataset, type SmokeResponse, type Strategy,
} from "../../lib/smoke-schema";

const percent = (value: number | null) => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;

export default function SmokePage() {
  const [dataset, setDataset] = useState<Dataset>("labelled_100");
  const [sampleSize, setSampleSize] = useState(10);
  const [strategy, setStrategy] = useState<Strategy>("llm");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SmokeResponse | null>(null);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    setError(null);
    const request = SmokeRequestSchema.safeParse({ dataset, sampleSize, strategy });
    if (!request.success) {
      setError(request.error.issues[0].message);
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const response = await fetch("/api/smoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.data),
      });
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        setError("Invalid response from server.");
        return;
      }
      if (!response.ok) {
        // Use fixed messages so unexpected server/proxy details never reach the UI.
        setError(response.status === 400
          ? "Invalid smoke test request. Check the dataset, sample size, and strategy."
          : "Unable to run smoke test. Please try again.");
        return;
      }
      const parsed = SmokeResponseSchema.safeParse(data);
      if (!parsed.success) {
        setError("Invalid response from server.");
        return;
      }
      setResult(parsed.data);
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setRunning(false);
    }
  }

  const summary = result?.summary;
  return (
    <main className="smoke">
      <nav aria-label="Main navigation">
        <Link href="/">Triage</Link>
        <Link href="/chat">Chat</Link>
        <Link href="/smoke" aria-current="page">Smoke</Link>
        <Link href="/admin">Admin</Link>
      </nav>
      <h1>Smoke tests</h1>
      <form onSubmit={run} aria-busy={running}>
        <label htmlFor="dataset">Dataset</label>
        <select id="dataset" value={dataset} disabled={running} onChange={(event) => setDataset(event.target.value as Dataset)}>
          <option value="labelled_100">Labelled 100</option>
          <option value="all_500">All 500</option>
        </select>
        <label htmlFor="sample-size">Sample size</label>
        <input id="sample-size" type="number" min={1} max={100} step={1} required value={Number.isNaN(sampleSize) ? "" : sampleSize}
          disabled={running} onChange={(event) => setSampleSize(event.target.valueAsNumber)} />
        <label htmlFor="strategy">Strategy</label>
        <select id="strategy" value={strategy} disabled={running} onChange={(event) => setStrategy(event.target.value as Strategy)}>
          <option value="llm">LLM</option>
        </select>
        <button type="submit" disabled={running}>Run smoke test</button>
      </form>
      {running && <p role="status">Running {sampleSize} tickets... this can take a while</p>}
      {error && <p role="alert">{error}</p>}
      {result && summary && (
        <section aria-label="Smoke test results">
          <h2>Results</h2>
          <div className="table-scroll" role="region" aria-label="Ticket results" tabIndex={0}>
            <table>
              <thead><tr>
                <th scope="col">Ticket id</th><th scope="col">Outcome</th>
                <th scope="col">Predicted category</th><th scope="col">Predicted priority</th>
                {summary.labelled && <><th scope="col">Expected category</th><th scope="col">Expected priority</th></>}
                <th scope="col">Latency (ms)</th><th scope="col">Total tokens</th>
              </tr></thead>
              <tbody>{result.rows.map((row) => (
                <tr key={row.ticketId}>
                  <td>{row.ticketId}</td><td>{row.outcome}</td>
                  <td className={row.categoryMatch === false ? "mismatch" : undefined}>{row.predictedCategory ?? "n/a"}</td>
                  <td className={row.priorityMatch === false ? "mismatch" : undefined}>{row.predictedPriority ?? "n/a"}</td>
                  {summary.labelled && <>
                    <td>{row.expectedCategory ?? "n/a"}</td><td>{row.expectedPriority ?? "n/a"}</td>
                  </>}
                  <td>{row.latencyMs ?? "n/a"}</td><td>{row.totalTokens ?? "n/a"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="smoke-summary">
            <h2>Summary</h2>
            <p>Outcomes: {Object.entries(summary.outcomes).map(([key, count]) => `${key} ${count}`).join(" · ")}</p>
            {summary.labelled && <>
              <p>Category mismatches: {summary.categoryMismatches} / {summary.outcomes.ok}</p>
              <p>Priority mismatches: {summary.priorityMismatches} / {summary.outcomes.ok}</p>
              <p>Category accuracy: {percent(summary.categoryAccuracy)}</p>
              <p>Priority accuracy: {percent(summary.priorityAccuracy)}</p>
            </>}
            <p>Average latency: {summary.avgLatencyMs === null ? "n/a" : `${summary.avgLatencyMs.toFixed(1)} ms`}</p>
            <p>Total tokens: {summary.totalTokens}</p>
            <p>Total cost (USD): {summary.totalCostUsd === null ? "not configured" : summary.totalCostUsd.toFixed(6)}</p>
            <p>Model: {summary.model}</p><p>Strategy: {summary.strategy}</p>
            <p>Prompt version: {summary.promptVersion}</p>
          </div>
        </section>
      )}
    </main>
  );
}
