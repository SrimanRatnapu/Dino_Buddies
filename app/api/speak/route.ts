import { synthesize, TtsError, ttsKey } from "@/lib/tts/google";
import { synthesizeGemini } from "@/lib/tts/gemini";
import { geminiConfigured, SPEAK_ENGINE } from "@/lib/gemini/config";
import { mapError } from "@/lib/gemini/client";
import { errorJson, rateLimitedJson } from "@/lib/http/errors";
import { rateLimit } from "@/lib/http/rateLimit";

/** Longest text accepted. The app's longest reply ("tell me more") is about 1000 characters. */
const MAX_TEXT_CHARS = 2000;
const TIMEOUT_MS = 12000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

function audioResponse(audio: Buffer, contentType: string, engine: string) {
  return new Response(new Uint8Array(audio), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "Content-Length": String(audio.length),
      "X-Voice": engine,
    },
  });
}

/**
 * POST { text } -> audio bytes (audio/wav from the Gemini voice, or audio/mpeg
 * from Cloud Text-to-Speech). Any non-200 means "use speechSynthesis": the
 * app must never depend on this endpoint for the demo to work.
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

  const useGemini = SPEAK_ENGINE !== "cloud" && geminiConfigured();
  const useCloud = Boolean(ttsKey());
  if (!useGemini && !useCloud) return errorJson("not_configured", "Cloud voice isn't set up.");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    if (useGemini) {
      try {
        const out = await synthesizeGemini(text, ctrl.signal);
        return audioResponse(out.audio, out.contentType, `gemini:${out.model}`);
      } catch (err) {
        if (ctrl.signal.aborted) return errorJson("timeout");
        const failure = mapError(err);
        console.warn(`[speak] gemini voice failed (${failure.code}): ${failure.message.slice(0, 200)}`);
        if (!useCloud) {
          return failure.code === "rate_limited" ? errorJson("rate_limited") : errorJson(failure.code, "Cloud voice failed.");
        }
      }
    }
    const audio = await synthesize(text, ctrl.signal);
    return audioResponse(audio, "audio/mpeg", "cloud-tts");
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
