// Non-visual confirmation: short tones (earcons) plus vibration where supported.
// Every state change gets one, so the app can be used without seeing the screen.

let ctx: AudioContext | null = null;

/** Call from inside a user gesture so the AudioContext is allowed to start. */
export function unlockCues(): void {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const C =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (C) ctx = new C();
  }
  if (ctx?.state === "suspended") ctx.resume().catch(() => {});
}

function tones(seq: Array<[freq: number, seconds: number]>, type: OscillatorType = "sine", volume = 0.18) {
  if (!ctx) return;
  let t = ctx.currentTime + 0.01;
  for (const [freq, dur] of seq) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    t += dur + 0.03;
  }
}

function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

export const cue = {
  /** Photo taken. */
  capture() {
    tones([[1046, 0.05], [1568, 0.07]]);
    vibrate(30);
  },
  /** Microphone is open. */
  listen() {
    tones([[587, 0.08], [880, 0.12]]);
    vibrate([20, 50, 20]);
  },
  /** Answer ready. */
  done() {
    tones([[784, 0.09], [1175, 0.16]]);
    vibrate(60);
  },
  /** Something went wrong. */
  error() {
    tones([[392, 0.14], [262, 0.24]], "triangle");
    vibrate([90, 60, 90]);
  },
  /** New aiming instruction (soft, so it doesn't compete with speech). */
  nudge() {
    tones([[880, 0.04]], "sine", 0.08);
    vibrate(15);
  },
  /** Cancelled or stopped. */
  cancel() {
    tones([[660, 0.07]]);
    vibrate(20);
  },
};
