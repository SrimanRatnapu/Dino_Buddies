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
  | { kind: "tour" }
  | { kind: "visited" }
  | { kind: "newVisit" }
  /**
   * An earlier exhibit, by name or order ("go back to the T. rex", "the last one").
   * `nav` is true for words that only make sense about an earlier exhibit ("go back
   * to"), false for words that may just be a question ("tell me about its teeth").
   */
  | { kind: "recall"; query: string; nav: boolean; text: string }
  | { kind: "question"; text: string };

/** What the app says when asked for help. Short enough to remember. */
export const HELP_TEXT =
  "Say I am here, and I'll lead you from exhibit to exhibit. " +
  "Or point your phone at an exhibit and say: what's this. " +
  "Say help me aim, and I'll tell you which way to turn first. " +
  "After a description, ask any question, or say tell me more, or repeat. " +
  "Say what have I seen to hear the exhibits you've visited, or new visit to clear the list. " +
  "To hear more about one you saw earlier, say go back to, and its name. " +
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
    /^(pause|goodbye|bye|bye bye|stop listening|that's all|thats all|that is all|thanks|thank you|go to sleep|sleep|never mind|nevermind|i'm done|im done|(end|stop|exit|finish) (the )?tour|pause (the )?tour)$/.test(
      t,
    )
  )
    return { kind: "pause" };
  if (/^(help|what can i say|what can you do|commands|how does this work|options)$/.test(t)) return { kind: "help" };
  if (
    /^(what have (i|we) (seen|visited)( so far)?|what did (i|we) see|where have (i|we) been|(list|read)( me)?( my| the)? (exhibits|list)|my list|what's on my list|whats on my list|what is on my list|which exhibits have (i|we) (seen|visited))$/.test(
      t,
    )
  )
    return { kind: "visited" };
  if (/^(new visit|start a new visit|start over|clear (my |the )?list|forget (everything|my list|the list))$/.test(t))
    return { kind: "newVisit" };
  if (/^((talk|speak|go) )?(slower|more slowly|slow down)$/.test(t)) return { kind: "slower" };
  if (/^((talk|speak|go) )?(faster|quicker|more quickly|speed up)$/.test(t)) return { kind: "faster" };
  if (/^(repeat|again|repeat that|say (that|it) again|what did you say|pardon|sorry)$/.test(t)) return { kind: "repeat" };
  if (/^(more|tell me more|more details?|go on|keep going|and|what else)$/.test(t)) return { kind: "more" };
  // An earlier exhibit. "Tell me more about it" is the current one, so it stays "more".
  const nav =
    /^(?:(?:let's |lets |can we |can you |i want to )?go back to|back to|return to|remind me (?:about|of)|what did you (?:say|tell me) about|what was (?:that|the) (?:thing )?about)\s+(.+)$/.exec(
      t,
    );
  const ask =
    /^(?:(?:can you |could you )?tell me (?:more |again )?about|more about|what about|(?:i want to |i'd like to |id like to )?(?:hear|know) more about|how about)\s+(.+)$/.exec(
      t,
    );
  const order = /^(?:the )?(?:last|previous|first|other) (?:one|exhibit)(?: again)?$|^(?:the )?one before(?: this)?$/.test(t);
  const target = (nav ?? ask)?.[1]?.trim();
  if (target && /^(it|this|that|this one|that one|this exhibit|that exhibit|him|her|them)$/.test(target)) return { kind: "more" };
  if (nav && target) return { kind: "recall", query: target, nav: true, text: heard.trim() };
  if (order) return { kind: "recall", query: t, nav: true, text: heard.trim() };
  if (ask && target) return { kind: "recall", query: target, nav: false, text: heard.trim() };
  if (/^(guide me|guide|help me aim|aim|help me point|where should i point|help me find it)$/.test(t)) return { kind: "guide" };
  if (
    /^(i am here|i'm here|im here|we're here|were here|we are here|start (the )?tour|tour|tour mode|explore|let's explore|lets explore|show me around|take me around|start exploring|what's around me|whats around me|what is around me)$/.test(
      t,
    )
  )
    return { kind: "tour" };
  if (
    /^(describe|describe (this|it|that)|look|look at (this|that)|what is (this|that|it)|whats (this|that)|what's (this|that)|what am i looking at|what do you see|what can you see|what's in front of me|whats in front of me|what is in front of me|new photo|take a (photo|picture)|take another( one)?|another one|next|next one)$/.test(
      t,
    )
  )
    return { kind: "describe" };
  return { kind: "question", text: heard.trim() };
}

/** A spoken answer to a yes-or-no question, or null if it was something else. */
export function parseYesNo(heard: string): "yes" | "no" | null {
  const t = heard.toLowerCase().replace(/[.!?,]/g, "").trim();
  if (/^(yes|yeah|yep|yup|sure|ok|okay|please|yes please|go ahead|go on|tell me|tell me more|sounds good|why not|of course|definitely)$/.test(t)) return "yes";
  if (/^(no|nope|nah|no thanks|no thank you|not now|not really|never mind|nevermind|skip|skip it|that's ok|thats ok|i'm good|im good)$/.test(t)) return "no";
  return null;
}
