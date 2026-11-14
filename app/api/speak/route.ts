import { synthesize, TtsError } from "@/lib/tts/google";
import { errorJson, rateLimitedJson } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rateLimit";

/** Longest text accepted. The app's longest reply ("tell me more") is about 1000 characters. */
const MAX_TEXT_CHARS = 2000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { text } -> audio/mpeg. Any non-200 means "use speechSynthesis".
 * A must never depend on this endpoint for the demo to work.
 */
export async function POST(request: Request) {
  const wait = rateLimit("speak", request);
  if (wait) return rateLimitedJson(wait);

  let text = "";
  try {
    const body = await request.json();
    text = typeof body?.text === "string" ? body.text.trim() : "";
  } catch {
    /* fallthrough */
  }
  if (!text) return errorJson("bad_request", "There was nothing to say.");
  if (text.length > MAX_TEXT_CHARS) return errorJson("bad_request", "That was too long to read aloud.");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const audio = await synthesize(text, ctrl.signal);
    return new Response(new Uint8Array(audio), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "Content-Length": String(audio.length) },
    });
  } catch (err) {
    if (err instanceof TtsError && err.status === 503) return errorJson("not_configured", "Cloud voice isn't set up.");
    if (err instanceof TtsError && err.status === 429) return errorJson("rate_limited");
    if (err instanceof Error && err.name === "AbortError") return errorJson("timeout");
    console.warn("[speak] failed", err instanceof Error ? err.message : err);
    return errorJson("model_error", "Cloud voice failed.");
  } finally {
    clearTimeout(timer);
  }
}
