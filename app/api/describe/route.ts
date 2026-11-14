import { describe } from "@/lib/gemini/describe";
import { isMock } from "@/lib/gemini/config";
import { parseDescribeRequest } from "@/lib/gemini/validate";
import { ApiFailure, errorJson, rateLimitedJson } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rateLimit";
import fixtures from "@/fixtures/describe.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Reject before reading the body. A 1024px JPEG in base64 is well under 1 MB. */
const MAX_BODY_BYTES = 8_000_000;

type FixtureName = "trex" | "giraffe" | "lowconf" | "error" | "followup";
const FIXTURES = fixtures as unknown as Record<FixtureName, { status: number; body: unknown }>;

async function mockResponse(url: URL, isFollowUp: boolean) {
  const picked = url.searchParams.get("fixture") as FixtureName | null;
  const name: FixtureName = picked === "error" ? "error" : isFollowUp ? "followup" : picked || "trex";
  const fx = FIXTURES[name] ?? FIXTURES.trex;
  // Optional fake latency so A can test the "looking now" cue.
  const delay = Number(process.env.MOCK_DELAY_MS || 0);
  if (delay > 0) await new Promise((r) => setTimeout(r, delay));
  return Response.json(fx.body, {
    status: fx.status,
    headers: { "Cache-Control": "no-store", "X-Mock": name },
  });
}

export async function POST(request: Request) {
  const wait = rateLimit("describe", request);
  if (wait) return rateLimitedJson(wait);
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return errorJson("image_too_large");

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return errorJson("bad_request");
  }

  try {
    // Validate in mock mode too, so request-shape bugs show up on day one.
    const parsed = parseDescribeRequest(raw);
    if (isMock()) return mockResponse(new URL(request.url), !!parsed.question);

    const { body, model, ms } = await describe(parsed);
    console.info(`[describe] ok model=${model} ms=${ms} followup=${!!parsed.question} conf=${body.confidence}`);
    return Response.json(body, {
      headers: { "Cache-Control": "no-store", "Server-Timing": `gemini;dur=${ms}`, "X-Model": model },
    });
  } catch (err) {
    if (err instanceof ApiFailure) {
      console.warn(`[describe] ${err.code}: ${err.message}`);
      return errorJson(err.code, err.spoken);
    }
    console.error("[describe] unexpected", err);
    return errorJson("model_error");
  }
}
