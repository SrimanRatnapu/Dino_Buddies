// Types mirroring "The contract" in CLAUDE.md. Version: v1.
// Shared file: change only by agreement between A and B, and log the change
// under CONTRACT CHANGES in CLAUDE.md.

export const CONTRACT_VERSION = "v1.1";

export type DescribeMode = "default" | "detailed";
export type Confidence = "high" | "medium" | "low";

/** POST /api/describe request body. */
export interface DescribeRequest {
  /**
   * Base64 JPEG, long edge max 1024px, no `data:` prefix. Required for a first
   * look. May be omitted on a follow-up when `question` and `previous` are
   * sent, though sending it is preferred.
   */
  image?: string;
  mode: DescribeMode;
  /** Optional follow-up question. */
  question?: string;
  /** The earlier result this follow-up refers to. */
  previous?: { subject: string; description: string };
}

/** POST /api/describe 200 response. */
export interface DescribeSuccess {
  subject: string;
  confidence: Confidence;
  /** Spoken-ready, plain language. */
  description: string;
  size_comparison: string;
  fun_fact: string;
  /** Empty string if none. Spoken first when confidence is not "high". */
  caveats: string;
}

/** Error codes the server sends, with their HTTP status. */
export type ApiErrorCode =
  | "bad_request" // 400
  | "image_too_large" // 413
  | "unclear_image" // 422
  | "rate_limited" // 429, with a Retry-After header
  | "not_configured" // 503
  | "model_error" // 502
  | "timeout"; // 504

/**
 * 4xx/5xx response body. `message` is read aloud, so it is a plain sentence.
 * `code` is one of ApiErrorCode from the server; the client also makes its own
 * codes (network, cancelled) for failures that never reach the server.
 */
export interface ApiError {
  error: { code: ApiErrorCode | (string & {}); message: string };
}

/**
 * POST /api/aim (v1.1): aiming guidance for one low-resolution live frame.
 * Called about once a second while the user holds the phone up.
 */
export interface AimRequest {
  /** Base64 JPEG, long edge about 512px, no `data:` prefix. */
  image: string;
}

/** Which way to move the phone. Image left is the user's left (rear camera). */
export type AimMove = "left" | "right" | "up" | "down" | "back" | "closer" | "none";

/** POST /api/aim 200 response. Errors use ApiError like /api/describe. */
export interface AimResponse {
  /** ready: good view, take the photo. adjust: follow `move`. searching: no clear subject in view. */
  status: "ready" | "adjust" | "searching";
  /** "none" unless status is "adjust". */
  move: AimMove;
  /** A few words naming what's in view, or "" when searching. */
  subject: string;
}

/** POST /api/speak request body. Response is audio/mpeg bytes. */
export interface SpeakRequest {
  text: string;
}
