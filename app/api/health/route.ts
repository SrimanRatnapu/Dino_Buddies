import { GEMINI_MODEL, GCP_LOCATION, GCP_PROJECT, SPEAK_ENGINE, SPEAK_MODELS, SPEAK_VOICE, USE_VERTEX, geminiConfigured, isMock } from "@/lib/gemini/config";
import { ttsKey, TTS_VOICE } from "@/lib/tts/google";
import { CONTRACT_VERSION } from "@/shared/contract";

export const dynamic = "force-dynamic";

/** Quick check for A and for deploys. Never reveals keys. */
export function GET() {
  return Response.json({
    ok: true,
    contract: CONTRACT_VERSION,
    mock: isMock(),
    model: GEMINI_MODEL,
    gemini_auth: USE_VERTEX ? "vertex-adc" : "api-key",
    gemini_ready: geminiConfigured(),
    gemini_key: Boolean(process.env.GEMINI_API_KEY),
    ...(USE_VERTEX ? { vertex_project: GCP_PROJECT, vertex_location: GCP_LOCATION } : {}),
    tts: Boolean(ttsKey()),
    voice:
      SPEAK_ENGINE !== "cloud" && geminiConfigured()
        ? `gemini (${SPEAK_VOICE}; tries ${SPEAK_MODELS.join(", ")})`
        : ttsKey()
          ? "cloud-tts"
          : "browser",
    tts_voice: TTS_VOICE,
  });
}
