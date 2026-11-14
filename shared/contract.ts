// Types mirroring "The contract" in CLAUDE.md. Version: v1.
// Shared file: change only by agreement between A and B, and log the change
// under CONTRACT CHANGES in CLAUDE.md.

export const CONTRACT_VERSION = "v1";

export type DescribeMode = "default" | "detailed";
export type Confidence = "high" | "medium" | "low";

/** POST /api/describe request body. */
export interface DescribeRequest {
  /** Base64 JPEG, long edge max 1024px, no `data:` prefix. */
  image: string;
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

/** 4xx/5xx response body. `message` is read aloud, so it is a plain sentence. */
export interface ApiError {
  error: { code: string; message: string };
}

/** POST /api/speak request body. Response is audio/mpeg bytes. */
export interface SpeakRequest {
  text: string;
}
