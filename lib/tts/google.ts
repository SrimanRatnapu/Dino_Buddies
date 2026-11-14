/**
 * Google Cloud Text-to-Speech via REST (no extra dependency).
 * Needs the Cloud Text-to-Speech API enabled on the key's project.
 * Uses GOOGLE_TTS_API_KEY, falling back to GEMINI_API_KEY (works only if that
 * key's project has the TTS API enabled and the key isn't restricted).
 */
const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const MAX_TEXT_BYTES = 4800; // API limit is 5000 bytes of input

export const TTS_VOICE = process.env.TTS_VOICE || "en-US-Neural2-F";
export const TTS_LANGUAGE = process.env.TTS_LANGUAGE || "en-US";
const SPEAKING_RATE = Number(process.env.TTS_SPEAKING_RATE || 1.0);

export class TtsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function ttsKey(): string | undefined {
  return process.env.GOOGLE_TTS_API_KEY || process.env.GEMINI_API_KEY;
}

function truncateBytes(text: string, max: number): string {
  const buf = Buffer.from(text, "utf8");
  if (buf.length <= max) return text;
  return buf.subarray(0, max).toString("utf8").replace(/�$/, "");
}

async function request(key: string, text: string, voiceName?: string, signal?: AbortSignal) {
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      input: { text },
      voice: voiceName ? { languageCode: TTS_LANGUAGE, name: voiceName } : { languageCode: TTS_LANGUAGE },
      audioConfig: { audioEncoding: "MP3", speakingRate: SPEAKING_RATE },
    }),
  });
  if (!res.ok) throw new TtsError(res.status, (await res.text()).slice(0, 300));
  const json = (await res.json()) as { audioContent?: string };
  if (!json.audioContent) throw new TtsError(502, "no audioContent");
  return Buffer.from(json.audioContent, "base64");
}

export async function synthesize(text: string, signal?: AbortSignal): Promise<Buffer> {
  const key = ttsKey();
  if (!key) throw new TtsError(503, "no TTS key");
  const input = truncateBytes(text, MAX_TEXT_BYTES);
  try {
    return await request(key, input, TTS_VOICE, signal);
  } catch (err) {
    // A bad voice name is a 400; retry once letting Google pick the voice.
    if (err instanceof TtsError && err.status === 400 && /voice/i.test(err.message)) {
      return request(key, input, undefined, signal);
    }
    throw err;
  }
}
