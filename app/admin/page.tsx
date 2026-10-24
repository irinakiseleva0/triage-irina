import Link from "next/link";
import { readSmokeRuns } from "../../lib/run-log";

export const dynamic = "force-dynamic";

const percent = (value: number | null) => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;

export default async function AdminPage() {
  let runs: Awaited<ReturnType<typeof readSmokeRuns>> = [];
  let error = false;
  try {
    runs = await readSmokeRuns();
  } catch {
    console.error("Unable to read smoke run history");
    error = true;
  }
  return (
    <main className="admin">
      <nav aria-label="Main navigation">
        <Link href="/">Triage</Link>
        <Link href="/chat">Chat</Link>
        <Link href="/smoke">Smoke</Link>
        <Link href="/admin" aria-current="page">Admin</Link>
      </nav>
      <h1>Smoke run history</h1>
      {error ? <p role="alert">Unable to read smoke run history. Please try again later.</p>
        : runs.length === 0 ? <p>No smoke runs logged yet.</p>
        : <div className="table-scroll" role="region" aria-label="Smoke run history" tabIndex={0}>
          <table>
            <thead><tr>
              <th scope="col">Date</th><th scope="col">Dataset</th><th scope="col">Sample</th>
              <th scope="col">Strategy</th><th scope="col">Model</th><th scope="col">Prompt version</th>
              <th scope="col">Category accuracy</th><th scope="col">Priority accuracy</th>
              <th scope="col">Outcomes</th><th scope="col">Avg latency (ms)</th>
              <th scope="col">Total tokens</th><th scope="col">Cost (USD)</th>
            </tr></thead>
            <tbody>{runs.map((run, index) => (
              <tr key={`${run.runId}-${index}`}>
                <td><time dateTime={run.timestamp}>{run.timestamp}</time></td>
                <td>{run.dataset}</td><td>{run.sampleSize}</td><td>{run.strategy}</td>
                <td>{run.model}</td><td>{run.promptVersion}</td>
                <td>{percent(run.categoryAccuracy)}</td><td>{percent(run.priorityAccuracy)}</td>
                <td>{Object.entries(run.outcomes).map(([key, count]) => `${key} ${count}`).join(" · ")}</td>
                <td>{run.avgLatencyMs?.toFixed(1) ?? "n/a"}</td><td>{run.totalTokens}</td>
                <td>{run.totalCostUsd?.toFixed(6) ?? "n/a"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
    </main>
  );
}
