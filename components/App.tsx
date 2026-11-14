"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { DescribeRequest, DescribeSuccess } from "@/shared/contract";
import { CameraError, cameraSupportError, captureOnce, fileToBase64 } from "./camera";
import { cue, unlockCues } from "./cues";
import { clientMockEnabled, describeImage } from "./describeClient";
import { ListenError, listenErrorMessage, listenOnce, parseCommand, recognitionSupported } from "./listen";
import { speak, stopSpeaking, unlockSpeech } from "./speech";
import { spokenText, type ResultKind } from "./spokenText";

export const APP_NAME = "Wildlife Described";

/** "capturing": the camera is on for about a second to take one photo. */
type Phase = "idle" | "capturing" | "looking" | "listening" | "result" | "error";

interface Shown {
  result: DescribeSuccess;
  kind: ResultKind;
  question?: string;
}

const WAIT_CUES: Record<ResultKind, string> = {
  describe: "Looking now.",
  more: "Getting more detail.",
  answer: "Let me check.",
};

function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const questionRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [shown, setShown] = useState<Shown | null>(null);
  const [errorText, setErrorText] = useState("");
  const [status, setStatus] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [typing, setTyping] = useState(false);
  const [mock, setMock] = useState(false);
  /** Set once the camera has failed; Describe then opens the photo picker instead. */
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);
  /** The photo being described, shown in place of a live feed. */
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // Values read after an await, where closure state could be stale.
  const imageRef = useRef<string | null>(null);
  const baseRef = useRef<DescribeSuccess | null>(null);
  const shownRef = useRef<Shown | null>(null);
  const voiceOnRef = useRef(true);
  const requestRef = useRef<AbortController | null>(null);
  const listenRef = useRef<AbortController | null>(null);
  const speakId = useRef(0);
  const captureRef = useRef<AbortController | null>(null);
  const cameraProblemRef = useRef<string | null>(null);

  useEffect(() => {
    const v = readPref("voiceOn", true);
    setVoiceOn(v);
    voiceOnRef.current = v;
    setMock(clientMockEnabled());
    const unsupported = cameraSupportError();
    if (unsupported) {
      cameraProblemRef.current = unsupported.reason;
      setCameraProblem(unsupported.reason);
    }
    // Never leave the camera on if the page goes away mid-capture.
    return () => captureRef.current?.abort();
  }, []);

  /** Polite screen-reader announcement; blanking first re-announces repeats. */
  function announce(text: string) {
    setStatus("");
    window.setTimeout(() => setStatus(text), 60);
  }

  /** Speak with the app's voice, or hand to the screen reader when app voice is off. */
  async function say(text: string, opts: { cloud?: boolean } = {}) {
    if (!voiceOnRef.current) {
      announce(text);
      return;
    }
    const id = ++speakId.current;
    setSpeaking(true);
    try {
      await speak(text, { cloud: opts.cloud });
    } finally {
      if (id === speakId.current) setSpeaking(false);
    }
  }

  function quiet() {
    speakId.current++;
    stopSpeaking();
    setSpeaking(false);
  }

  /** Must run inside every tap/key handler before any await (iOS audio rules). */
  function unlock() {
    unlockCues();
    unlockSpeech();
  }

  async function run(req: DescribeRequest, kind: ResultKind, question?: string) {
    requestRef.current?.abort();
    const ctrl = new AbortController();
    requestRef.current = ctrl;
    setTyping(false);
    setErrorText("");
    setPhase("looking");
    void say(WAIT_CUES[kind]);
    const still = window.setTimeout(() => void say("Still looking."), 8000);

    const out = await describeImage(req, ctrl.signal);
    window.clearTimeout(still);
    if (ctrl.signal.aborted || requestRef.current !== ctrl) return;
    requestRef.current = null;

    if (!out.ok) {
      cue.error();
      setErrorText(out.error.message);
      setPhase("error");
      void say(out.error.message);
      return;
    }
    cue.done();
    if (kind === "describe" || !baseRef.current) baseRef.current = out.data;
    const next: Shown = { result: out.data, kind, question };
    shownRef.current = next;
    setShown(next);
    setPhase("result");
    void say(spokenText(out.data, kind), { cloud: true });
  }

  async function sendImage(image: string) {
    imageRef.current = image;
    setPhotoUrl(`data:image/jpeg;base64,${image}`);
    baseRef.current = null;
    await run({ image, mode: "default" }, "describe");
  }

  /**
   * Takes a photo and describes it. `fromTap` is false when called after an
   * await (a voice command): browsers block opening the photo picker then.
   */
  function describe(fromTap = true) {
    unlock();
    quiet();
    if (cameraProblemRef.current) {
      if (fromTap) {
        // Camera unusable: open the phone's camera app or photo picker instead.
        fileRef.current?.click();
      } else {
        cue.error();
        void say(`${cameraProblemRef.current} Tap Describe at the bottom of the screen to choose a photo.`);
      }
      return;
    }
    void (async () => {
      const frame = await takePhoto();
      if (frame) await sendImage(frame);
    })();
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
    setErrorText("");
    setTyping(false);
    setPhase("capturing");
    void say("Hold still.");
    try {
      const frame = await captureOnce(video, ctrl.signal);
      if (!frame || ctrl.signal.aborted) return null;
      cue.capture();
      return frame;
    } catch (err) {
      if (ctrl.signal.aborted) return null;
      const reason = err instanceof CameraError ? err.reason : "The camera couldn't start.";
      cameraProblemRef.current = reason;
      setCameraProblem(reason);
      cue.error();
      const msg = `${reason} Tap Describe to choose a photo instead.`;
      setErrorText(msg);
      setPhase("error");
      void say(msg);
      return null;
    } finally {
      if (captureRef.current === ctrl) captureRef.current = null;
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    unlock();
    cue.capture();
    try {
      await sendImage(await fileToBase64(file));
    } catch {
      cue.error();
      const msg = "I couldn't open that photo. Try a different one.";
      setErrorText(msg);
      setPhase("error");
      void say(msg);
    }
  }

  function more() {
    unlock();
    const image = imageRef.current;
    const base = baseRef.current;
    if (!image || !base) return;
    quiet();
    void run(
      { image, mode: "detailed", previous: { subject: base.subject, description: base.description } },
      "more",
    );
  }

  async function askQuestion(text: string, fromTap = true) {
    let image = imageRef.current;
    const base = baseRef.current;
    if (!image) {
      // Asked before any photo: take one now and answer about it.
      if (cameraProblemRef.current) {
        describe(fromTap);
        return;
      }
      image = await takePhoto();
      if (!image) return;
      imageRef.current = image;
      setPhotoUrl(`data:image/jpeg;base64,${image}`);
    }
    void run(
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

  function repeat() {
    unlock();
    const s = shownRef.current;
    if (s) void say(spokenText(s.result, s.kind), { cloud: true });
    else if (errorText) void say(errorText);
  }

  function stop() {
    quiet();
    cue.cancel();
  }

  function cancel() {
    unlock();
    captureRef.current?.abort();
    captureRef.current = null;
    requestRef.current?.abort();
    requestRef.current = null;
    listenRef.current?.abort();
    listenRef.current = null;
    quiet();
    cue.cancel();
    setTyping(false);
    setPhase(shownRef.current ? "result" : "idle");
    void say("Cancelled.");
  }

  async function listen() {
    unlock();
    quiet();
    if (!recognitionSupported()) {
      setTyping(true);
      void say(listenErrorMessage(new ListenError("unsupported")));
      return;
    }
    const back: Phase = shownRef.current ? "result" : "idle";
    const ctrl = new AbortController();
    listenRef.current = ctrl;
    setPhase("listening");
    cue.listen();
    // Let the start tone finish so the mic doesn't pick it up.
    await new Promise((r) => setTimeout(r, 300));
    if (ctrl.signal.aborted) return;
    try {
      const heard = await listenOnce(ctrl.signal);
      if (listenRef.current !== ctrl) return;
      listenRef.current = null;
      const cmd = parseCommand(heard);
      setPhase(back);
      if (cmd.kind === "stop") stop();
      else if (cmd.kind === "repeat") repeat();
      else if (cmd.kind === "more" && baseRef.current) more();
      else if (cmd.kind === "describe") describe(false);
      else void askQuestion(cmd.kind === "question" ? cmd.text : heard, false);
    } catch (err) {
      if (listenRef.current !== ctrl) return;
      listenRef.current = null;
      setPhase(back);
      cue.error();
      const msg = listenErrorMessage(err);
      if (msg.includes("type your question")) setTyping(true);
      void say(msg);
    }
  }

  function onTypedQuestion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    unlock();
    const text = questionRef.current?.value.trim() ?? "";
    if (!text) return;
    quiet();
    void askQuestion(text);
  }

  function toggleVoice() {
    unlock();
    const next = !voiceOnRef.current;
    voiceOnRef.current = next;
    setVoiceOn(next);
    writePref("voiceOn", next);
    if (!next) {
      quiet();
      announce("App voice off. Your screen reader will read results.");
    } else {
      void say("App voice on.");
    }
  }

  // Move focus to new content so the next swipe or Tab starts there.
  useEffect(() => {
    if (phase === "result") headingRef.current?.focus();
    if (phase === "error") errorRef.current?.focus();
    if (typing) questionRef.current?.focus();
  }, [phase, shown, typing]);

  // Keyboard shortcuts for Bluetooth keyboards and switch devices. Escape works
  // anywhere. Letter keys work only while focus is in the stage or the action
  // buttons (WCAG 2.1.4: character-key shortcuts active only on focus), so they
  // can't fire from a stray key press or from speech input elsewhere on the page.
  const actions = useRef({ describe, more, listen, repeat, stop, cancel });
  actions.current = { describe, more, listen, repeat, stop, cancel };
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select")) {
        if (e.key === "Escape") actions.current.cancel();
        return;
      }
      const a = actions.current;
      const busy = phaseRef.current === "capturing" || phaseRef.current === "looking" || phaseRef.current === "listening";
      const k = e.key.toLowerCase();
      if (k === "escape") busy ? a.cancel() : a.stop();
      else if (busy || !target?.closest("[data-shortcuts]")) return;
      else if (k === "d") a.describe();
      else if (k === "a") void a.listen();
      else if (k === "r") a.repeat();
      else if (k === "m") a.more();
      else if (k === "s") a.stop();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const busy = phase === "capturing" || phase === "looking" || phase === "listening";
  const r = shown?.result;

  return (
    <div className="app" data-phase={phase}>
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

      <main className="stage" data-shortcuts>
        {/* Live only while a photo is being taken; the camera is off otherwise. */}
        <video
          ref={videoRef}
          className="preview preview-live"
          data-live={phase === "capturing"}
          muted
          playsInline
          aria-hidden="true"
        />
        {photoUrl && phase !== "capturing" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="preview" src={photoUrl} alt="" aria-hidden="true" />
        )}

        {phase === "idle" && (
          <div className="hint">
            {cameraProblem ? (
              <p>{cameraProblem} Describe will open your camera app or photos.</p>
            ) : (
              <p>Point your phone at an exhibit or animal, then tap Describe. The camera turns on only to take the photo.</p>
            )}
          </div>
        )}

        {phase === "capturing" && (
          <div className="hint" aria-hidden="true">
            <p>Hold still…</p>
          </div>
        )}

        {phase === "looking" && (
          <div className="overlay" aria-hidden="true">
            <div className="pulse" />
            <p className="overlay-text">Looking…</p>
          </div>
        )}

        {phase === "listening" && (
          <div className="overlay" aria-hidden="true">
            <div className="pulse pulse-mic">
              <MicIcon />
            </div>
            <p className="overlay-text">Listening…</p>
            <p className="overlay-sub">Ask a question, or say “more” or “repeat”.</p>
          </div>
        )}

        {phase === "result" && r && (
          <section className="result" aria-labelledby="result-title">
            {shown.question && <p className="asked">You asked: “{shown.question}”</p>}
            <h2 id="result-title" ref={headingRef} tabIndex={-1}>
              {r.subject}
            </h2>
            {r.confidence !== "high" && (
              <p className="caveat">
                <span className="label label-caution">Not certain</span>
                {r.caveats || "This identification may be wrong."}
              </p>
            )}
            <p className="desc">{r.description}</p>
            {shown.kind === "describe" && r.size_comparison && (
              <p className="fact">
                <span className="label">Size</span>
                {r.size_comparison}
              </p>
            )}
            {shown.kind === "describe" && r.fun_fact && (
              <p className="fact">
                <span className="label">Fun fact</span>
                {r.fun_fact}
              </p>
            )}
          </section>
        )}

        {phase === "error" && (
          <div className="error">
            <p ref={errorRef} tabIndex={-1} role={voiceOn ? undefined : "alert"}>
              {errorText}
            </p>
          </div>
        )}

        {typing && !busy && (
          <form className="ask-form" onSubmit={onTypedQuestion}>
            <label htmlFor="question">Type your question</label>
            <div className="ask-row">
              <input id="question" ref={questionRef} type="text" autoComplete="off" enterKeyHint="send" />
              <button type="submit" className="btn btn-secondary">
                Ask
              </button>
            </div>
          </form>
        )}
      </main>

      <nav className="controls" aria-label="Actions" data-shortcuts>
        {phase === "result" && (
          <div className="secondary-row">
            {speaking ? (
              <button type="button" className="btn btn-secondary" onClick={stop} aria-keyshortcuts="S">
                <StopIcon />
                Stop
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={repeat} aria-keyshortcuts="R">
                <RepeatIcon />
                Repeat
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={more} aria-keyshortcuts="M">
              <PlusIcon />
              Tell me more
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void listen()} aria-keyshortcuts="A">
              <MicIcon />
              Ask
            </button>
          </div>
        )}

        {(phase === "idle" || phase === "error") && (
          <div className="secondary-row two">
            <button type="button" className="btn btn-secondary" onClick={() => void listen()} aria-keyshortcuts="A">
              <MicIcon />
              Ask
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                unlock();
                fileRef.current?.click();
              }}
            >
              <PhotoIcon />
              Use a photo
            </button>
          </div>
        )}

        {busy ? (
          <button type="button" className="btn btn-primary btn-cancel" onClick={cancel} aria-keyshortcuts="Escape">
            Cancel
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => describe()}
            aria-keyshortcuts="D"
            aria-describedby="describe-help"
          >
            <CameraIcon />
            {phase === "result" ? "Describe new" : phase === "error" ? "Try again" : "Describe"}
            <span className="btn-hint" aria-hidden="true">
              Tap anywhere in this area
            </span>
          </button>
        )}
        <p id="describe-help" className="sr-only">
          Takes a photo of what your camera is pointing at and reads a description aloud.
        </p>
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
function RepeatIcon() {
  return (
    <Svg>
      <path d="M4 12a8 8 0 0 1 14-5.3M20 4v4h-4M20 12a8 8 0 0 1-14 5.3M4 20v-4h4" />
    </Svg>
  );
}
function StopIcon() {
  return (
    <Svg>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
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
function PhotoIcon() {
  return (
    <Svg>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="m4 17 5-5 4 4 2-2 5 5" />
      <circle cx="15.5" cy="9.5" r="1.5" />
    </Svg>
  );
}
