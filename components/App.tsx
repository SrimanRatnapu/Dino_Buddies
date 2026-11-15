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
import { AIM_LINES, guideToPhoto, instructionFor } from "./aimGuide";
import { CameraError, cameraSupportError, captureOnce, fileToBase64 } from "./camera";
import { cue, unlockCues } from "./cues";
import { clientMockEnabled, describeImage } from "./describeClient";
import {
  HELP_TEXT,
  ListenError,
  listenErrorMessage,
  listenOnce,
  parseCommand,
  parseYesNo,
  recognitionSupported,
  type VoiceCommand,
} from "./listen";
import { logSound, onSoundLog, prepareVoice, speak, stopSpeaking, testVoices, unlockSpeech } from "./speech";
import { spokenText, type ResultKind } from "./spokenText";
import {
  addSaid,
  clearDetails,
  contextOf,
  findVisit,
  keyOf,
  readDetails,
  shrinkImage,
  theName,
  timeAgo,
  writeDetails,
  type VisitRecord,
} from "./visitMemory";

export const APP_NAME = "TourBuddy";

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

/** Spoken when "Ask a question" starts the plain conversation (no tour) for the first time. */
const FIRST_GREETING =
  "Hi, I'm Tour Buddy. Point your phone at an exhibit and say: what's this. Say help any time.";
/** The very first tap ever: the tour starts, so explain it once. */
const FIRST_TOUR_START =
  "Hi, I'm Tour Buddy. Hold your phone up in front of you at chest height and turn slowly. " +
  "I'll lead you to each exhibit and describe it. After each one, ask me anything, or stay quiet and I'll find the next. " +
  "Say end tour to stop.";
const GREETING = "I'm listening.";
const ASLEEP_LINE = "I'll wait. Tap the screen when you need me.";

/** Tour ("I am here"): rounds in a row with nothing new before the tour pauses itself. */
const MAX_EMPTY_ROUNDS = 2;
/** Tour: time to walk a few steps before looking again. */
const TOUR_WALK_MS = 4000;
/** Tour: questions about one exhibit before moving on anyway. */
const MAX_TOUR_QUESTIONS = 4;
const TOUR_START = "Let's explore. Hold the phone up in front of you and turn slowly.";

/** How one round of aiming ended. */
/** "describe-failed": a photo was taken but the description request failed (already said aloud). */
type GuideOutcome = "described" | "describe-failed" | "nothing-new" | "stopped" | "failed";

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
const VISITED_KEY = "visited";
/** Older builds kept only the last 8, under this key. */
const OLD_SEEN_KEY = "seen";
const MAX_VISITED = 30;
/** How many of the most recent exhibits Gemini is told about. */
const MAX_SEEN = 8;

function readVisited(): string[] {
  try {
    const raw = sessionStorage.getItem(VISITED_KEY) ?? sessionStorage.getItem(OLD_SEEN_KEY) ?? "[]";
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(-MAX_VISITED) : [];
  } catch {
    return [];
  }
}

function writeVisited(visited: string[]) {
  try {
    sessionStorage.setItem(VISITED_KEY, JSON.stringify(visited));
    sessionStorage.removeItem(OLD_SEEN_KEY);
  } catch {
    /* storage unavailable: the list still works for this page */
  }
}

