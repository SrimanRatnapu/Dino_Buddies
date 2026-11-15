// Spoken output. Browser speechSynthesis is the baseline and always works
// offline. The AI voice (Gemini text-to-speech, or Cloud TTS, via POST
// /api/speak) is an upgrade: long answers are fetched a few sentences at a
// time so the first plays quickly, short phrases are cached so they play
// instantly after the first time, and any failure falls back to the browser.

/** First piece of a long answer: waiting longer than this is worse than the robot voice. */
const FIRST_PIECE_TIMEOUT_MS = 10000;
const LATER_PIECE_TIMEOUT_MS = 15000;
/** Long answers are sent in pieces of about this many characters (whole sentences). */
const PIECE_CHARS = 240;
/** The first piece is kept short (about one sentence) so the voice starts sooner. */
const FIRST_PIECE_CHARS = 120;
/** Short lines (cues, aiming instructions) wait less for the AI voice than long answers. */
const SHORT_PHRASE_CHARS = 160;
const SHORT_WAIT_MS = 4000;
/** Memory budget for fetched audio (answer pieces can be ~1 MB of WAV each). */
const CACHE_MAX_BYTES = 20 * 1024 * 1024;
/**
 * Saved AI audio (Cache Storage) survives reloads, so common phrases are ready
 * instantly on the next visit. Keys include the voice id from GET /api/speak,
 * so changing the voice never plays old audio.
 */
const SAVED_CACHE = "wd-voice-v1";

let token = 0;
let audio: HTMLAudioElement | null = null;
/** The AI voice is skipped until this time (ms since epoch). Infinity = for the session. */
let cloudOffUntil = 0;
const CLOUD_RETRY_MS = 120_000;
/** Audio already fetched, by exact text: Repeat and common phrases play instantly. */
const cache = new Map<string, Blob>();
const inFlight = new Map<string, Promise<Blob | null>>();
let cacheBytes = 0;
/**
 * Fixed phrases (from prepareVoice) are the only audio saved across visits:
 * answers are one-off and would fill the phone's storage.
 */
const fixedTexts = new Set<string>();
/** The server's voice id ("gemini:Kore"), or null when it has no AI voice. Undefined until asked. */
let voiceId: string | null | undefined;
let voiceIdPromise: Promise<string | null> | null = null;

function getVoiceId(): Promise<string | null> {
  if (voiceId !== undefined) return Promise.resolve(voiceId);
  voiceIdPromise ??= fetch("/api/speak", { method: "GET" })
    .then((r) => (r.ok ? r.json() : { voice: null }))
    .then((j: { voice?: string | null }) => {
      voiceId = typeof j?.voice === "string" ? j.voice : null;
      if (!voiceId) cloudOffUntil = Infinity; // no AI voice configured: don't wait for one
      return voiceId;
    })
    .catch(() => {
      voiceIdPromise = null; // offline: try again later
      return null;
    });
  return voiceIdPromise;
}

function savedKey(id: string, text: string): string {
  // FNV-1a hash keeps the key short; the text itself is also in the URL for safety against collisions.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return `/__voice/${encodeURIComponent(id)}/${h.toString(36)}?t=${encodeURIComponent(text.slice(0, 200))}`;
}

async function readSaved(text: string): Promise<Blob | null> {
  if (!fixedTexts.has(text)) return null;
  try {
    const id = await getVoiceId();
    if (!id || typeof caches === "undefined") return null;
    const hit = await (await caches.open(SAVED_CACHE)).match(savedKey(id, text));
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

async function writeSaved(text: string, blob: Blob): Promise<void> {
  if (!fixedTexts.has(text)) return;
  try {
    const id = await getVoiceId();
    if (!id || typeof caches === "undefined") return;
    await (await caches.open(SAVED_CACHE)).put(savedKey(id, text), new Response(blob, { headers: { "Content-Type": blob.type } }));
  } catch {
    /* storage full or unavailable: the in-memory cache still works */
  }
}

function remember(text: string, blob: Blob) {
  const old = cache.get(text);
  if (old) cacheBytes -= old.size;
  cache.delete(text);
  cache.set(text, blob);
  cacheBytes += blob.size;
  // Drop the oldest, but keep fixed phrases (small, and used all the time).
  for (const [k, b] of cache) {
    if (cacheBytes <= CACHE_MAX_BYTES) break;
    if (fixedTexts.has(k) || k === text) continue;
    cache.delete(k);
    cacheBytes -= b.size;
  }
}

/**
 * Fetches the AI voice for fixed phrases in the background (no tap needed), so
 * the first time they're said they already sound like the rest. Two at a time.
 */
export async function prepareVoice(texts: string[]): Promise<void> {
  if (typeof window === "undefined") return;
  if (!(await getVoiceId())) return;
  const all = [...new Set(texts.flatMap((t) => pieces(t)))];
  all.forEach((t) => fixedTexts.add(t));
  const queue = all.filter((t) => !cache.has(t));
  const worker = async () => {
    for (let t = queue.shift(); t !== undefined && cloudUsable(); t = queue.shift()) {
      await fetchAudio(t, LATER_PIECE_TIMEOUT_MS);
    }
  };
  await Promise.all([worker(), worker()]);
}

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
let synthUnlocked = false;

export function unlockSpeech(): void {
  if (typeof window === "undefined") return;
  // iOS only lets speechSynthesis talk after it has spoken inside a tap. The
  // phone-voice fallback now runs after waiting for the AI voice (outside the
  // tap), so unlock it here with a silent utterance.
  if (!synthUnlocked && window.speechSynthesis) {
    synthUnlocked = true;
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  }
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
  /** Kept for callers; every line now uses the AI voice when it's available. */
  cloud?: boolean;
  rate?: number;
}

const cloudUsable = () => Date.now() >= cloudOffUntil;

/** Speak text, interrupting anything already playing. Resolves when done or stopped. */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  stopSpeaking();
  const my = token;
  const rate = opts.rate ?? 1;
  if (!text.trim()) return;
  // One voice throughout: every line uses the AI voice when there is one,
  // waiting a little for it rather than switching to the phone's voice.
  if (cloudUsable() && (await getVoiceId())) {
    if (my !== token) return;
    if (await speakCloud(text, my, rate)) return;
    if (my !== token) return;
  }
  await speakBrowser(text, my, rate);
}

/** Groups sentences into pieces of about PIECE_CHARS; the first is shorter. */
function pieces(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const sentence of chunks(text)) {
    const limit = out.length === 0 ? FIRST_PIECE_CHARS : PIECE_CHARS;
    if (cur && cur.length + sentence.length + 1 > limit) {
      out.push(cur);
      cur = sentence;
    } else {
      cur = cur ? `${cur} ${sentence}` : sentence;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Resolves with the promise's value, or null if it takes longer than ms (the work carries on). */
function within<T>(p: Promise<T | null>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    });
  });
}

