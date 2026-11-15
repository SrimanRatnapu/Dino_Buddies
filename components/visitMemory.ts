// What the app remembers about each exhibit this visit, so a visitor standing
// somewhere else can say "go back to the T. rex" and hear more about it.
// Kept for the browser tab's lifetime (sessionStorage), like the visited list:
// a reload mid-visit keeps it, a new visit starts fresh.

import type { DescribeSuccess } from "@/shared/contract";

export interface VisitRecord {
  subject: string;
  /** When the visitor was last at this exhibit (ms). Recalling it from elsewhere doesn't change this. */
  at: number;
  /** The first full description, for the screen when it is recalled. */
  result: DescribeSuccess;
  /** Everything spoken about it so far, oldest first: the description, "more", answers. */
  said: string[];
  /** A small copy of the photo (base64 JPEG, about 512px), so Gemini can look again. */
  image?: string;
}

const KEY = "visitDetails";
const MAX_SAID = 8;
/** The server keeps at most 2000 characters of `previous.description`. */
const MAX_CONTEXT = 1800;
const THUMB_EDGE = 512;

export const keyOf = (subject: string) => subject.trim().toLowerCase();

export function readDetails(): Record<string, VisitRecord> {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
    if (!v || typeof v !== "object") return {};
    const out: Record<string, VisitRecord> = {};
    for (const [k, r] of Object.entries(v as Record<string, VisitRecord>)) {
      // Older saves kept the photo inline; newer ones keep it under its own key.
      out[k] = { ...r, image: r.image ?? sessionStorage.getItem(PHOTO_KEY(k)) ?? undefined };
    }
    return out;
  } catch {
    return {};
  }
}

const PHOTO_KEY = (key: string) => `visitPhoto:${key}`;

/**
 * Saves the details. Photos are stored under their own keys and written only
 * when they change, so an answer doesn't re-serialize every saved photo. If
 * storage is full, the oldest photos are dropped (the text still works).
 */
export function writeDetails(details: Record<string, VisitRecord>): void {
  try {
    const text: Record<string, VisitRecord> = {};
    for (const [k, r] of Object.entries(details)) text[k] = { ...r, image: undefined };
    sessionStorage.setItem(KEY, JSON.stringify(text));
  } catch {
    return; // storage unavailable: memory still works for this page
  }
  const oldestFirst = Object.entries(details).sort(([, a], [, b]) => a.at - b.at);
  for (const [k, r] of oldestFirst) {
    if (!r.image) continue;
    try {
      if (sessionStorage.getItem(PHOTO_KEY(k)) === r.image) continue;
      sessionStorage.setItem(PHOTO_KEY(k), r.image);
    } catch {
      // Full: drop the oldest saved photo and give up on this one for now.
      const oldest = oldestFirst.find(([ok]) => ok !== k && sessionStorage.getItem(PHOTO_KEY(ok)));
      if (oldest) sessionStorage.removeItem(PHOTO_KEY(oldest[0]));
    }
  }
}

export function clearDetails(): void {
  try {
    sessionStorage.removeItem(KEY);
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith("visitPhoto:")) sessionStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
}

/** "the Tyrannosaurus rex skeleton", for speaking. */
export function theName(subject: string): string {
  return `the ${subject.trim().replace(/^(the|a|an)\s+/i, "")}`;
}

/** "12 minutes ago", "less than a minute ago", "about an hour ago". */
export function timeAgo(at: number, now = Date.now()): string {
  const min = Math.floor(Math.max(0, now - at) / 60000);
  if (min < 1) return "less than a minute ago";
  if (min === 1) return "1 minute ago";
  if (min < 55) return `${min} minutes ago`;
  const hours = Math.round(min / 60);
  return hours <= 1 ? "about an hour ago" : `about ${hours} hours ago`;
}

/** Everything said about an exhibit, newest last, cut to what the server accepts. */
export function contextOf(rec: VisitRecord): string {
  let text = rec.said.join(" ");
  if (text.length > MAX_CONTEXT) text = "…" + text.slice(text.length - MAX_CONTEXT);
  return text;
}

export function addSaid(rec: VisitRecord, text: string): VisitRecord {
  const t = text.trim();
  if (!t || rec.said[rec.said.length - 1] === t) return rec;
  return { ...rec, said: [...rec.said, t].slice(-MAX_SAID) };
}

const STOP = new Set([
  "the", "a", "an", "of", "that", "this", "one", "it", "its", "exhibit", "thing", "again", "there", "we", "i",
  "saw", "seen", "visited", "earlier", "before", "with", "and", "big", "about",
]);

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\bt\.?\s*-?\s*rex\b/g, "tyrannosaurus rex") // "T. rex", "t-rex", "trex"
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

const sameWord = (a: string, b: string) =>
  a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))); // giraffe/giraffes

/**
 * Finds the visited exhibit a spoken name refers to. Order words ("the last one",
 * "the first one", "the one before") pick by time. Returns null when nothing fits
 * clearly, or when two exhibits fit equally well.
 */
export function findVisit(query: string, records: VisitRecord[], currentKey?: string): VisitRecord | null {
  if (!records.length) return null;
  const q = query.toLowerCase();
  const byTime = [...records].sort((a, b) => a.at - b.at);
  if (/\b(first)\b/.test(q)) return byTime[0];
  if (/\b(last|previous|one before|other one)\b/.test(q)) {
    const others = byTime.filter((r) => keyOf(r.subject) !== currentKey);
    return others[others.length - 1] ?? null;
  }
  const qw = words(query);
  if (!qw.length) return null;
  let best: VisitRecord | null = null;
  let bestScore = 0;
  let tie = false;
  for (const r of records) {
    const sw = words(r.subject);
    const hits = qw.filter((w) => sw.some((s) => sameWord(w, s))).length;
    const score = hits / qw.length;
    if (score > bestScore) {
      best = r;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) tie = true;
  }
  return bestScore >= 0.5 && !tie ? best : null;
}

/** A smaller copy of a base64 JPEG for storage, or undefined if it can't be made. */
export function shrinkImage(b64: string, edge = THUMB_EDGE): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(undefined);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, edge / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) return resolve(undefined);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", 0.72).replace(/^data:image\/jpeg;base64,/, ""));
    };
    img.onerror = () => resolve(undefined);
    img.src = `data:image/jpeg;base64,${b64}`;
  });
}
