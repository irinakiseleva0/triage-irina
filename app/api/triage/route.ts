import { llm, model } from "../../../lib/llm";
import {
    TRIAGE_SYSTEM_PROMPT,
    PROMPT_VERSION,
} from "../../../lib/prompt";

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

    try {
        if (!model) {
            throw new Error("LLM_MODEL is not configured.");
        }

        const completion = await llm.chat.completions.create({
            model,
            messages: [
                {
                    role: "system",
                    content: TRIAGE_SYSTEM_PROMPT,
                },
                {
                    role: "user",
                    content: `<ticket>
${ticket.subject}

${ticket.body}
</ticket>`,
                },
            ],
        });

        const result = completion.choices[0]?.message?.content;

        if (!result) {
            throw new Error("Empty AI response.");
        }

        return Response.json({
            result,
            promptVersion: PROMPT_VERSION,
        });
    } catch (error) {
        console.error("TRIAGE ERROR:", error);

        return Response.json(
            { error: "Failed to analyze ticket." },
            { status: 502 }
        );
    }
}