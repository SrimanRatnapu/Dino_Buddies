/**
 * Gemini text-to-speech: a natural AI voice for /api/speak. Uses the same
 * client as describe and aim (API key or Vertex AI with ADC). Gemini returns
 * raw 16-bit PCM, which is wrapped in a WAV header so any browser can play it.
 */
import { ApiError, Modality } from "@google/genai";
import { getClient } from "@/lib/gemini/client";
import { SPEAK_MODELS, SPEAK_VOICE } from "@/lib/gemini/config";
import { speakPrompt } from "@/prompts/speak";

export interface SpokenAudio {
  audio: Buffer;
  contentType: string;
  model: string;
}

/** Wraps mono 16-bit little-endian PCM in a WAV header. */
export function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** The first model that worked; tried first from then on. */
let workingModel: string | null = null;

/** A model this project can't use (wrong name, not offered, or no access): try the next one. */
function modelUnavailable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status === 404) return true;
  // A 403 is a project permission problem: no other model will work either.
  return err.status === 400 && /model .*(not found|not supported)|unsupported model|not supported for/i.test(err.message);
}

async function generate(model: string, text: string, signal?: AbortSignal) {
  return getClient().models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: speakPrompt(text) }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: SPEAK_VOICE } } },
      abortSignal: signal,
    },
  });
}

export async function synthesizeGemini(text: string, signal?: AbortSignal): Promise<SpokenAudio> {
  const order = workingModel ? [workingModel, ...SPEAK_MODELS.filter((m) => m !== workingModel)] : SPEAK_MODELS;
  let lastErr: unknown;
  for (const model of order) {
    let res;
    try {
      res = await generate(model, text, signal);
    } catch (err) {
      if (signal?.aborted || !modelUnavailable(err)) throw err;
      console.warn(`[speak] ${model} unavailable (${(err as ApiError).status}), trying the next voice model`);
      lastErr = err;
      continue;
    }
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    const data = part?.inlineData?.data;
    if (!data) throw new Error(`no audio from ${model}, finish=${res.candidates?.[0]?.finishReason}`);
    if (workingModel !== model) console.info(`[speak] using voice model ${model}`);
    workingModel = model;
    const mime = (part.inlineData?.mimeType ?? "").toLowerCase();
    const bytes = Buffer.from(data, "base64");
    // Usually "audio/L16;codec=pcm;rate=24000"; pass through anything already playable.
    if (/wav|mpeg|mp3|ogg/.test(mime)) return { audio: bytes, contentType: mime.split(";")[0], model };
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1]) || 24000;
    return { audio: pcmToWav(bytes, rate), contentType: "audio/wav", model };
  }
  throw lastErr ?? new Error("no voice model available");
}
