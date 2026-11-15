"use client";

// Voice-first app. The person talks to it; the screen is a large status display
// and one big button. One tap starts a conversation: the app speaks, plays the
// listening tone, hears the next request, acts on it, speaks the answer and
// listens again, until the person says "pause" or stays silent twice.
//
// Every action below resolves only when its spoken reply has finished, so the
// conversation loop knows when to reopen the microphone. The microphone is
// never open while the app is speaking (it would hear itself); tapping the
// screen interrupts instead.

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { AimMove, DescribeRequest, DescribeSuccess } from "@/shared/contract";
import { guideToPhoto, instructionFor } from "./aimGuide";
import { CameraError, cameraSupportError, captureOnce, fileToBase64 } from "./camera";
import { cue, unlockCues } from "./cues";
import { clientMockEnabled, describeImage } from "./describeClient";
import {
  HELP_TEXT,
  ListenError,
  listenErrorMessage,
  listenOnce,
  parseCommand,
  recognitionSupported,
  type VoiceCommand,
} from "./listen";
import { speak, stopSpeaking, unlockSpeech } from "./speech";
import { spokenText, type ResultKind } from "./spokenText";

export const APP_NAME = "Wildlife Described";

/**
 * What the app is doing right now. "idle" means asleep: not listening, waiting
 * for a tap. Speaking is tracked separately because it overlaps "idle".
 */
type Phase = "idle" | "listening" | "capturing" | "guiding" | "looking";

interface Shown {
  result: DescribeSuccess;
  kind: ResultKind;
  question?: string;
}

interface AimView {
  text: string;
  move: AimMove;
  ready: boolean;
}

const WAIT_CUES: Record<ResultKind, string> = {
  describe: "Looking now.",
  more: "Getting more detail.",
  answer: "Let me check.",
};

const FIRST_GREETING =
  "Hi, I'm Wildlife Described. Point your phone at an exhibit and say: what's this. Say help any time.";
const GREETING = "I'm listening.";
const ASLEEP_LINE = "I'll wait. Tap the screen when you need me.";

/** Don't repeat the same aiming instruction more often than this. */
const REPEAT_INSTRUCTION_MS = 4000;
/** Silent turns in a row before the app stops listening by itself. */
const MAX_SILENT_TURNS = 2;
const RATES = [0.8, 0.9, 1, 1.15, 1.3];

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Visit memory: subjects described so far, oldest first. Kept for the browser
 * tab's lifetime (sessionStorage), so a reload mid-visit keeps it and a new
 * visit starts fresh. Sent to Gemini so it names repeats and guides to new things.
 */
const SEEN_KEY = "seen";
const MAX_SEEN = 8;

function readSeen(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-MAX_SEEN) : [];
  } catch {
    return [];
  }
}

function writeSeen(seen: string[]) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    /* storage unavailable: memory still works for this page */
  }
}

