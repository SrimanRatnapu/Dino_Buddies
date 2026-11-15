// "Guide me": live aiming help. The camera stays on while guiding. About once
// a second a small frame goes to POST /api/aim, which says which way to move
// the phone. After two "ready" answers in a row, one full photo is taken and
// the camera turns off. The user can take the photo early at any time, and a
// timeout or repeated failures take it anyway, so nobody is left stuck.

import type { AimMove, AimResponse, ApiError } from "@/shared/contract";
import aimFixtures from "@/fixtures/aim.json";
import { captureFrame, openCamera, sleep } from "./camera";
import { clientMockEnabled } from "./describeClient";

/** Aiming frames are small: guidance needs layout, not detail. */
const AIM_EDGE = 512;
const AIM_QUALITY = 0.6;
/** At most about one request a second. */
const MIN_INTERVAL_MS = 900;
const REQUEST_TIMEOUT_MS = 7000;
/** Give up guiding and take the photo after this long. */
export const GUIDE_TIMEOUT_MS = 25_000;
/** Ready answers needed in a row before taking the photo. */
const READY_STREAK = 2;
const SETTLE_MS = 400;

/** "stalled": the same instruction kept coming back, so the view is taken as good enough. */
export type GuideEnd = "ready" | "manual" | "timeout" | "unavailable" | "stalled";

/**
 * The same instruction this many times in a row means the person can't, or
 * needn't, do more: take the photo rather than loop. Moving closer or back is
 * often blocked by a barrier, so those give up sooner than turning or tilting.
 */
const STALL_REPEATS: Record<AimMove, number> = { closer: 3, back: 3, left: 6, right: 6, up: 6, down: 6, none: 6 };

export interface GuideResult {
  /** Full-size photo, base64 JPEG. */
  frame: string;
  how: GuideEnd;
  /** What the aiming model last said was in view, if anything. */
  subject: string;
  /** The last reply said the only attraction in view was one already described this visit. */
  lastWasSeen: boolean;
  /** The last reply's status, or null if there was none: "adjust" means an attraction was in view. */
  lastStatus: AimResponse["status"] | null;
}

const MOVES: Record<AimMove, string> = {
  left: "Turn a little to the left.",
  right: "Turn a little to the right.",
  up: "Tilt the phone up.",
  down: "Tilt the phone down.",
  back: "Step back a little.",
  closer: "Move a little closer.",
  none: "Hold still.",
};
const GOT_IT = "Got it.";
const HOLD_IT = "Good. Hold still.";
const SEARCHING = "I don't see an exhibit yet. Turn slowly.";

/** Every fixed aiming line, so the AI voice can be prepared for them ahead of time. */
export const AIM_LINES = [...Object.values(MOVES), GOT_IT, HOLD_IT, SEARCHING];

/** Spoken instruction for an aiming reply. */
export function instructionFor(aim: AimResponse, readyCount: number): string {
  if (aim.already_seen) {
    const what = aim.subject ? `the ${aim.subject.replace(/^(the|a|an)\s+/i, "")}` : "an exhibit";
    return `That's ${what} you already heard about. Turn to find something new, or tap the screen to hear it again.`;
  }
  if (aim.status === "ready") return readyCount >= READY_STREAK ? GOT_IT : HOLD_IT;
  if (aim.status === "searching") return SEARCHING;
  return MOVES[aim.move];
}

/** AbortSignal.any, with a fallback for older Safari. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if ("any" in AbortSignal) return AbortSignal.any(signals);
  const c = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      c.abort();
      break;
    }
    s.addEventListener("abort", () => c.abort(), { once: true });
  }
  return c.signal;
}

function timeoutSignal(ms: number): AbortSignal {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

let mockStep = 0;

async function requestAim(image: string, signal: AbortSignal, seen: string[]): Promise<AimResponse | null> {
  if (clientMockEnabled()) {
    await sleep(500, signal);
    const seq = aimFixtures.sequence as AimResponse[];
    return signal.aborted ? null : seq[mockStep++ % seq.length];
  }
  const timeout = timeoutSignal(REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch("/api/aim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(seen.length ? { image, seen } : { image }),
      signal: anySignal([signal, timeout]),
    });
    const body = (await res.json().catch(() => null)) as AimResponse | ApiError | null;
    if (res.ok && body && "status" in body) return body;
    return null;
  } catch {
    return null;
  }
}

/**
 * Guides the user to a good view, then returns one full photo. `stopSignal`
 * cancels (returns null, camera off). `takeNowSignal` takes the photo
 * straight away. `onAim` gets each reply as it arrives.
 * Throws CameraError if the camera can't start.
 */
export async function guideToPhoto(
  video: HTMLVideoElement,
  stopSignal: AbortSignal,
  takeNowSignal: AbortSignal,
  onAim: (aim: AimResponse, readyCount: number) => void,
  /** Subjects already described this visit; guidance prefers something new. */
  seen: string[] = [],
): Promise<GuideResult | null> {
  const stop = await openCamera(video, stopSignal);
  if (!stop) return null;

  let lastWasSeen = false;
  let lastStatus: AimResponse["status"] | null = null;
  const take = (how: GuideEnd, subject: string): GuideResult | null => {
    const frame = captureFrame(video);
    return frame ? { frame, how, subject, lastWasSeen, lastStatus } : null;
  };

  try {
    await sleep(SETTLE_MS, stopSignal);
    const started = Date.now();
    const either = anySignal([stopSignal, takeNowSignal]);
    let ready = 0;
    let failures = 0;
    let subject = "";
    let lastMove: AimMove | null = null;
    let sameMove = 0;

    while (!stopSignal.aborted) {
      if (takeNowSignal.aborted) return take("manual", subject);
      if (Date.now() - started > GUIDE_TIMEOUT_MS) return take("timeout", subject);

      const small = captureFrame(video, AIM_EDGE, AIM_QUALITY);
      const sent = Date.now();
      const aim = small ? await requestAim(small, either, seen) : null;
      if (stopSignal.aborted) return null;
      if (takeNowSignal.aborted) return take("manual", subject);

      if (!aim) {
        // Guidance unavailable (not configured, rate limited, offline): don't
        // leave the user waiting. Take the photo after two failures in a row.
        if (++failures >= 2) return take("unavailable", subject);
      } else {
        failures = 0;
        if (aim.subject) subject = aim.subject;
        lastWasSeen = Boolean(aim.already_seen);
        lastStatus = aim.status;
        // Something already heard about is never auto-captured: the user taps to hear it again.
        ready = aim.status === "ready" && !aim.already_seen ? ready + 1 : 0;
        onAim(aim, ready);
        if (ready >= READY_STREAK) return take("ready", subject);
        // A new attraction is in view but the same instruction keeps coming back.
        if (aim.status === "adjust" && !aim.already_seen) {
          sameMove = aim.move === lastMove ? sameMove + 1 : 1;
          lastMove = aim.move;
          if (sameMove >= STALL_REPEATS[aim.move]) return take("stalled", subject);
        } else {
          lastMove = null;
          sameMove = 0;
        }
      }
      await sleep(Math.max(0, MIN_INTERVAL_MS - (Date.now() - sent)), either);
    }
    return null;
  } finally {
    stop();
  }
}
