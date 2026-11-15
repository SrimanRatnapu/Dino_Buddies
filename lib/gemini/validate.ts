import type { DescribeRequest, DescribeSuccess, DescribeMode, Confidence } from "@/shared/contract";
import { ApiFailure } from "@/lib/http/errors";

/** ~6 MB of base64 is far above a 1024px JPEG (usually 100-400 KB). */
const MAX_BASE64_CHARS = 6_000_000;
const MAX_QUESTION_CHARS = 500;

export interface ParsedRequest {
  image?: { data: string; mimeType: string };
  mode: DescribeMode;
  question?: string;
  previous?: { subject: string; description: string };
  seen?: string[];
}

const MAX_SEEN = 8;

/** Validates a `seen` list: up to 8 short, non-empty strings, most recent kept. */
export function parseSeen(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.replace(/[\r\n"]+/g, " ").trim().slice(0, 80))
    .filter(Boolean);
  return items.length ? items.slice(-MAX_SEEN) : undefined;
}

/** Detects the real image type from magic bytes so a PNG or WebP still works. */
function sniffMime(b64: string): string | null {
  const head = Buffer.from(b64.slice(0, 24), "base64");
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return "image/png";
  if (head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (head.toString("ascii", 4, 12).startsWith("ftyphei")) return "image/heic";
  return null;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Validates a base64 image field. Returns undefined if empty. Strips a stray
 * data: prefix and detects the real type, so PNG/WebP/HEIC also work.
 */
export function parseImage(value: unknown, maxChars = MAX_BASE64_CHARS): ParsedRequest["image"] {
  let b64 = str(value);
  if (!b64) return undefined;
  b64 = b64.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  if (b64.length > maxChars) throw new ApiFailure("image_too_large");
  if (!/^[A-Za-z0-9+/_-]+=*$/.test(b64)) throw new ApiFailure("bad_request", undefined, "image not base64");
  const mimeType = sniffMime(b64);
  if (!mimeType) throw new ApiFailure("bad_request", undefined, "image not a JPEG/PNG/WebP/HEIC");
  return { data: b64, mimeType };
}

/**
 * Validates a /api/describe body. Lenient where it costs nothing (strips a
 * stray data: prefix, accepts PNG/WebP), strict where bad input would waste a
 * Gemini call.
 */
export function parseDescribeRequest(raw: unknown): ParsedRequest {
  if (!raw || typeof raw !== "object") throw new ApiFailure("bad_request", undefined, "body not an object");
  const body = raw as Partial<DescribeRequest> & Record<string, unknown>;

  const mode: DescribeMode = body.mode === "detailed" ? "detailed" : "default";

  const question = str(body.question).slice(0, MAX_QUESTION_CHARS) || undefined;

  let previous: ParsedRequest["previous"];
  if (body.previous && typeof body.previous === "object") {
    const subject = str(body.previous.subject).slice(0, 200);
    const description = str(body.previous.description).slice(0, 2000);
    if (subject || description) previous = { subject, description };
  }

  const image = parseImage(body.image);

  // A first description needs an image. A follow-up can be text-only if the
  // previous description is supplied.
  if (!image && !(question && previous)) {
    throw new ApiFailure("bad_request", undefined, "missing image");
  }

  return { image, mode, question, previous, seen: parseSeen(body.seen) };
}

/** Internal model output: the contract fields plus `usable`. */
export interface ModelOutput extends DescribeSuccess {
  usable?: boolean;
}

// Server never returns safety advice (contract rule). The prompt forbids it;
// this drops any sentence that slips through anyway.
const SAFETY_SENTENCE =
  /\b(safe|unsafe|dangerous|harmless)\b[^.!?]*\b(approach|touch|pet|feed|handle|get close|go near)\b|\b(do not|don't|never)\s+(approach|touch|pet|feed|handle)\b/i;

// Museum handling tables invite touching casts and replicas. Saying so is
// exhibit information, not advice about approaching a live animal.
const TOUCH_EXHIBIT =
  /\b(cast|replica|model|reproduction|sculpture|statue|touch (table|exhibit|station)|handling (table|collection))\b/i;

function stripSafetyAdvice(text: string): string {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  return sentences.filter((s) => !SAFETY_SENTENCE.test(s) || TOUCH_EXHIBIT.test(s)).join("").trim();
}

/** Makes speech-friendly: no markdown, no stray whitespace. */
function clean(text: unknown, max = 1500): string {
  return stripSafetyAdvice(
    str(text)
      .replace(/[*_#`>]+/g, "")
      .replace(/\s+/g, " ")
      .slice(0, max),
  );
}

/**
 * Turns whatever the model returned into a valid contract response, enforcing
 * the confidence/caveats rule. Throws unclear_image if the model says the
 * image is unusable.
 */
export function normalize(out: Partial<ModelOutput>): DescribeSuccess {
  const subject = clean(out.subject, 120) || "Something I couldn't name";
  let description = clean(out.description);

  if (out.usable === false) {
    throw new ApiFailure("unclear_image", description || undefined, "model said unusable");
  }
  if (!description) {
    if (!str(out.description)) throw new ApiFailure("model_error", undefined, "empty description");
    // Everything was safety advice and got removed. Still answer, plainly.
    description = `I can see: ${subject}.`;
  }

  const confidence: Confidence =
    out.confidence === "high" || out.confidence === "medium" || out.confidence === "low"
      ? out.confidence
      : "low";

  let caveats = clean(out.caveats, 300);
  if (confidence === "high") caveats = "";
  else if (!caveats) caveats = "I'm not completely sure about this.";

  return {
    subject,
    confidence,
    description,
    size_comparison: clean(out.size_comparison, 200),
    fun_fact: clean(out.fun_fact, 400),
    caveats,
  };
}
