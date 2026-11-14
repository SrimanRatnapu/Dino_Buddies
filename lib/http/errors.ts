import type { ApiError } from "@/shared/contract";

export type ErrorCode =
  | "bad_request"
  | "image_too_large"
  | "unclear_image"
  | "rate_limited"
  | "timeout"
  | "not_configured"
  | "model_error";

/** Every message here is read aloud to a blind user. Keep them plain and short. */
export const SPOKEN: Record<ErrorCode, string> = {
  bad_request: "Something went wrong sending the picture. Please try again.",
  image_too_large: "That picture was too large to send. Please try again.",
  unclear_image: "I couldn't see that clearly. Try again with more light.",
  rate_limited: "I'm getting a lot of requests right now. Please wait a few seconds and try again.",
  timeout: "That took too long. Please try again.",
  not_configured: "The description service isn't set up yet.",
  model_error: "I couldn't describe that right now. Please try again.",
};

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  image_too_large: 413,
  unclear_image: 422,
  rate_limited: 429,
  timeout: 504,
  not_configured: 503,
  model_error: 502,
};

export class ApiFailure extends Error {
  constructor(
    public code: ErrorCode,
    public spoken: string = SPOKEN[code],
    detail?: string,
  ) {
    super(detail || code);
  }
}

export function errorJson(code: ErrorCode, message: string = SPOKEN[code]) {
  const body: ApiError = { error: { code, message } };
  return Response.json(body, {
    status: STATUS[code],
    headers: { "Cache-Control": "no-store" },
  });
}
