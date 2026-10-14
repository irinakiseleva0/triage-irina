
import OpenAI from "openai";
import { llm, model } from "../../../lib/llm";
import {
  TRIAGE_SYSTEM_PROMPT,
  PROMPT_VERSION,
} from "../../../lib/prompt";
import { TriageSchema } from "../../../lib/schema";

class LlmInvalidOutputError extends Error {}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("ticket" in body) ||
    typeof body.ticket !== "object" ||
    body.ticket === null ||
    !("subject" in body.ticket) ||
    typeof body.ticket.subject !== "string" ||
    !("body" in body.ticket) ||
    typeof body.ticket.body !== "string" ||
    !body.ticket.subject.trim() ||
    !body.ticket.body.trim()
  ) {
    return Response.json(
      { error: "Invalid ticket." },
      { status: 400 }
    );
  }

  const ticket = body.ticket as {
    subject: string;
    body: string;
  };

  const ticketText = `${ticket.subject}\n\n${ticket.body}`;

  if (ticketText.length > 5000) {
    return Response.json(
      { error: "Ticket is too long." },
      { status: 400 }
    );
  }

  try {
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

    return Response.json({
      ...parsed.data,
      promptVersion: PROMPT_VERSION,
    });
  } catch (error) {
    console.error("TRIAGE ERROR:", error);

    if (error instanceof LlmInvalidOutputError) {
      return Response.json(
        { error: "invalid_model_output" },
        { status: 502 }
      );
    }

    if (error instanceof OpenAI.APIError) {
      if (error.status === 429) {
        return Response.json(
          { error: "rate_limited" },
          { status: 429 }
        );
      }

      if (error.status === 408) {
        return Response.json(
          { error: "triage_timeout" },
          { status: 504 }
        );
      }

      if (error.status === undefined || error.status >= 500) {
        return Response.json(
          { error: "triage_unavailable" },
          { status: 502 }
        );
      }
    }

    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      return Response.json(
        { error: "triage_timeout" },
        { status: 504 }
      );
    }

    return Response.json(
      { error: "internal_error" },
      { status: 500 }
    );
  }
}
