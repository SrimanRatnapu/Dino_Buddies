// Voice input with the browser's SpeechRecognition (Chrome, Edge, Safari).
// The app runs it as a conversation: one listenOnce() per turn, reopened after
// each spoken reply. Where it is missing, the UI falls back to a typed question.

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => RecognitionLike;

function ctor(): RecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function recognitionSupported(): boolean {
  return !!ctor();
}

export class ListenError extends Error {
  constructor(public code: "no-speech" | "not-allowed" | "aborted" | "unsupported" | "failed") {
    super(code);
  }
}

/** Speakable sentence for a listening failure. */
export function listenErrorMessage(err: unknown): string {
  const code = err instanceof ListenError ? err.code : "failed";
  switch (code) {
    case "no-speech":
      return "I didn't hear anything. Tap the screen and try again.";
    case "not-allowed":
      return "I can't use the microphone. Allow microphone access, or type your question.";
    case "unsupported":
      return "Voice input isn't available in this browser. You can type your question instead.";
    case "aborted":
      return "Stopped listening.";
    default:
      return "I didn't catch that. Tap the screen and try again.";
  }
}

export function listenOnce(signal?: AbortSignal, timeoutMs = 8000): Promise<string> {
  const Ctor = ctor();
  if (!Ctor) return Promise.reject(new ListenError("unsupported"));
  return new Promise<string>((resolve, reject) => {
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => {
      rec.abort();
      settle(() => reject(new ListenError("aborted")));
    };
    const timer = setTimeout(() => {
      rec.abort();
      settle(() => reject(new ListenError("no-speech")));
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort);
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript?.trim() ?? "";
      settle(() => (text ? resolve(text) : reject(new ListenError("no-speech"))));
    };
    rec.onerror = (e) => {
      const code =
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "not-allowed"
          : e.error === "no-speech"
            ? "no-speech"
            : e.error === "aborted"
              ? "aborted"
              : "failed";
      settle(() => reject(new ListenError(code)));
    };
    rec.onend = () => settle(() => reject(new ListenError("no-speech")));
    try {
      rec.start();
    } catch {
      settle(() => reject(new ListenError("failed")));
    }
  });
}

export type VoiceCommand =
  | { kind: "describe" }
  | { kind: "more" }
  | { kind: "repeat" }
  | { kind: "stop" }
  | { kind: "pause" }
  | { kind: "help" }
  | { kind: "slower" }
  | { kind: "faster" }
  | { kind: "guide" }
  | { kind: "question"; text: string };

/** What the app says when asked for help. Short enough to remember. */
export const HELP_TEXT =
  "Point your phone at an exhibit and say: what's this. " +
  "Say help me aim, and I'll tell you which way to turn first. " +
  "After a description, ask any question, or say tell me more, or repeat. " +
  "Say slower or faster to change my voice. Say pause when you're done, and tap the screen to wake me.";

/** Maps what was heard to a command. Anything unrecognized is a follow-up question. */
export function parseCommand(heard: string): VoiceCommand {
  const t = heard
    .toLowerCase()
    .replace(/[.!?,]/g, "")
    .replace(/^(please|okay|ok|hey|um|uh)\s+/, "")
    .replace(/\s+please$/, "")
    .trim();
  if (/^(stop|quiet|be quiet|cancel|stop talking|shh|hush)$/.test(t)) return { kind: "stop" };
  if (
    /^(pause|goodbye|bye|bye bye|stop listening|that's all|thats all|that is all|thanks|thank you|go to sleep|sleep|never mind|nevermind|i'm done|im done)$/.test(
      t,
    )
  )
    return { kind: "pause" };
  if (/^(help|what can i say|what can you do|commands|how does this work|options)$/.test(t)) return { kind: "help" };
  if (/^((talk|speak|go) )?(slower|more slowly|slow down)$/.test(t)) return { kind: "slower" };
  if (/^((talk|speak|go) )?(faster|quicker|more quickly|speed up)$/.test(t)) return { kind: "faster" };
  if (/^(repeat|again|repeat that|say (that|it) again|what did you say|pardon|sorry)$/.test(t)) return { kind: "repeat" };
  if (/^(more|tell me more|more details?|go on|keep going|and|what else)$/.test(t)) return { kind: "more" };
  if (/^(guide me|guide|help me aim|aim|help me point|where should i point|help me find it)$/.test(t)) return { kind: "guide" };
  if (
    /^(describe|describe (this|it|that)|look|look at (this|that)|what is (this|that|it)|whats (this|that)|what's (this|that)|what am i looking at|what do you see|what can you see|what's in front of me|whats in front of me|what is in front of me|new photo|take a (photo|picture)|take another( one)?|another one|next|next one)$/.test(
      t,
    )
  )
    return { kind: "describe" };
  return { kind: "question", text: heard.trim() };
}
