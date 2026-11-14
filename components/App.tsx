"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { DescribeRequest, DescribeSuccess } from "@/shared/contract";
import type { AimMove } from "@/shared/contract";
import { guideToPhoto, instructionFor } from "./aimGuide";
import { CameraError, cameraSupportError, captureOnce, fileToBase64 } from "./camera";
import { cue, unlockCues } from "./cues";
import { clientMockEnabled, describeImage } from "./describeClient";
import { ListenError, listenErrorMessage, listenOnce, parseCommand, recognitionSupported } from "./listen";
import { speak, stopSpeaking, unlockSpeech } from "./speech";
import { spokenText, type ResultKind } from "./spokenText";

export const APP_NAME = "Wildlife Described";

/**
 * "capturing": the camera is on for about a second to take one photo.
 * "guiding": the camera is on and the app is telling the user how to aim.
 */
type Phase = "idle" | "capturing" | "guiding" | "looking" | "listening" | "result" | "error";

/** What the guiding screen shows: the latest instruction, in large text. */
interface AimView {
  text: string;
  move: AimMove;
  ready: boolean;
}

/** Don't repeat the same aiming instruction more often than this. */
const REPEAT_INSTRUCTION_MS = 4000;

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
  const [aimView, setAimView] = useState<AimView | null>(null);

  // Values read after an await, where closure state could be stale.
  const imageRef = useRef<string | null>(null);
  const baseRef = useRef<DescribeSuccess | null>(null);
  const shownRef = useRef<Shown | null>(null);
  const voiceOnRef = useRef(true);
  const requestRef = useRef<AbortController | null>(null);
  const listenRef = useRef<AbortController | null>(null);
  const speakId = useRef(0);
  const captureRef = useRef<AbortController | null>(null);
  const guideRef = useRef<AbortController | null>(null);
  const takeNowRef = useRef<AbortController | null>(null);
  const lastInstruction = useRef({ text: "", at: 0 });
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
    return () => {
      captureRef.current?.abort();
      guideRef.current?.abort();
    };
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

  async function run(req: DescribeRequest, kind: ResultKind, question?: string, lead?: string) {
    requestRef.current?.abort();
    const ctrl = new AbortController();
    requestRef.current = ctrl;
    setTyping(false);
    setErrorText("");
    setPhase("looking");
    void say(lead ? `${lead} ${WAIT_CUES[kind]}` : WAIT_CUES[kind]);
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

  async function sendImage(image: string, lead?: string) {
    imageRef.current = image;
    setPhotoUrl(`data:image/jpeg;base64,${image}`);
    baseRef.current = null;
    await run({ image, mode: "default" }, "describe", undefined, lead);
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
        void say(`${cameraProblemRef.current} Tap Take a photo to choose a photo instead.`);
      }
      return;
    }
    void (async () => {
      const frame = await takePhoto();
      if (frame) await sendImage(frame);
    })();
  }

  /**
   * "Guide me": keeps the camera on and speaks aiming instructions until the
   * exhibit is fully in view, then takes one photo and describes it.
   */
  function guide(fromTap = true) {
    unlock();
    quiet();
    if (cameraProblemRef.current || captureRef.current || guideRef.current) {
      if (cameraProblemRef.current) describe(fromTap);
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    const stopCtrl = new AbortController();
    const takeNow = new AbortController();
    guideRef.current = stopCtrl;
    takeNowRef.current = takeNow;
    lastInstruction.current = { text: "", at: 0 };
    setErrorText("");
    setTyping(false);
    setAimView({ text: "Hold the phone up in front of you.", move: "none", ready: false });
    setPhase("guiding");
    void say("Hold the phone up in front of you, and I'll help you aim.");

    void (async () => {
      try {
        const result = await guideToPhoto(video, stopCtrl.signal, takeNow.signal, (aim, readyCount) => {
          const text = instructionFor(aim, readyCount);
          setAimView({ text, move: aim.move, ready: aim.status === "ready" });
          const last = lastInstruction.current;
          const now = Date.now();
          if (text !== last.text || now - last.at > REPEAT_INSTRUCTION_MS) {
            lastInstruction.current = { text, at: now };
            cue.nudge();
            void say(text);
          }
        });
        if (!result || stopCtrl.signal.aborted) return;
        // Camera is off now; guiding is over even while the description loads.
        if (guideRef.current === stopCtrl) guideRef.current = null;
        if (takeNowRef.current === takeNow) takeNowRef.current = null;
        setAimView(null);
        cue.capture();
        const lead =
          result.how === "timeout"
            ? "I couldn't find a clear view, so I took the photo anyway."
            : result.how === "unavailable"
              ? "Aiming help isn't working right now, so I took the photo."
              : undefined;
        await sendImage(result.frame, lead);
      } catch (err) {
        if (stopCtrl.signal.aborted) return;
        const reason = err instanceof CameraError ? err.reason : "The camera couldn't start.";
        cameraProblemRef.current = reason;
        setCameraProblem(reason);
        cue.error();
        const msg = `${reason} Tap Take a photo to choose a photo instead.`;
        setErrorText(msg);
        setPhase("error");
        void say(msg);
      } finally {
        if (guideRef.current === stopCtrl) guideRef.current = null;
        if (takeNowRef.current === takeNow) takeNowRef.current = null;
        setAimView(null);
      }
    })();
  }

  /** While guiding: stop aiming and take the photo now. */
  function takeNow() {
    unlock();
    quiet();
    takeNowRef.current?.abort();
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
      const msg = `${reason} Tap Take a photo to choose a photo instead.`;
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
    guideRef.current?.abort();
    guideRef.current = null;
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
      else if (cmd.kind === "guide") guide(false);
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
  const actions = useRef({ describe, guide, takeNow, more, listen, repeat, stop, cancel });
  actions.current = { describe, guide, takeNow, more, listen, repeat, stop, cancel };
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
      const busy = phaseRef.current !== "idle" && phaseRef.current !== "result" && phaseRef.current !== "error";
      const k = e.key.toLowerCase();
      if (k === "escape") busy ? a.cancel() : a.stop();
      else if (!target?.closest("[data-shortcuts]")) return;
      else if (phaseRef.current === "guiding" && k === "t") a.takeNow();
      else if (busy) return;
      else if (k === "g") a.guide();
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

  // Every "Get a description" button on the page (nav, hero, close) takes the photo on its own tap,
  // so the browser still counts it as a user gesture (iOS audio, the photo picker). The link then
  // jumps to this section as usual.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest("[data-describe]");
      if (!el) return;
      if (phaseRef.current !== "idle" && phaseRef.current !== "result" && phaseRef.current !== "error") return;
      actions.current.describe();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const busy = phase === "capturing" || phase === "guiding" || phase === "looking" || phase === "listening";
  const r = shown?.result;

  return (
    <section className="section" id="app" aria-labelledby="app-h">
      <div className="wrap">
        <div className="grid">
          <h2 id="app-h" className="span-5">
            Describes a photo on this page
          </h2>
          <div className="span-6 start-7 stack-4 wd-intro">
            <p>
              Tap Get a description and allow the camera. It takes one photo, Gemini reads it, and the description
              plays aloud. Then ask a question by voice.
            </p>
            <a className="link" href="#voice">
              See the voice commands
            </a>
          </div>
        </div>

        <div className="ui app fill wd-app" data-phase={phase} data-visual>
          <div className="app__pane wd-photo" data-shortcuts>
            {/* Live only while a photo is being taken; the camera is off otherwise. */}
            <video
              ref={videoRef}
              className="wd-preview wd-preview--live"
              data-live={phase === "capturing" || phase === "guiding"}
              muted
              playsInline
              aria-hidden="true"
            />
            {photoUrl && phase !== "capturing" && phase !== "guiding" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="wd-preview" src={photoUrl} alt="" aria-hidden="true" />
            )}
            {!photoUrl && phase !== "capturing" && phase !== "guiding" && (
              <div className="wd-empty" aria-hidden="true" data-fx="grain-gradient" data-fx-seed="53">
                <span className="pc-finder__corners" />
                <CameraIcon />
              </div>
            )}
            {phase === "capturing" && (
              <div className="wd-overlay" aria-hidden="true">
                <p>Hold still</p>
              </div>
            )}
            {phase === "guiding" && aimView && (
              // Spoken already; this is for low-vision users and companions.
              <div className="wd-aim" data-ready={aimView.ready} aria-hidden="true">
                <AimArrow move={aimView.ready ? "none" : aimView.move} ready={aimView.ready} />
                <p className="wd-aim__text">{aimView.text}</p>
              </div>
            )}
            {phase === "looking" && (
              <div className="wd-overlay" aria-hidden="true">
                <span className="wd-pulse" />
                <p>Looking</p>
              </div>
            )}
            {phase === "listening" && (
              <div className="wd-overlay" aria-hidden="true">
                <span className="wd-pulse wd-pulse--mic">
                  <MicIcon />
                </span>
                <p>Listening</p>
              </div>
            )}
          </div>

          <div className="app__pane wd-panel">
            <div className="wd-head">
              <span className="wd-title">
                <span className="mark" data-mark="ring" aria-hidden="true"></span>Wildlife Described
              </span>
              {mock && <span className="pc-chip">Demo data</span>}
              <button
                type="button"
                className="wd-toggle"
                aria-pressed={voiceOn}
                onClick={toggleVoice}
                title="Turn off if you prefer your own screen reader"
              >
                App voice {voiceOn ? "on" : "off"}
              </button>
            </div>

            <div className="wd-body" data-shortcuts>
              {phase === "idle" && (
                <p className="wd-hint">
                  {cameraProblem
                    ? `${cameraProblem} Take a photo opens your camera app or photos.`
                    : "Point your phone at an exhibit or animal, then take a photo. The camera turns on only for the photo."}
                </p>
              )}
              {phase === "capturing" && <p className="wd-hint">Hold still. Taking the photo.</p>}
              {phase === "guiding" && (
                <p className="wd-hint">Guiding. I'll say which way to turn, then take the photo when the exhibit is in view.</p>
              )}
              {phase === "looking" && <p className="wd-hint">Looking at the photo.</p>}
              {phase === "listening" && (
                <p className="wd-hint">Listening. Ask a question, or say “more” or “repeat”.</p>
              )}

              {phase === "result" && r && (
                <div className="wd-result" aria-labelledby="result-title">
                  {shown.question && <p className="wd-asked">You asked: “{shown.question}”</p>}
                  <h3 id="result-title" ref={headingRef} tabIndex={-1}>
                    {r.subject}
                  </h3>
                  {r.confidence !== "high" && (
                    <p className="wd-caveat">
                      <span className="pc-chip pc-chip--warn">Not certain</span>
                      {r.caveats || "This identification may be wrong."}
                    </p>
                  )}
                  <p className="wd-desc">{r.description}</p>
                  {shown.kind === "describe" && r.size_comparison && (
                    <p className="wd-fact">
                      <span className="wd-fact__label">Size</span>
                      {r.size_comparison}
                    </p>
                  )}
                  {shown.kind === "describe" && r.fun_fact && (
                    <p className="wd-fact">
                      <span className="wd-fact__label">Fun fact</span>
                      {r.fun_fact}
                    </p>
                  )}
                </div>
              )}

              {phase === "error" && (
                <p className="wd-error" ref={errorRef} tabIndex={-1} role={voiceOn ? undefined : "alert"}>
                  {errorText}
                </p>
              )}

              {typing && !busy && (
                <form className="wd-ask" onSubmit={onTypedQuestion}>
                  <label htmlFor="question">Type your question</label>
                  <div className="wd-ask__row">
                    <input id="question" ref={questionRef} type="text" autoComplete="off" enterKeyHint="send" />
                    <button type="submit" className="wd-btn">
                      Ask
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="wd-controls" role="group" aria-label="App actions" data-shortcuts>
              {phase === "result" && (
                <div className="wd-row">
                  {speaking ? (
                    <button type="button" className="wd-btn" onClick={stop} aria-keyshortcuts="S">
                      <StopIcon />
                      Stop
                    </button>
                  ) : (
                    <button type="button" className="wd-btn" onClick={repeat} aria-keyshortcuts="R">
                      <RepeatIcon />
                      Repeat
                    </button>
                  )}
                  <button type="button" className="wd-btn" onClick={more} aria-keyshortcuts="M">
                    <PlusIcon />
                    Tell me more
                  </button>
                  <button type="button" className="wd-btn" onClick={() => void listen()} aria-keyshortcuts="A">
                    <MicIcon />
                    Ask
                  </button>
                </div>
              )}

              {(phase === "idle" || phase === "error") && (
                <div className="wd-row">
                  <button type="button" className="wd-btn" onClick={() => void listen()} aria-keyshortcuts="A">
                    <MicIcon />
                    Ask
                  </button>
                  <button
                    type="button"
                    className="wd-btn"
                    onClick={() => guide()}
                    aria-keyshortcuts="G"
                    aria-describedby="guide-help"
                  >
                    <TargetIcon />
                    Guide me
                  </button>
                  <button
                    type="button"
                    className="wd-btn"
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

              {phase === "guiding" && (
                <div className="wd-row wd-row--one">
                  <button type="button" className="wd-btn" onClick={cancel} aria-keyshortcuts="Escape">
                    Cancel
                  </button>
                </div>
              )}

              {phase === "guiding" ? (
                <button type="button" className="wd-btn wd-btn--main" onClick={takeNow} aria-keyshortcuts="T">
                  <CameraIcon />
                  Take it now
                </button>
              ) : busy ? (
                <button type="button" className="wd-btn wd-btn--main wd-btn--cancel" onClick={cancel} aria-keyshortcuts="Escape">
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="wd-btn wd-btn--main"
                  onClick={() => describe()}
                  aria-keyshortcuts="D"
                  aria-describedby="describe-help"
                >
                  <CameraIcon />
                  {phase === "result" ? "Take a new photo" : phase === "error" ? "Try again" : "Take a photo"}
                </button>
              )}
              <p id="describe-help" className="sr-only">
                Takes a photo of what your camera is pointing at and reads a description aloud.
              </p>
              <p id="guide-help" className="sr-only">
                Hold the phone up. I'll tell you which way to turn until the exhibit is in view, then describe it.
              </p>
            </div>
          </div>
        </div>

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
    </section>
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
function TargetIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
    </Svg>
  );
}

/** Big direction arrow for the guiding screen (decorative; instructions are spoken). */
function AimArrow({ move, ready }: { move: AimMove; ready: boolean }) {
  if (ready) {
    return (
      <svg className="aim-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    );
  }
  const rotate: Partial<Record<AimMove, number>> = { up: 0, right: 90, down: 180, left: 270 };
  if (move in rotate) {
    return (
      <svg
        className="aim-icon"
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
    // Arrows pointing outward (step back) or inward (move closer).
    const d = move === "back" ? "M9 12H3M6 9l-3 3 3 3M15 12h6M18 9l3 3-3 3" : "M3 12h6M6 9l3 3-3 3M21 12h-6M18 9l-3 3 3 3";
    return (
      <svg className="aim-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={d} />
      </svg>
    );
  }
  return <span className="wd-pulse" />;
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