/** "the T. rex skeleton, a giraffe and a Triceratops skull", for speaking the list. */
function spokenList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
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
  /** A tour ("I am here") is running: guide, describe, short pause for questions, repeat. */
  const [touring, setTouring] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [heard, setHeard] = useState("");
  const [shown, setShown] = useState<Shown | null>(null);
  const [errorText, setErrorText] = useState("");
  const [status, setStatus] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const [typing, setTyping] = useState(false);
  const [mock, setMock] = useState(false);
  /** ?debug=1: a panel showing what happened to each spoken line, with a sound test. */
  const [debug, setDebug] = useState(false);
  const [soundLines, setSoundLines] = useState<string[]>([]);
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [aimView, setAimView] = useState<AimView | null>(null);

  // Values read after an await, where closure state could be stale.
  const imageRef = useRef<string | null>(null);
  const baseRef = useRef<DescribeSuccess | null>(null);
  /** Exhibits visited this tab, in the order first described (the on-screen list). */
  const visitedRef = useRef<string[]>([]);
  const [visited, setVisited] = useState<string[]>([]);
  /** What Gemini is told: the most recent few. */
  const seenList = () => visitedRef.current.slice(-MAX_SEEN);
  /** What was said about each exhibit and when the visitor was there (visitMemory.ts). */
  const detailsRef = useRef<Record<string, VisitRecord>>({});
  const [details, setDetails] = useState<Record<string, VisitRecord>>({});
  /** The earlier exhibit the app has just offered to say more about. */
  const pendingRef = useRef<VisitRecord | null>(null);
  const [pendingRecall, setPendingRecallState] = useState<VisitRecord | null>(null);
  /** The earlier exhibit being talked about from somewhere else (its visit time stays as it was). */
  const recalledKeyRef = useRef<string | null>(null);
  const recallRef = useRef<HTMLElement>(null);
  /** Re-renders "12 minutes ago" on the visited list. */
  const [now, setNow] = useState(() => Date.now());
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
  /** Aiming instructions: one plays at a time; newer ones wait and only the latest is said next. */
  const instructionQueue = useRef<{ busy: boolean; next: string | null }>({ busy: false, next: null });
  const cameraProblemRef = useRef<string | null>(null);
  /** Bumped to end the running conversation loop. */
  const loopRef = useRef(0);
  const talkingRef = useRef(false);
  const tourRef = useRef(0);
  const touringRef = useRef(false);
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
    setDebug(new URLSearchParams(window.location.search).get("debug") === "1");
    visitedRef.current = readVisited();
    detailsRef.current = readDetails();
    setDetails(detailsRef.current);
    setVisited(visitedRef.current);
    // Get the AI voice ready for the fixed lines before the first tap, so the
    // greeting and cues already sound like the answers (saved between visits).
    // Not with App voice off: the screen reader speaks, so the clips would never play.
    if (on) void prepareVoice([
      readPref("greeted") === "1" ? TOUR_START : FIRST_TOUR_START,
      WAIT_CUES.describe,
      "Hold still.",
      ...AIM_LINES,
      "Ask me about it, or say next.",
      "Let's find the next one.",
      "Still looking.",
      WAIT_CUES.answer,
      WAIT_CUES.more,
    ]);
    if (!recognitionSupported()) setTyping(true);
    const unsupported = cameraSupportError();
    if (unsupported) {
      cameraProblemRef.current = unsupported.reason;
      setCameraProblem(unsupported.reason);
    }
    // Never leave the camera or microphone on if the page goes away.
    return () => {
      tourRef.current++;
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
      await speak(text, { cloud: opts.cloud, rate });
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

  /** Resolves true when an answer was produced and spoken, false on an error or if cancelled. */
  async function run(req: DescribeRequest, kind: ResultKind, question?: string, lead?: string): Promise<boolean> {
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
    if (ctrl.signal.aborted || requestRef.current !== ctrl) return false;
    requestRef.current = null;
    go("idle");

    if (!out.ok) {
      cue.error();
      showError(out.error.message);
      await say(out.error.message);
      return false;
    }
    cue.done();
    if (kind === "describe") remember(out.data.subject);
    if (kind === "describe" || !baseRef.current) baseRef.current = out.data;
    noteVisit(kind, out.data, req.image);
    const next: Shown = { result: out.data, kind, question };
    shownRef.current = next;
    setShown(next);
    await say(spokenText(out.data, kind), { cloud: true });
    return true;
  }

  /** Adds a described subject to the visit memory (most recent last, no duplicates). */
  /** Adds a newly described exhibit to the visited list (first visit order, no duplicates). */
  function remember(subject: string) {
    const s = subject.trim();
    if (!s || /^something i couldn't name$/i.test(s)) return;
    if (visitedRef.current.some((x) => x.toLowerCase() === s.toLowerCase())) return;
    visitedRef.current = [...visitedRef.current, s].slice(-MAX_VISITED);
    setVisited(visitedRef.current);
    writeVisited(visitedRef.current);
  }

  function saveDetail(key: string, rec: VisitRecord) {
    detailsRef.current = { ...detailsRef.current, [key]: rec };
    setDetails(detailsRef.current);
    writeDetails(detailsRef.current);
  }

  /**
   * Remembers what was just said about the exhibit being talked about, so it can be
   * recalled later from somewhere else. A first look also keeps a small copy of the photo.
   */
  function noteVisit(kind: ResultKind, data: DescribeSuccess, image?: string) {
    const base = baseRef.current;
    if (!base || /^something i couldn't name$/i.test(base.subject.trim())) return;
    const key = keyOf(base.subject);
    const prev = detailsRef.current[key];
    let rec: VisitRecord = prev ?? { subject: base.subject.trim(), at: Date.now(), result: base, said: [] };
    // Being at the exhibit (a photo of it, or questions while there) updates the time; recalling it from elsewhere doesn't.
    if (kind === "describe" || recalledKeyRef.current !== key) rec = { ...rec, at: Date.now() };
    rec = addSaid(rec, spokenText(data, kind));
    saveDetail(key, rec);
    if (kind === "describe" && image) {
      void shrinkImage(image).then((thumb) => {
        const cur = detailsRef.current[key];
        if (thumb && cur) saveDetail(key, { ...cur, image: thumb });
      });
    }
  }

  function setPendingRecall(rec: VisitRecord | null) {
    pendingRef.current = rec;
    setPendingRecallState(rec);
  }

  /**
   * "Hey, the T. rex skeleton is an exhibit you visited 12 minutes ago. Would you
   * like to know more about it?" Then listens for yes or no; with a screen reader
   * (or no microphone) the Yes and No buttons stay on screen instead.
   */
  async function offerRecall(rec: VisitRecord): Promise<void> {
    setPendingRecall(rec);
    await say(`Hey, ${theName(rec.subject)} is an exhibit you visited ${timeAgo(rec.at)}. Would you like to know more about it?`);
    if (pendingRef.current !== rec) return; // answered with a button while speaking
    if (!voiceOnRef.current || !recognitionSupported()) return;
    const h = await hear();
    if (pendingRef.current !== rec) return; // answered with a button while listening
    setPendingRecall(null);
    if (h.kind === "silence") return say("Okay, I'll leave it.");
    if (h.kind !== "text") return;
    setHeard(h.text);
    const yn = parseYesNo(h.text);
    if (yn === "yes") return recall(rec);
    if (yn === "no") return say("Okay.");
    await perform(parseCommand(h.text), false);
  }

  /** Says more about an earlier exhibit, from its saved photo and everything said about it before. */
  async function recall(rec: VisitRecord) {
    setPendingRecall(null);
    const key = keyOf(rec.subject);
    recalledKeyRef.current = key;
    baseRef.current = rec.result;
    imageRef.current = rec.image ?? null;
    setPhotoUrl(rec.image ? `data:image/jpeg;base64,${rec.image}` : null);
    const previous = { subject: rec.subject, description: contextOf(rec) };
    const lead = `Going back to ${theName(rec.subject)}.`;
    if (rec.image) await run({ image: rec.image, mode: "detailed", previous }, "more", undefined, lead);
    // Photo not saved (storage full): a text-only follow-up still works.
    else
      await run(
        { mode: "detailed", question: "Tell me more about it, with details you haven't mentioned yet.", previous },
        "more",
        undefined,
        lead,
      );
  }

  /** "Go back to the T. rex", "tell me more about the giraffe", "the last one". */
  async function recallByName(cmd: Extract<VoiceCommand, { kind: "recall" }>, fromTap: boolean): Promise<void> {
    const records = Object.values(detailsRef.current);
    const currentKey = baseRef.current ? keyOf(baseRef.current.subject) : undefined;
    const rec = findVisit(cmd.query, records, currentKey);
    if (rec && keyOf(rec.subject) === currentKey) return more(); // the exhibit already being talked about
    if (rec) return offerRecall(rec);
    if (!cmd.nav) return askQuestion(cmd.text, fromTap); // "tell me about its teeth" is just a question
    if (!records.length) return say("You haven't visited any exhibits yet, so there's nothing to go back to.");
    const names = records.sort((a, b) => a.at - b.at).map((r) => theName(r.subject));
    await say(`I couldn't tell which exhibit you meant. You've visited ${spokenList(names)}. Say go back to, and one of those.`);
  }

  async function readVisitedAloud() {
    const v = visitedRef.current;
    if (!v.length) return say("You haven't visited any exhibits yet. Tap the screen to start the tour.");
    const count = v.length === 1 ? "one exhibit" : `${v.length} exhibits`;
    await say(`You've visited ${count}: ${spokenList(v)}.`);
  }

  async function newVisit() {
    visitedRef.current = [];
    setVisited([]);
    writeVisited([]);
    detailsRef.current = {};
    setDetails({});
    clearDetails();
    setPendingRecall(null);
    recalledKeyRef.current = null;
    await say("Okay, new visit. Your list of exhibits is cleared.");
  }

  async function sendImage(image: string, lead?: string) {
    recalledKeyRef.current = null;
    setPendingRecall(null);
    imageRef.current = image;
    setPhotoUrl(`data:image/jpeg;base64,${image}`);
    baseRef.current = null;
    const seen = visitedRef.current.length ? seenList() : undefined;
    return run({ image, mode: "default", seen }, "describe", undefined, lead);
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
  async function guide(fromTap: boolean, opts: { tour?: boolean } = {}): Promise<GuideOutcome> {
    if (cameraProblemRef.current) {
      if (opts.tour) return "failed";
      await describe(fromTap);
      return "described";
    }
    if (captureRef.current || guideRef.current) return "stopped";
    const video = videoRef.current;
    if (!video) return "stopped";
    const stopCtrl = new AbortController();
    const takeNow = new AbortController();
    guideRef.current = stopCtrl;
    takeNowRef.current = takeNow;
    lastInstruction.current = { text: "", at: 0 };
    showError("");
    setAimView({ text: "Hold the phone up in front of you.", move: "none", ready: false });
    go("guiding");
    // On a tour the tour itself says what's happening.
    if (!opts.tour) void say("Hold the phone up in front of you, and I'll help you aim. Tap the screen to take the photo yourself.");
    try {
      const result = await guideToPhoto(video, stopCtrl.signal, takeNow.signal, (aim, readyCount) => {
        let text = instructionFor(aim, readyCount);
        const before = aim.already_seen && aim.subject ? findVisit(aim.subject, Object.values(detailsRef.current)) : null;
        if (before)
          text = `That's ${theName(before.subject)}, which you visited ${timeAgo(before.at)}. Turn to find something new, or tap the screen to hear it again.`;
        setAimView({ text, move: aim.move, ready: aim.status === "ready" });
        const last = lastInstruction.current;
        const now = Date.now();
        // "Already heard about" is a long sentence: repeat it less often than a short move.
        const repeatAfter = aim.already_seen ? REPEAT_INSTRUCTION_MS * 3 : REPEAT_INSTRUCTION_MS;
        if (text !== last.text || now - last.at > repeatAfter) {
          lastInstruction.current = { text, at: now };
          cue.nudge();
          sayInstruction(text);
        }
      }, seenList());
      if (stopCtrl.signal.aborted) return "stopped";
      if (!result) {
        // The camera stopped sending pictures (for example, another app took it).
        throw new CameraError("The camera stopped before I could take the photo.");
      }
      // Camera is off now; guiding is over even while the description loads.
      if (guideRef.current === stopCtrl) guideRef.current = null;
      if (takeNowRef.current === takeNow) takeNowRef.current = null;
      setAimView(null);
      // An exhibit that isn't on the visited list was in view, just not framed perfectly.
      const newInView = result.lastStatus === "adjust" && !result.lastWasSeen;
      // On a tour, a timeout with nothing new in view means nothing new is in reach:
      // don't describe a blank wall or a familiar exhibit.
      if (opts.tour && result.how === "timeout" && !newInView) return "nothing-new";
      cue.capture();
      const lead =
        result.how === "stalled"
          ? "That's close enough."
          : result.how === "timeout" && newInView
            ? "That's the best view I could get, so I took the photo."
            : result.how === "timeout" && result.lastWasSeen
              ? "I only found things you've already heard about, so I took the photo anyway."
              : result.how === "timeout"
                ? "I couldn't find a clear view, so I took the photo anyway."
                : result.how === "unavailable"
                  ? "Aiming help isn't working right now, so I took the photo."
                  : undefined;
      const ok = await sendImage(result.frame, lead);
      // Without aiming help a tour would just photograph the same spot over and over.
      if (opts.tour && result.how === "unavailable") return "failed";
      return ok ? "described" : "describe-failed";
    } catch (err) {
      if (stopCtrl.signal.aborted) return "stopped";
      await cameraFailed(err);
      return "failed";
    } finally {
      if (guideRef.current === stopCtrl) guideRef.current = null;
      if (takeNowRef.current === takeNow) takeNowRef.current = null;
      setAimView(null);
      if (phaseRef.current === "guiding") go("idle");
    }
  }

  /**
   * Says an aiming instruction without cutting off the one before it. New
   * instructions arrive about once a second; if each one interrupted the last,
   * a line still waiting for its AI audio would never be heard. So the latest
   * waits its turn and older pending ones are dropped. Stops when aiming ends.
   */
  function sayInstruction(text: string) {
    const q = instructionQueue.current;
    if (q.busy) {
      q.next = text;
      return;
    }
    q.busy = true;
    void (async () => {
      try {
        let line: string | null = text;
        while (line && phaseRef.current === "guiding") {
          await say(line);
          line = q.next;
          q.next = null;
        }
      } finally {
        q.busy = false;
        q.next = null;
      }
    })();
  }

  /* ---------------------------------------------------------------- the tour ("I am here") */

  function endTour() {
    tourRef.current++;
    touringRef.current = false;
    setTouring(false);
  }

  /** Waits, but stops early if the tour ends. */
  async function tourWait(ms: number, my: number) {
    const until = Date.now() + ms;
    while (tourRef.current === my && Date.now() < until) await new Promise((r) => setTimeout(r, 200));
  }

  /**
   * "I am here": guide to the nearest exhibit not heard yet, describe it, leave
   * a short window for questions, then guide to the next one. Repeats until the
   * person says stop, pause or end tour, taps Cancel, or nothing new is in reach.
   */
  async function tour(fromTap: boolean, opening: string = TOUR_START) {
    if (cameraProblemRef.current) {
      await say(`${cameraProblemRef.current} The tour needs the camera. Tap Choose a photo to describe a picture instead.`);
      return;
    }
    if (touringRef.current) return;
    const my = ++tourRef.current;
    touringRef.current = true;
    setTouring(true);
    let empty = 0;
    let describeFailures = 0;
    try {
      await say(opening);
      while (tourRef.current === my) {
        const outcome = await guide(fromTap, { tour: true });
        if (tourRef.current !== my || outcome === "stopped") break;
        if (outcome === "failed") {
          if (!cameraProblemRef.current) await say("The tour has stopped. Tap the screen to try again.");
          break;
        }
        if (outcome === "describe-failed") {
          // The error was already spoken. Try once more, then stop rather than loop on errors.
          if (++describeFailures >= 2) {
            await say("I'm having trouble describing things right now, so the tour has stopped. Tap the screen to try again.");
            break;
          }
          await say("Let me try that again.");
          continue;
        }
        describeFailures = 0;
        if (outcome === "nothing-new") {
          if (++empty >= MAX_EMPTY_ROUNDS) {
            await say("I can't find anything new from here. Walk somewhere else, then tap the screen.");
            break;
          }
          await say("I don't see anything new here. Walk a few steps or turn around, and I'll look again.");
          await tourWait(TOUR_WALK_MS, my);
          continue;
        }
        empty = 0;
        if ((await tourBreak(my)) === "end") break;
        if (tourRef.current !== my) break;
        await say("Let's find the next one.");
      }
    } finally {
      if (tourRef.current === my) endTour();
    }
  }

  /** After each description: a short window to ask about it before moving on. */
  async function tourBreak(my: number): Promise<"next" | "end"> {
    if (!voiceOnRef.current || !recognitionSupported()) {
      // A screen reader is reading the answer, or there's no microphone: one exhibit per press.
      await say("Press I am here again for the next exhibit.");
      return "end";
    }
    await say("Ask me about it, or say next.");
    for (let turn = 0; turn < MAX_TOUR_QUESTIONS && tourRef.current === my; turn++) {
      const h = await hear();
      if (tourRef.current !== my || h.kind === "stopped" || h.kind === "unavailable") return "end";
      if (h.kind === "silence") return "next";
      setHeard(h.text);
      const cmd = parseCommand(h.text);
      if (cmd.kind === "stop" || cmd.kind === "pause") {
        cue.cancel();
        endConversation();
        await say("Tour ended. Tap the screen when you need me.");
        return "end";
      }
      // "next", "what's this", "I am here" or "help me aim": move on to the next exhibit.
      if (cmd.kind === "describe" || cmd.kind === "tour" || cmd.kind === "guide") return "next";
      await perform(cmd, false);
    }
    return "next";
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
        // So questions like "which was bigger, this or the T. rex?" work.
        seen: visitedRef.current.length ? seenList() : undefined,
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
  async function perform(cmd: VoiceCommand, fromTap: boolean): Promise<unknown> {
    switch (cmd.kind) {
      case "describe":
        return describe(fromTap);
      case "guide":
        return guide(fromTap);
      case "tour":
        return tour(fromTap);
      case "visited":
        return readVisitedAloud();
      case "recall":
        return recallByName(cmd, fromTap);
      case "newVisit":
        return newVisit();
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
    try {
      // Let the start tone finish so the microphone doesn't pick it up. Inside the
      // try, so a tap during this wait still resets the listening state below.
      await new Promise((r) => setTimeout(r, 300));
      if (ctrl.signal.aborted) return { kind: "stopped" };
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
      if (touringRef.current) {
        endTour();
        void say("Tour paused. Tap the screen to carry on.");
      } else {
        void say("Paused. Tap the screen to talk.");
      }
      return;
    }
    if (touringRef.current) {
      // On a tour a tap skips the current speech; between exhibits it pauses the tour.
      const wasSpeaking = speakingRef.current;
      quiet();
      if (!wasSpeaking) {
        endConversation();
        endTour();
        cue.cancel();
        void say("Tour paused. Tap the screen to carry on.");
      }
      return;
    }
    if (speakingRef.current) {
      // Interrupt: stop talking. A running conversation listens next by itself.
      quiet();
      if (!talkingRef.current) void converse();
      return;
    }
    quiet();
    // The default, hands-free flow: one tap starts the tour. Without a camera,
    // fall back to the spoken conversation (photos come from the picker then).
    if (cameraProblemRef.current) {
      void startConversation();
      return;
    }
    const first = readPref("greeted") !== "1";
    writePref("greeted", "1");
    void tour(true, first ? FIRST_TOUR_START : TOUR_START);
  }

  /** "Ask a question": the plain conversation, listening for a command, without the tour. */
  function startConversation() {
    unlock();
    quiet();
    const first = readPref("greetedTalk") !== "1";
    writePref("greetedTalk", "1");
    void converse(first ? FIRST_GREETING : GREETING);
  }

  function cancel() {
    unlock();
    const wasTouring = touringRef.current;
    endTour();
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
    void say(wasTouring ? "Tour ended. Tap the screen to talk." : "Cancelled. Tap the screen to talk.");
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

  useEffect(() => (debug ? onSoundLog(setSoundLines) : undefined), [debug]);

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
  /** The Yes and No buttons under "Would you like to know more about it?" */
  function answerRecall(yes: boolean) {
    unlock();
    const rec = pendingRef.current;
    if (!rec) return;
    setPendingRecall(null);
    listenRef.current?.abort(); // the spoken yes-or-no isn't needed now
    quiet();
    if (!yes) {
      cue.cancel();
      // A running conversation listens again straight away; otherwise say so out loud.
      if (voiceOnRef.current && !talkingRef.current) void say("Okay.");
      else announce("Okay.");
      return;
    }
    void (async () => {
      const wasTalking = talkingRef.current;
      endConversation();
      await recall(rec);
      if (wasTalking && voiceOnRef.current) void converse();
    })();
  }

  // The question goes to the top of the conversation and into view, so its buttons are never below the fold.
  useEffect(() => {
    if (pendingRecall) recallRef.current?.scrollIntoView({ block: "nearest" });
  }, [pendingRecall]);

  useEffect(() => {
    if (!visited.length) return;
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [visited.length]);

  function stopAll() {
    endTour();
    endConversation();
    quiet();
    cue.cancel();
  }
  const handlers = useRef({ onTalkButton, cancel, act, stopAll, startConversation });
  handlers.current = { onTalkButton, cancel, act, stopAll, startConversation };
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
      else if (k === "i") void h.act({ kind: "tour" });
      else if (k === "q") h.startConversation();
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
    idle: touring
      ? { word: "On tour", hint: "Finding the next exhibit. Tap to pause the tour.", tap: "Tap to pause the tour" }
      : { word: "Tap to start", hint: "Hold the phone up. I'll lead you to each exhibit and describe it.", tap: "Starts the tour" },
    listening: touring
      ? { word: "Listening", hint: "Ask about this exhibit, or say “next” or “end tour”.", tap: "Tap to pause the tour" }
      : { word: "Listening", hint: "Say “what's this”, ask a question, or say “pause”.", tap: "Tap to pause listening" },
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
        {touring && <span className="badge">On tour</span>}
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
          {pendingRecall && !busy && (
            <section className="recall" aria-labelledby="recall-q" ref={recallRef}>
              <p id="recall-q">
                {theName(pendingRecall.subject).replace(/^the /, "The ")}: you visited it {timeAgo(pendingRecall.at, now)}. Would you
                like to know more about it?
              </p>
              <div className="recall-row">
                <button type="button" className="btn btn-yes" onClick={() => answerRecall(true)}>
                  Yes, tell me more
                </button>
                <button type="button" className="btn" onClick={() => answerRecall(false)}>
                  No
                </button>
              </div>
            </section>
          )}

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

          {visited.length > 0 && (
            <section className="visited" aria-labelledby="visited-h">
              <h2 id="visited-h">
                Exhibits visited <span className="visited-count">{visited.length}</span>
              </h2>
              <ol>
                {visited.map((v) => {
                  const rec = details[keyOf(v)];
                  return (
                    <li key={v}>
                      {rec ? (
                        <button type="button" className="visit" onClick={() => void act({ kind: "recall", query: v, nav: true, text: v })}>
                          <span className="visit-name">{v}</span>
                          <span className="visit-when">{timeAgo(rec.at, now)}</span>
                          <span className="sr-only">. Hear more about it</span>
                        </button>
                      ) : (
                        v
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
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
        {touring ? (
          <button type="button" className="btn btn-wide" onClick={cancel} aria-keyshortcuts="Escape">
            End tour
          </button>
        ) : busy ? (
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
            {!cameraProblem && (
              <button type="button" className="btn btn-wide" onClick={startConversation} aria-keyshortcuts="Q">
                <MicIcon />
                Ask a question
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
      {debug && (
        <section className="sound-debug" aria-label="Sound check">
          <button
            type="button"
            className="btn"
            onClick={() => {
              unlock();
              cue.done();
              logSound("test 0: chime (Web Audio)");
              void testVoices();
            }}
          >
            Test sound
          </button>
          <ol>
            {soundLines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
        </section>
      )}

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
