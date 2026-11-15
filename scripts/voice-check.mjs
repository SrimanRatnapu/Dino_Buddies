// Diagnoses the Gemini voice. Usage (from the repo root, with the app running for step 3):
//   npm run voice-check
//   npm run voice-check -- --base=http://localhost:3000
// Step 1 shows the settings, step 2 asks each Gemini voice model directly with
// your credentials (API key or Vertex AI ADC) and saves the first working one
// as a WAV you can play, step 3 calls the app's own /api/speak.
import { GoogleGenAI, Modality } from "@google/genai";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith("--base=")) ?? "--base=http://localhost:3000").slice(7);
const env = process.env;
const vertex = /^(1|true)$/i.test(env.GOOGLE_GENAI_USE_VERTEXAI ?? "");
const voice = env.SPEAK_VOICE || "Kore";
const models = [
  ...new Set(
    [
      env.SPEAK_MODEL,
      env.SPEAK_FALLBACK_MODEL,
      "gemini-3.8-flash-tts",
      "gemini-3.8-flash-lite-tts",
      "gemini-3.1-flash-tts-preview",
      "gemini-2.5-flash-preview-tts",
      "gemini-2.5-flash-tts",
    ].filter(Boolean),
  ),
];
const TEXT = "Hello. This is a mounted Tyrannosaurus rex skeleton, about as long as a school bus.";

console.log("1. Settings");
console.log(`   auth:     ${vertex ? `Vertex AI with ADC, project=${env.GOOGLE_CLOUD_PROJECT || "(missing!)"}, location=${env.GOOGLE_CLOUD_LOCATION || "global"}` : `API key ${env.GEMINI_API_KEY ? "(set)" : "(missing!)"}`}`);
console.log(`   engine:   ${env.SPEAK_ENGINE || "gemini"}${(env.SPEAK_ENGINE || "gemini").toLowerCase() === "cloud" ? "  <- Gemini voice is switched off" : ""}`);
console.log(`   voice:    ${voice}`);
console.log(`   models:   ${models.join(", ")}`);

let ai;
try {
  ai = vertex
    ? new GoogleGenAI({ vertexai: true, project: env.GOOGLE_CLOUD_PROJECT, location: env.GOOGLE_CLOUD_LOCATION || "global" })
    : new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, apiVersion: "v1beta" });
} catch (err) {
  console.log(`   Could not create the Gemini client: ${err.message}`);
  process.exit(1);
}

function pcmToWav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

console.log("\n2. Each Gemini voice model, called directly");
let working = null;
for (const model of models) {
  const t = Date.now();
  try {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: `Read this aloud in a warm, calm voice:\n\n${TEXT}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    });
    const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    if (!part) {
      console.log(`   ${model.padEnd(30)} NO AUDIO (finish=${res.candidates?.[0]?.finishReason})`);
      continue;
    }
    const mime = part.inlineData.mimeType || "";
    const bytes = Buffer.from(part.inlineData.data, "base64");
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1]) || 24000;
    const wav = /wav/i.test(mime) ? bytes : pcmToWav(bytes, rate);
    console.log(`   ${model.padEnd(30)} OK in ${Date.now() - t} ms, ${(wav.length / 1024).toFixed(0)} KB (${mime})`);
    if (!working) {
      working = model;
      const file = join(tmpdir(), "wildlife-voice-check.wav");
      writeFileSync(file, wav);
      console.log(`   -> saved; listen with:  afplay ${file}   (Mac)`);
    }
  } catch (err) {
    const msg = String(err?.message ?? err).replace(/\s+/g, " ");
    console.log(`   ${model.padEnd(30)} FAILED ${err?.status ?? ""} in ${Date.now() - t} ms: ${msg.slice(0, 220)}`);
  }
}
if (!working) {
  console.log("\n   No voice model worked. The FAILED lines above say why:");
  console.log("   404 / not found: this project can't use that model name.");
  console.log("   403 / permission: enable the Vertex AI API (or Generative Language API for a key) on the project.");
  console.log("   429 / quota: wait a minute, or check the project's quota for text-to-speech models.");
  console.log("   402 / credits: the AI Studio project behind the key has no credit.");
  console.log("   credential / ADC: run `gcloud auth application-default login` (or the ADC setup script) again.");
}

console.log(`\n3. The app's /api/speak at ${base}`);
try {
  const t = Date.now();
  const res = await fetch(`${base}/api/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: TEXT }),
  });
  const type = res.headers.get("content-type") ?? "";
  if (res.ok && type.startsWith("audio/")) {
    const n = (await res.arrayBuffer()).byteLength;
    console.log(`   OK in ${Date.now() - t} ms: ${type}, ${(n / 1024).toFixed(0)} KB, voice=${res.headers.get("x-voice")}`);
    if (!String(res.headers.get("x-voice")).startsWith("gemini")) console.log("   (that's not the Gemini voice: see the server terminal for a [speak] line)");
  } else {
    console.log(`   ${res.status} in ${Date.now() - t} ms: ${(await res.text()).slice(0, 200)}`);
    console.log("   The server terminal shows the reason on a [speak] line.");
  }
} catch {
  console.log("   Couldn't reach the app. Start it (npm run dev) and run this again, or pass --base=<url>.");
}
