import { aim } from "@/lib/gemini/aim";
import { isMock } from "@/lib/gemini/config";
import { parseImage, parseSeen } from "@/lib/gemini/validate";
import { ApiFailure, errorJson, rateLimitedJson } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rateLimit";
import fixtures from "@/fixtures/aim.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** A 512px aiming frame is about 30-60 KB of base64. */
const MAX_BODY_BYTES = 2_000_000;
const MAX_IMAGE_CHARS = 1_500_000;

let mockStep = 0;

/** POST { image } -> AimResponse (contract v1.1). */
export async function POST(request: Request) {
  const wait = rateLimit("aim", request);
  if (wait) return rateLimitedJson(wait);
  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return errorJson("image_too_large");

  let raw: { image?: unknown; seen?: unknown } | null = null;
  try {
    raw = await request.json();
  } catch {
    return errorJson("bad_request");
  }

  try {
    const image = parseImage(raw?.image, MAX_IMAGE_CHARS);
    if (!image) throw new ApiFailure("bad_request", undefined, "missing image");

    if (isMock()) {
      const seq = fixtures.sequence;
      const body = seq[mockStep++ % seq.length];
      return Response.json(body, { headers: { "Cache-Control": "no-store", "X-Mock": "aim" } });
    }

    const seen = parseSeen(raw?.seen);
    const { body, model, ms } = await aim(image, seen);
    console.info(
      `[aim] ${body.status}${body.move !== "none" ? `:${body.move}` : ""}${body.already_seen ? " (already seen)" : ""} model=${model} ms=${ms}`,
    );
    return Response.json(body, {
      headers: { "Cache-Control": "no-store", "Server-Timing": `gemini;dur=${ms}`, "X-Model": model },
    });
  } catch (err) {
    if (err instanceof ApiFailure) {
      console.warn(`[aim] ${err.code}: ${err.message}`);
      return errorJson(err.code, err.spoken);
    }
    console.error("[aim] unexpected", err);
    return errorJson("model_error");
  }
}
