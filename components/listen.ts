// One-shot voice input with the browser's SpeechRecognition (Chrome, Edge,
// Safari). Where it is missing, the UI falls back to a typed question.

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
      return "I didn't hear anything. Tap Ask and try again.";
    case "not-allowed":
      return "I can't use the microphone. Allow microphone access, or type your question.";
    case "unsupported":
      return "Voice input isn't available in this browser. You can type your question instead.";
    case "aborted":
      return "Stopped listening.";
    default:
      return "I didn't catch that. Tap Ask and try again.";
  }
}

export function listenOnce(signal?: AbortSignal, timeoutMs = 9000): Promise<string> {
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
  | { kind: "guide" }
  | { kind: "question"; text: string };

/** Maps what was heard to a command. Anything unrecognized is a follow-up question. */
export function parseCommand(heard: string): VoiceCommand {
  const t = heard.toLowerCase().replace(/[.!?,]/g, "").trim();
  if (/^(stop|quiet|be quiet|cancel|stop talking)$/.test(t)) return { kind: "stop" };
  if (/^(repeat|again|repeat that|say (that|it) again|what did you say)$/.test(t)) return { kind: "repeat" };
  if (/^(more|tell me more|more details?|go on|keep going)$/.test(t)) return { kind: "more" };
  if (/^(guide me|guide|help me aim|aim|help me point|where should i point)$/.test(t)) return { kind: "guide" };
  if (
    /^(describe|describe this|describe it|look|what is this|whats this|what's this|what is that|what am i looking at|new photo|take a (photo|picture))$/.test(
      t,
    )
  )
    return { kind: "describe" };
  return { kind: "question", text: heard.trim() };
}