/** Fetches (or reuses) the AI voice for one piece of text. Null on any failure. */
function fetchAudio(text: string, timeoutMs: number): Promise<Blob | null> {
  const hit = cache.get(text);
  if (hit) return Promise.resolve(hit);
  const pending = inFlight.get(text);
  if (pending) return pending;
  const p = (async () => {
    const saved = await readSaved(text);
    if (saved) {
      remember(text, saved);
      inFlight.delete(text);
      return saved;
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("audio/")) {
        // Not built (404/501) or not configured (503): skip for the session.
        // Upstream failure (502) or a non-audio reply: skip for a while.
        // Anything else (too long, rate limited, timeout) affects only this one.
        if ([404, 501, 503].includes(res.status)) cloudOffUntil = Infinity;
        else if (res.status === 502 || res.ok) cloudOffUntil = Date.now() + CLOUD_RETRY_MS;
        return null;
      }
      const blob = await res.blob();
      remember(text, blob);
      void writeSaved(text, blob);
      return blob;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      inFlight.delete(text);
    }
  })();
  inFlight.set(text, p);
  return p;
}

/**
 * Plays text in the AI voice, a few sentences at a time, fetching the next
 * piece while the current one plays. Returns false if the first piece can't
 * be had (the caller then uses the browser voice); later failures finish the
 * rest in the browser voice.
 */
async function speakCloud(text: string, my: number, rate: number): Promise<boolean> {
  const parts = pieces(text);
  const fetched: Array<Promise<Blob | null>> = [];
  // The first piece is what the listener waits on: short lines wait less before
  // giving up on the AI voice (the fetch carries on and is ready next time).
  const firstWait = text.length <= SHORT_PHRASE_CHARS ? SHORT_WAIT_MS : FIRST_PIECE_TIMEOUT_MS;
  const get = (i: number) =>
    (fetched[i] ??=
      i === 0
        ? within(fetchAudio(parts[0], LATER_PIECE_TIMEOUT_MS), firstWait)
        : fetchAudio(parts[i], LATER_PIECE_TIMEOUT_MS));
  get(0);
  if (parts.length > 1) get(1);
  for (let i = 0; i < parts.length; i++) {
    const blob = await get(i);
    if (my !== token) return true;
    if (i + 2 < parts.length) get(i + 2);
    const ok = blob ? await playBlob(blob, my, rate) : false;
    if (my !== token) return true;
    if (!ok) {
      if (i === 0) return false;
      await speakBrowser(parts.slice(i).join(" "), my, rate);
      return true;
    }
  }
  return true;
}

function playBlob(blob: Blob, my: number, rate = 1): Promise<boolean> {
  if (!audio) {
    audio = new Audio();
    audio.setAttribute("playsinline", "");
  }
  const el = audio;
  const url = URL.createObjectURL(blob);
  el.src = url;
  // "Slower" and "faster" apply to the AI voice too, without changing its pitch.
  el.playbackRate = rate;
  el.preservesPitch = true;
  return new Promise<boolean>((resolve) => {
    let watch = 0;
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
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

/** A period that ends an initial ("T. rex") or a common abbreviation, not a sentence. */
const NOT_SENTENCE_END = /(?:^|[\s(])(?:[A-Z]|Mr|Mrs|Ms|Dr|St|Mt|Ft|vs|etc|approx|e\.g|i\.e|No)\.$/;

/**
 * Splits into sentences: long single utterances get cut off in some browsers.
 * Splits only at end punctuation followed by a space, so decimals ("12.5")
 * stay whole, and skips initials and abbreviations so "T. rex" isn't broken.
 */
export function chunks(text: string): string[] {
  const out: string[] = [];
  const end = /[.!?]+["”’)]*\s+/g;
  let start = 0;
  for (let m = end.exec(text); m; m = end.exec(text)) {
    const upToPunct = text.slice(start, m.index + 1);
    if (text[m.index] === "." && NOT_SENTENCE_END.test(upToPunct)) continue;
    out.push(text.slice(start, m.index + m[0].length).trim());
    start = m.index + m[0].length;
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
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
