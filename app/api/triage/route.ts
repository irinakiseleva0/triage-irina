import { PROMPT_VERSION } from "../../../lib/prompt";
import {
  TriageRequestSchema,
  TriageResponseSchema,
} from "../../../lib/schema";
import { mapTriageError, triageTicket } from "../../../lib/triage";

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

  const requestParsed = TriageRequestSchema.safeParse(body);

  if (!requestParsed.success) {
    return Response.json(
      { error: requestParsed.error.issues[0].message },
      { status: 400 }
    );
  }

  try {
    const { result, usage, model } = await triageTicket(requestParsed.data.ticket);
    const responseParsed = TriageResponseSchema.safeParse({
      ...result,
      promptVersion: PROMPT_VERSION,
      model,
      usage,
    });

    if (!responseParsed.success) {
      return Response.json(
        { error: "invalid_model_output" },
        { status: 502 }
      );
    }

    return Response.json(responseParsed.data);
  } catch (error) {
    console.error("TRIAGE ERROR:", error);
    const mapped = mapTriageError(error);
    return Response.json({ error: mapped.error }, { status: mapped.status });
  }
}
