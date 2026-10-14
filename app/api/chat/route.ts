
import { llm, model } from "../../../lib/llm";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  // Validate the request body
  if (
    typeof body !== "object" ||
    body === null ||
    !("messages" in body) ||
    !Array.isArray(body.messages) ||
    body.messages.length === 0 ||
    !body.messages.every(
      (message: unknown) =>
        typeof message === "object" &&
        message !== null &&
        "role" in message &&
        (message.role === "user" || message.role === "assistant") &&
        "content" in message &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    ) ||
    body.messages[body.messages.length - 1].role !== "user"
  ) {
    return Response.json(
      { error: "Please provide valid chat messages." },
      { status: 400 },
    );
  }

  const messages = body.messages as ChatMessage[];

  try {
    if (!model) {
      throw new Error("LLM_MODEL is not configured.");
    }

    const completion = await llm.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful customer support assistant. Answer clearly and briefly.",
        },
        ...messages,
      ],
    });

    return Response.json({
      answer:
        completion.choices[0]?.message?.content ??
        "No response from the AI model.",
    });
  } catch (error) {
    console.error("========== LLM ERROR ==========");
    console.error(error);
    console.error("===============================");

    const message =
      error instanceof Error ? error.message : String(error);

    return Response.json(
      { error: message },
      { status: 502 }
    );
  }
}
