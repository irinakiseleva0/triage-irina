import {
  TriageRequestSchema,
  TriageResponseSchema,
} from "../../../lib/schema";
import { mapStrategyError, runStrategy } from "../../../lib/strategy";

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
    const { result, usage, model, promptVersion, confidence } = await runStrategy(
      requestParsed.data.ticket, requestParsed.data.strategy,
    );
    const responseParsed = TriageResponseSchema.safeParse({
      ...result,
      promptVersion,
      model,
      usage,
      confidence,
      strategy: requestParsed.data.strategy,
    });

    if (!responseParsed.success) {
      return Response.json(
        { error: "invalid_model_output" },
        { status: 502 }
      );
    }

    return Response.json(responseParsed.data);
  } catch (error) {
    const mapped = mapStrategyError(error);
    console.error("Triage failed", { outcome: mapped.error });
    return Response.json({ error: mapped.error }, { status: mapped.status });
  }
}