/** Result of one listening turn. */
type Heard = { kind: "text"; text: string } | { kind: "silence" } | { kind: "stopped" } | { kind: "unavailable" };

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const questionRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [talking, setTalking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [heard, setHeard] = useState("");
  const [shown, setShown] = useState<Shown | null>(null);
  const [errorText, setErrorText] = useState("");
  const [status, setStatus] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [typing, setTyping] = useState(false);
  const [mock, setMock] = useState(false);
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [aimView, setAimView] = useState<AimView | null>(null);

  // Values read after an await, where closure state could be stale.
  const imageRef = useRef<string | null>(null);
  const baseRef = useRef<DescribeSuccess | null>(null);
  const seenRef = useRef<string[]>([]);
  const shownRef = useRef<Shown | null>(null);
  const errorTextRef = useRef("");
  const voiceOnRef = useRef(true);
  const rateRef = useRef(1);
  const requestRef = useRef<AbortController | null>(null);
  const listenRef = useRef<AbortController | null>(null);
  const speakId = useRef(0);
  const captureRef = useRef<AbortController | null>(null);
  const guideRef = useRef<AbortController | null>(null);
  const takeNowRef = useRef<AbortController | null>(null);
  const lastInstruction = useRef({ text: "", at: 0 });
  const cameraProblemRef = useRef<string | null>(null);
  /** Bumped to end the running conversation loop. */
  const loopRef = useRef(0);
  const talkingRef = useRef(false);
  const phaseRef = useRef<Phase>("idle");
  const speakingRef = useRef(false);

  function go(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
  }

  useEffect(() => {
    const v = readPref("voiceOn");
    const on = v === null ? true : v === "1";
    setVoiceOn(on);
    voiceOnRef.current = on;
    const r = Number(readPref("rate"));
    if (RATES.includes(r)) rateRef.current = r;
    setMock(clientMockEnabled());
    seenRef.current = readSeen();
    if (!recognitionSupported()) setTyping(true);
    const unsupported = cameraSupportError();
    if (unsupported) {
      cameraProblemRef.current = unsupported.reason;
      setCameraProblem(unsupported.reason);
    }
    // Never leave the camera or microphone on if the page goes away.
    return () => {
      loopRef.current++;
      captureRef.current?.abort();
      guideRef.current?.abort();
      listenRef.current?.abort();
    };
  }, []);

  /* ---------------------------------------------------------------- speech */

  /** Polite screen-reader announcement; blanking first re-announces repeats. */
  function announce(text: string) {
    setStatus("");
    window.setTimeout(() => setStatus(text), 60);
  }

  /** Speak with the app's voice (resolves when done or interrupted), or hand to the screen reader. */
  async function say(text: string, opts: { cloud?: boolean } = {}) {
    if (!voiceOnRef.current) {
      announce(text);
      return;
    }
    const id = ++speakId.current;
    speakingRef.current = true;
    setSpeaking(true);
    try {
      // Cloud voice has its own fixed rate, so a changed rate uses the phone's voice.
      const rate = rateRef.current;
      await speak(text, { cloud: opts.cloud && rate === 1, rate });
    } finally {
      if (id === speakId.current) {
        speakingRef.current = false;
        setSpeaking(false);
      }
    }
  }

  function quiet() {
    speakId.current++;
    stopSpeaking();
    speakingRef.current = false;
    setSpeaking(false);
  }

  /** Must run inside every tap/key handler before any await (iOS audio rules). */
  function unlock() {
    unlockCues();
    unlockSpeech();
  }

  function showError(msg: string) {
    errorTextRef.current = msg;
    setErrorText(msg);
  }

  /* ---------------------------------------------------------------- actions
     Each resolves when its spoken reply has finished. */

  async function run(req: DescribeRequest, kind: ResultKind, question?: string, lead?: string) {
    requestRef.current?.abort();
    const ctrl = new AbortController();
    requestRef.current = ctrl;
    setTyping(!recognitionSupported());
    showError("");
    go("looking");
    void say(lead ? `${lead} ${WAIT_CUES[kind]}` : WAIT_CUES[kind]);
    const still = window.setTimeout(() => void say("Still looking."), 8000);

    const out = await describeImage(req, ctrl.signal);
    window.clearTimeout(still);
    if (ctrl.signal.aborted || requestRef.current !== ctrl) return;
    requestRef.current = null;
    go("idle");

    if (!out.ok) {
      cue.error();
      showError(out.error.message);
      await say(out.error.message);
      return;
    }
    cue.done();
    if (kind === "describe") remember(out.data.subject);
    if (kind === "describe" || !baseRef.current) baseRef.current = out.data;
    const next: Shown = { result: out.data, kind, question };
    shownRef.current = next;
    setShown(next);
    await say(spokenText(out.data, kind), { cloud: true });
  }

  /** Adds a described subject to the visit memory (most recent last, no duplicates). */
  function remember(subject: string) {
    const s = subject.trim();
    if (!s) return;
    const rest = seenRef.current.filter((x) => x.toLowerCase() !== s.toLowerCase());
    seenRef.current = [...rest, s].slice(-MAX_SEEN);
    writeSeen(seenRef.current);
  }

  async function sendImage(image: string, lead?: string) {
    imageRef.current = image;
    setPhotoUrl(`data:image/jpeg;base64,${image}`);
    baseRef.current = null;
    const seen = seenRef.current.length ? [...seenRef.current] : undefined;
    await run({ image, mode: "default", seen }, "describe", undefined, lead);
  }

  /**
   * Turns the camera on, takes one photo, turns it off. Returns null if
   * cancelled or if the camera failed (the failure is spoken and shown).
   */
  async function takePhoto(): Promise<string | null> {
    const video = videoRef.current;
    if (!video || captureRef.current) return null;
    const ctrl = new AbortController();
    captureRef.current = ctrl;
    showError("");
    go("capturing");
    void say("Hold still.");
    try {
      const frame = await captureOnce(video, ctrl.signal);
      if (!frame || ctrl.signal.aborted) return null;
      cue.capture();
      return frame;
    } catch (err) {
      if (ctrl.signal.aborted) return null;
      await cameraFailed(err);
      return null;
    } finally {
      if (captureRef.current === ctrl) captureRef.current = null;
      if (phaseRef.current === "capturing") go("idle");
    }
  }

  async function cameraFailed(err: unknown) {
    const reason = err instanceof CameraError ? err.reason : "The camera couldn't start.";
    cameraProblemRef.current = reason;
    setCameraProblem(reason);
    go("idle");
    cue.error();
    const msg = `${reason} Tap Choose a photo to use a picture instead.`;
    showError(msg);
    await say(msg);
  }

  /** "What's this": one photo, then the description. */
  async function describe(fromTap: boolean) {
    if (cameraProblemRef.current) {
      if (fromTap) fileRef.current?.click(); // the phone's camera app or photo picker
      else {
        cue.error();
        await say(`${cameraProblemRef.current} Tap Choose a photo to use a picture instead.`);
      }
      return;
    }
    const frame = await takePhoto();
    if (frame) await sendImage(frame);
  }

  /**
   * "Help me aim": keeps the camera on and speaks aiming instructions until the
   * exhibit is fully in view, then takes one photo and describes it.
   */
  async function guide(fromTap: boolean) {
    if (cameraProblemRef.current) return describe(fromTap);
    if (captureRef.current || guideRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    const stopCtrl = new AbortController();
    const takeNow = new AbortController();
    guideRef.current = stopCtrl;
    takeNowRef.current = takeNow;
    lastInstruction.current = { text: "", at: 0 };
    showError("");
    setAimView({ text: "Hold the phone up in front of you.", move: "none", ready: false });
    go("guiding");
    void say("Hold the phone up in front of you, and I'll help you aim. Tap the screen to take the photo yourself.");
    try {
      const result = await guideToPhoto(video, stopCtrl.signal, takeNow.signal, (aim, readyCount) => {
        const text = instructionFor(aim, readyCount);
        setAimView({ text, move: aim.move, ready: aim.status === "ready" });
        const last = lastInstruction.current;
        const now = Date.now();
        // "Already heard about" is a long sentence: repeat it less often than a short move.
        const repeatAfter = aim.already_seen ? REPEAT_INSTRUCTION_MS * 3 : REPEAT_INSTRUCTION_MS;
        if (text !== last.text || now - last.at > repeatAfter) {
          lastInstruction.current = { text, at: now };
          cue.nudge();
          void say(text);
        }
      }, [...seenRef.current]);
      if (stopCtrl.signal.aborted) return;
      if (!result) {
        // The camera stopped sending pictures (for example, another app took it).
        throw new CameraError("The camera stopped before I could take the photo.");
      }
      // Camera is off now; guiding is over even while the description loads.
      if (guideRef.current === stopCtrl) guideRef.current = null;
      if (takeNowRef.current === takeNow) takeNowRef.current = null;
      setAimView(null);
      cue.capture();
      const lead =
        result.how === "timeout" && result.lastWasSeen
          ? "I only found things you've already heard about, so I took the photo anyway."
          : result.how === "timeout"
          ? "I couldn't find a clear view, so I took the photo anyway."
          : result.how === "unavailable"
            ? "Aiming help isn't working right now, so I took the photo."
            : undefined;
      await sendImage(result.frame, lead);
    } catch (err) {
      if (stopCtrl.signal.aborted) return;
      await cameraFailed(err);
    } finally {
      if (guideRef.current === stopCtrl) guideRef.current = null;
      if (takeNowRef.current === takeNow) takeNowRef.current = null;
      setAimView(null);
      if (phaseRef.current === "guiding") go("idle");
    }
  }

  async function more() {
    const image = imageRef.current;
    const base = baseRef.current;
    if (!image || !base) {
      await say("There's nothing to add yet. Say what's this to describe something first.");
      return;
    }
    await run({ image, mode: "detailed", previous: { subject: base.subject, description: base.description } }, "more");
  }

  async function askQuestion(text: string, fromTap: boolean) {
    let image = imageRef.current;
    const base = baseRef.current;
    if (!image) {
      // Asked before any photo: take one now and answer about it.
      if (cameraProblemRef.current) return describe(fromTap);
      image = await takePhoto();
      if (!image) return;
      imageRef.current = image;
      setPhotoUrl(`data:image/jpeg;base64,${image}`);
    }
    await run(
      {
        image,
        mode: "default",
        question: text,
        previous: base ? { subject: base.subject, description: base.description } : undefined,
      },
      "answer",
      text,
    );
  }

  async function repeat() {
    const s = shownRef.current;
    if (s) await say(spokenText(s.result, s.kind), { cloud: true });
    else if (errorTextRef.current) await say(errorTextRef.current);
    else await say("I haven't said anything yet. Say what's this.");
  }

  async function changeRate(dir: 1 | -1) {
    const i = RATES.indexOf(rateRef.current);
    const next = RATES[Math.max(0, Math.min(RATES.length - 1, (i < 0 ? 2 : i) + dir))];
    const atLimit = next === rateRef.current;
    rateRef.current = next;
    writePref("rate", String(next));
    await say(atLimit ? (dir > 0 ? "That's as fast as I go." : "That's as slow as I go.") : dir > 0 ? "Okay, faster." : "Okay, slower.");
  }

  /** Carries out one request, spoken or tapped. */
  async function perform(cmd: VoiceCommand, fromTap: boolean) {
    switch (cmd.kind) {
      case "describe":
        return describe(fromTap);
      case "guide":
        return guide(fromTap);
      case "more":
        return more();
      case "repeat":
        return repeat();
      case "help":
        return say(HELP_TEXT);
      case "slower":
        return changeRate(-1);
      case "faster":
        return changeRate(1);
      case "stop":
      case "pause":
        return;
      case "question":
        return askQuestion(cmd.text, fromTap);
    }
  }

  /* ---------------------------------------------------------------- the conversation */

  async function hear(): Promise<Heard> {
    const ctrl = new AbortController();
    listenRef.current = ctrl;
    go("listening");
    cue.listen();
    // Let the start tone finish so the microphone doesn't pick it up.
    await new Promise((r) => setTimeout(r, 300));
    if (ctrl.signal.aborted) return { kind: "stopped" };
    try {
      const text = await listenOnce(ctrl.signal);
      return { kind: "text", text };
    } catch (err) {
      if (ctrl.signal.aborted || (err instanceof ListenError && err.code === "aborted")) return { kind: "stopped" };
      if (err instanceof ListenError && err.code === "no-speech") return { kind: "silence" };
      cue.error();
      const msg = listenErrorMessage(err);
      showError(msg);
      if (msg.includes("type your question")) setTyping(true);
      await say(msg);
      return { kind: "unavailable" };
    } finally {
      if (listenRef.current === ctrl) listenRef.current = null;
      if (phaseRef.current === "listening") go("idle");
    }
  }

  function endConversation() {
    loopRef.current++;
    talkingRef.current = false;
    setTalking(false);
    listenRef.current?.abort();
    listenRef.current = null;
  }

  /**
   * The loop: listen, act, speak, listen again. With App voice off (a screen
   * reader is talking) it runs one turn per tap, so it never records the
   * screen reader's own speech.
   */
  async function converse(greeting?: string) {
    if (!recognitionSupported()) {
      setTyping(true);
      await say(listenErrorMessage(new ListenError("unsupported")));
      window.setTimeout(() => questionRef.current?.focus(), 0);
      return;
    }
    const my = ++loopRef.current;
    talkingRef.current = true;
    setTalking(true);
    if (greeting) await say(greeting);
    let silent = 0;
    while (loopRef.current === my) {
      const h = await hear();
      if (loopRef.current !== my) return;
      if (h.kind === "stopped") break;
      if (h.kind === "unavailable") break;
      if (h.kind === "silence") {
        silent++;
        if (silent >= MAX_SILENT_TURNS || !voiceOnRef.current) {
          await say(ASLEEP_LINE);
          break;
        }
        await say("I'm still here. Say what's this, or help.");
        continue;
      }
      silent = 0;
      setHeard(h.text);
      const cmd = parseCommand(h.text);
      if (cmd.kind === "stop" || cmd.kind === "pause") {
        cue.cancel();
        await say("Okay. Tap the screen when you need me.");
        break;
      }
      await perform(cmd, false);
      if (!voiceOnRef.current) break;
    }
    if (loopRef.current === my) endConversation();
  }

  /** A button or shortcut: stop listening, do it, then carry on the conversation if one was running. */
  async function act(cmd: VoiceCommand) {
    unlock();
    const busy = phaseRef.current === "capturing" || phaseRef.current === "guiding" || phaseRef.current === "looking";
    if (busy) return;
    const wasTalking = talkingRef.current;
    endConversation();
    quiet();
    setHeard("");
    await perform(cmd, true);
    if (wasTalking && voiceOnRef.current) void converse();
  }

  /** The one big button: what a tap means depends on what the app is doing. */
  function onTalkButton() {
    unlock();
    const p = phaseRef.current;
    if (p === "guiding") {
      quiet();
      takeNowRef.current?.abort();
      return;
    }
    if (p === "capturing" || p === "looking") {
      quiet(); // stop "still looking"; Cancel is the separate button
      return;
    }
    if (p === "listening") {
      endConversation();
      quiet();
      cue.cancel();
      void say("Paused. Tap the screen to talk.");
      return;
    }
    if (speakingRef.current) {
      // Interrupt: stop talking. A running conversation listens next by itself.
      quiet();
      if (!talkingRef.current) void converse();
      return;
    }
    quiet();
    const first = readPref("greeted") !== "1";
    writePref("greeted", "1");
    void converse(first ? FIRST_GREETING : GREETING);
  }

  function cancel() {
    unlock();
    endConversation();
    captureRef.current?.abort();
    captureRef.current = null;
    guideRef.current?.abort();
    guideRef.current = null;
    requestRef.current?.abort();
    requestRef.current = null;
    quiet();
    cue.cancel();
    go("idle");
    void say("Cancelled. Tap the screen to talk.");
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    unlock();
    endConversation();
    cue.capture();
    try {
      await sendImage(await fileToBase64(file));
    } catch {
      cue.error();
      const msg = "I couldn't open that photo. Try a different one.";
      showError(msg);
      await say(msg);
    }
  }

  function onTypedQuestion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const input = questionRef.current;
    const text = input?.value.trim() ?? "";
    if (!text || !input) return;
    input.value = "";
    setHeard(text);
    void act(parseCommand(text));
  }

  function toggleVoice() {
    unlock();
    const next = !voiceOnRef.current;
    voiceOnRef.current = next;
    setVoiceOn(next);
    writePref("voiceOn", next ? "1" : "0");
    if (!next) {
      endConversation();
      quiet();
      announce("App voice off. Your screen reader reads each answer. Tap Talk for each question.");
    } else {
      void say("App voice on.");
    }
  }

  // With App voice off a screen reader is talking: move focus to each new answer
  // or error after it renders, so the screen reader reads it next.
  useEffect(() => {
    if (!voiceOn && shown) answerRef.current?.focus();
  }, [shown, voiceOn]);
  useEffect(() => {
    if (errorText && !voiceOn) errorRef.current?.focus();
  }, [errorText, voiceOn]);

  // Keyboard: Space or Enter on the big button, Escape anywhere, and letter
  // shortcuts while focus is inside the app (WCAG 2.1.4: only on focus).
  function stopAll() {
    endConversation();
    quiet();
    cue.cancel();
  }
  const handlers = useRef({ onTalkButton, cancel, act, stopAll });
  handlers.current = { onTalkButton, cancel, act, stopAll };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const h = handlers.current;
      const p = phaseRef.current;
      const busy = p === "capturing" || p === "guiding" || p === "looking";
      if (e.key === "Escape") {
        // Escape only ever stops things: cancel a photo or lookup, pause listening, or stop speech.
        if (busy) h.cancel();
        else if (p === "listening" || speakingRef.current) h.stopAll();
        e.preventDefault();
        return;
      }
      if (target?.closest("input, textarea, select") || !target?.closest("[data-shortcuts]")) return;
      const k = e.key.toLowerCase();
      if (p === "guiding" && k === "t") h.onTalkButton();
      else if (busy) return;
      else if (k === "d") void h.act({ kind: "describe" });
      else if (k === "g") void h.act({ kind: "guide" });
      else if (k === "m") void h.act({ kind: "more" });
      else if (k === "r") void h.act({ kind: "repeat" });
      else if (k === "a") h.onTalkButton();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ---------------------------------------------------------------- the screen */

  const busy = phase === "capturing" || phase === "guiding" || phase === "looking";
  const r = shown?.result;

  const state = speaking && phase === "idle" ? "speaking" : phase === "idle" && talking ? "listening" : phase;
  // The button's spoken name starts with its visible word (WCAG 2.5.3, so voice control can say it),
  // then says what a tap does now.
  const STATUS: Record<string, { word: string; hint: string; tap: string }> = {
    idle: { word: "Tap to talk", hint: "Then say “what's this”, “help me aim”, or ask a question.", tap: "" },
    listening: { word: "Listening", hint: "Say “what's this”, ask a question, or say “pause”.", tap: "Tap to pause listening" },
    speaking: { word: "Speaking", hint: "Tap anywhere to interrupt.", tap: "Tap to interrupt and talk" },
    capturing: { word: "Hold still", hint: "Taking one photo.", tap: "" },
    looking: { word: "Looking", hint: "Gemini is reading the photo.", tap: "" },
    guiding: { word: aimView?.ready ? "Hold it there" : "Aiming", hint: "Tap anywhere to take the photo now.", tap: "Tap to take the photo now" },
  };
  const s = STATUS[state] ?? STATUS.idle;

  return (
    <div
      className="app"
      data-state={state}
      data-compact={heard || errorText || r || typing ? "" : undefined}
      data-shortcuts
    >
      <header className="topbar">
        <h1 className="brand">{APP_NAME}</h1>
        {mock && <span className="badge">Demo data</span>}
        <button
          type="button"
          className="toggle"
          aria-pressed={voiceOn}
          onClick={toggleVoice}
          title="Turn off if you prefer your own screen reader"
        >
          App voice {voiceOn ? "on" : "off"}
        </button>
      </header>

      <main className="stage">
        {/* Live only while a photo is being taken or while aiming; off otherwise. */}
        <video
          ref={videoRef}
          className="camera"
          data-live={phase === "capturing" || phase === "guiding"}
          muted
          playsInline
          aria-hidden="true"
        />

        <button
          type="button"
          className="talk"
          onClick={onTalkButton}
          aria-keyshortcuts="A"
          aria-describedby="talk-hint"
          aria-disabled={phase === "capturing" || phase === "looking" ? true : undefined}
        >
          <span className="orb" aria-hidden="true">
            {state === "guiding" && aimView ? (
              <AimArrow move={aimView.ready ? "none" : aimView.move} ready={aimView.ready} />
            ) : state === "listening" ? (
              <MicIcon />
            ) : state === "speaking" ? (
              <WaveIcon />
            ) : state === "capturing" || state === "looking" ? (
              <EyeIcon />
            ) : (
              <MicIcon />
            )}
          </span>
          <span className="talk-text">
            <span className="status-word">
              {s.word}
              {s.tap && <span className="sr-only">. {s.tap}</span>}
            </span>
            {/* Read as the button's description (aria-describedby), not as part of its name. */}
            <span className="status-hint" id="talk-hint" aria-hidden="true">
              {state === "guiding" && aimView ? aimView.text : s.hint}
            </span>
          </span>
        </button>

        <section className="conversation" aria-label="Conversation">
          {heard && (
            <p className="said">
              <span className="who">You said</span> “{heard}”
            </p>
          )}

          {errorText && (
            <p className="error" ref={errorRef} tabIndex={-1} role={voiceOn ? undefined : "alert"}>
              {errorText}
            </p>
          )}

          {r && !errorText && (
            <article className="answer" aria-labelledby="answer-title">
              {photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="thumb" src={photoUrl} alt="" aria-hidden="true" />
              )}
              <div className="answer-body">
                <h2 id="answer-title" ref={answerRef} tabIndex={-1}>
                  {r.subject}
                </h2>
                {r.confidence !== "high" && (
                  <p className="caveat">
                    <span className="label">Not certain</span> {r.caveats || "This identification may be wrong."}
                  </p>
                )}
                <p className="desc">{r.description}</p>
                {shown.kind === "describe" && r.size_comparison && (
                  <p className="fact">
                    <span className="label">Size</span> {r.size_comparison}
                  </p>
                )}
                {shown.kind === "describe" && r.fun_fact && (
                  <p className="fact">
                    <span className="label">Fun fact</span> {r.fun_fact}
                  </p>
                )}
              </div>
            </article>
          )}

          {typing && !busy && (
            <form className="ask" onSubmit={onTypedQuestion}>
              <label htmlFor="question">Type instead of talking</label>
              <div className="ask-row">
                <input
                  id="question"
                  ref={questionRef}
                  type="text"
                  autoComplete="off"
                  enterKeyHint="send"
                  placeholder="what's this, or a question"
                />
                <button type="submit" className="btn">
                  Send
                </button>
              </div>
            </form>
          )}
        </section>
      </main>

      <nav className="controls" aria-label="Without speaking">
        {busy ? (
          <button type="button" className="btn btn-wide" onClick={cancel} aria-keyshortcuts="Escape">
            Cancel
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              onClick={() => void act({ kind: "describe" })}
              aria-keyshortcuts="D"
            >
              <CameraIcon />
              {cameraProblem ? "Choose a photo" : "What's this?"}
            </button>
            {r ? (
              <button type="button" className="btn" onClick={() => void act({ kind: "more" })} aria-keyshortcuts="M">
                <PlusIcon />
                Tell me more
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => void act({ kind: "guide" })} aria-keyshortcuts="G">
                <TargetIcon />
                Help me aim
              </button>
            )}
          </>
        )}
      </nav>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFile}
      />
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- icons (decorative) */

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}
function CameraIcon() {
  return (
    <Svg>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </Svg>
  );
}
function MicIcon() {
  return (
    <Svg>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
    </Svg>
  );
}
function WaveIcon() {
  return (
    <Svg>
      <path className="wave" d="M3 12h2M7 8v8M11 5v14M15 8v8M19 10v4M21 12h0" />
    </Svg>
  );
}
function EyeIcon() {
  return (
    <Svg>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}
function PlusIcon() {
  return (
    <Svg>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}
function TargetIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
    </Svg>
  );
}

/** Big direction arrow while aiming (decorative; every instruction is spoken). */
function AimArrow({ move, ready }: { move: AimMove; ready: boolean }) {
  if (ready) {
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  }
  const rotate: Partial<Record<AimMove, number>> = { up: 0, right: 90, down: 180, left: 270 };
  if (move in rotate) {
    return (
      <svg
        className="icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        style={{ transform: `rotate(${rotate[move]}deg)` }}
      >
        <path d="M12 20V5M5.5 11.5L12 5l6.5 6.5" />
      </svg>
    );
  }
  if (move === "back" || move === "closer") {
    const d = move === "back" ? "M9 12H3M6 9l-3 3 3 3M15 12h6M18 9l3 3-3 3" : "M3 12h6M6 9l3 3-3 3M21 12h-6M18 9l-3 3 3 3";
    return (
      <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={d} />
      </svg>
    );
  }
  return <TargetIcon />;
}
