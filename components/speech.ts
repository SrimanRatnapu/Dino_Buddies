// Spoken output. Browser speechSynthesis is the baseline and always works
// offline; Google Cloud TTS via POST /api/speak is an optional upgrade that is
// tried first for long text and dropped silently if missing or slow.

const CLOUD_TIMEOUT_MS = 4000;

let token = 0;
let audio: HTMLAudioElement | null = null;
let cloudState: "unknown" | "available" | "missing" = "unknown";

/** A tiny silent WAV, used to unlock audio playback on iOS inside a tap. */
function silentWavUrl(): string {
  const samples = 800;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

/**
 * Call from inside a user gesture (tap or key press). iOS only allows audio
 * and speech that were first started from a gesture.
 */
export function unlockSpeech(): void {
  if (typeof window === "undefined") return;
  if (!audio) {
    audio = new Audio();
    audio.setAttribute("playsinline", "");
    audio.src = silentWavUrl();
    audio.play().catch(() => {});
  }
}

export function stopSpeaking(): void {
  token++;
  if (typeof window === "undefined") return;
  window.speechSynthesis?.cancel();
  if (audio && !audio.paused) audio.pause();
}

export interface SpeakOptions {
  /** Try Google Cloud TTS first. Use for descriptions, not short cues. */
  cloud?: boolean;
  rate?: number;
}

/** Speak text, interrupting anything already playing. Resolves when done or stopped. */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  stopSpeaking();
  const my = token;
  if (!text.trim()) return;
  if (opts.cloud && cloudState !== "missing") {
    const done = await speakCloud(text, my);
    if (done || my !== token) return;
  }
  await speakBrowser(text, my, opts.rate ?? 1);
}

async function speakCloud(text: string, my: number): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLOUD_TIMEOUT_MS);
  try {
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("audio/")) {
      if (res.status === 404 || res.status === 501) cloudState = "missing";
      return false;
    }
    const blob = await res.blob();
    if (my !== token) return true;
    cloudState = "available";
    return await playBlob(blob, my);
  } catch {
    clearTimeout(timer);
    return false;
  }
}

function playBlob(blob: Blob, my: number): Promise<boolean> {
  if (!audio) {
    audio = new Audio();
    audio.setAttribute("playsinline", "");
  }
  const el = audio;
  const url = URL.createObjectURL(blob);
  el.src = url;
  return new Promise<boolean>((resolve) => {
    let watch = 0;
    const finish = (ok: boolean) => {
      el.removeEventListener("ended", onEnd);
      el.removeEventListener("error", onErr);
      el.removeEventListener("pause", onEnd);
      window.clearInterval(watch);
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    const onEnd = () => finish(true);
    const onErr = () => finish(false);
    el.addEventListener("ended", onEnd);
    el.addEventListener("error", onErr);
    el.addEventListener("pause", onEnd);
    watch = window.setInterval(() => {
      if (my !== token) {
        el.pause();
        finish(true);
      }
    }, 150);
    el.play().catch(() => finish(false));
  });
}

let chosenVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (chosenVoice !== undefined) return chosenVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  if (!voices.length) return null; // not loaded yet; try again next time
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  chosenVoice =
    en.find((v) => v.lang === "en-US" && v.localService) ??
    en.find((v) => v.lang === "en-US") ??
    en[0] ??
    null;
  return chosenVoice;
}

/** Splits into sentences: long single utterances get cut off in some browsers. */
function chunks(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]*["”’)]*\s*/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
}

async function speakBrowser(text: string, my: number, rate: number): Promise<void> {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth) return;
  for (const part of chunks(text)) {
    if (my !== token) return;
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = "en-US";
      u.rate = rate;
      const voice = pickVoice();
      if (voice) u.voice = voice;
      // Safety net: some engines never fire `end` (or have no voices at all).
      const fallback = window.setTimeout(resolve, 2500 + part.length * 110);
      const done = () => {
        window.clearTimeout(fallback);
        resolve();
      };
      u.onend = done;
      u.onerror = done;
      synth.speak(u);
    });
  }
}
