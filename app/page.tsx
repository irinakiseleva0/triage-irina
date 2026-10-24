"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { TriageResponse } from "../lib/schema";
import { TriageResponseSchema } from "../lib/schema";

const errorMessages: Record<string, string> = {
  invalid_model_output: "The model returned an invalid result. Please try again.",
  rate_limited: "Too many requests. Please try again shortly.",
  triage_unavailable: "Triage is currently unavailable. Please try again later.",
  triage_timeout: "Triage timed out. Please try again.",
  internal_error: "Something went wrong. Please try again.",
};

export default function TriagePage() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [result, setResult] = useState<TriageResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function triage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading || !subject.trim() || !body.trim()) return;

    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: { subject, body } }),
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        const code =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "internal_error";
        const message = Object.hasOwn(errorMessages, code)
          ? errorMessages[code]
          : response.status === 400
            ? code
            : errorMessages.internal_error;
        setError(message);
        return;
      }

      const parsed = TriageResponseSchema.safeParse(data);
      if (!parsed.success) {
        setError(errorMessages.invalid_model_output);
        return;
      }
      setResult(parsed.data);
    } catch {
      setResult(null);
      setError("Unable to triage your ticket. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="triage">
      <nav aria-label="Main navigation">
        <Link href="/" aria-current="page">Triage</Link>
        <Link href="/chat">Chat</Link>
        <Link href="/smoke">Smoke</Link>
        <Link href="/admin">Admin</Link>
      </nav>
      <h1>Ticket triage</h1>
      <form onSubmit={triage} aria-busy={isLoading}>
        <label htmlFor="subject">Subject</label>
        <input
          id="subject"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          required
          disabled={isLoading}
        />
        <label htmlFor="body">Body</label>
        <textarea
          id="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={6}
          required
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || !subject.trim() || !body.trim()}>
          {isLoading ? "Triaging..." : "Triage"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      {result && (
        <section className="triage-result" aria-label="Triage result" aria-live="polite">
          <h2>Result</h2>
          <dl>
            <dt>Category</dt><dd>{result.category}</dd>
            <dt>Priority</dt><dd>{result.priority}</dd>
            <dt>Summary</dt><dd>{result.summary}</dd>
            <dt>Suggested action</dt><dd>{result.suggested_action}</dd>
            <dt>Prompt version</dt><dd>{result.promptVersion}</dd>
            <dt>Model</dt><dd>{result.model}</dd>
          </dl>
          <h3>Token usage</h3>
          {result.usage === null ? (
            <p>not reported</p>
          ) : (
            <>
              <dl>
                <dt>Input</dt><dd>{result.usage.inputTokens}</dd>
                <dt>Output</dt><dd>{result.usage.outputTokens}</dd>
                <dt>Total</dt><dd>{result.usage.totalTokens}</dd>
              </dl>
              {result.usage.totalTokens > result.usage.inputTokens + result.usage.outputTokens && (
                <p>Reasoning (hidden): {result.usage.totalTokens - result.usage.inputTokens - result.usage.outputTokens}</p>
              )}
            </>
          )}
        </section>
      )}
    </main>
  );
}
