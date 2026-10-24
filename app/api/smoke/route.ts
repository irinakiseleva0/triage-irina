import { runSmoke } from "../../../lib/smoke";
import { logSmokeRun } from "../../../lib/run-log";
import { SmokeRequestSchema, SmokeResponseSchema } from "../../../lib/smoke-schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = SmokeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  try {
    const result = SmokeResponseSchema.parse(await runSmoke(parsed.data));
    try {
      await logSmokeRun(result);
    } catch {
      console.error("Unable to log smoke run", { runId: result.summary.runId });
    }
    return Response.json(result);
  } catch {
    console.error("Smoke run failed");
    return Response.json({ error: "Unable to run smoke test. Please try again." }, { status: 500 });
  }
}
