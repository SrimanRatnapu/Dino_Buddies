import { ApiError } from "@google/genai";
import type { AimMove, AimResponse } from "@/shared/contract";
import { AIM_SYSTEM_PROMPT, aimUserPrompt } from "@/prompts/aim";
import { ApiFailure } from "@/lib/http/errors";
import { AIM_MODEL, AIM_TIMEOUT_MS, GEMINI_MODEL } from "./config";
import { callModel, mapError } from "./client";
import type { ParsedRequest } from "./validate";

const MOVES: AimMove[] = ["left", "right", "up", "down", "back", "closer", "none"];

/** JSON schema for aiming replies. Mirrors AimResponse. */
const AIM_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ready", "adjust", "searching"] },
    move: { type: "string", enum: MOVES },
    subject: { type: "string" },
    already_seen: { type: "boolean" },
  },
  required: ["status", "move", "subject", "already_seen"],
} as const;

/**
 * Makes any model reply a valid AimResponse. `hadSeen` is whether the request
 * listed earlier exhibits; without a list nothing can be "already seen".
 */
export function normalizeAim(out: Partial<AimResponse>, hadSeen = false): AimResponse {
  const status = out.status === "ready" || out.status === "adjust" ? out.status : "searching";
  let move: AimMove = MOVES.includes(out.move as AimMove) ? (out.move as AimMove) : "none";
  if (status !== "adjust") move = "none";
  // "adjust" without a direction is no help to the user: treat it as ready.
  const fixedStatus = status === "adjust" && move === "none" ? "ready" : status;
  const subject = status === "searching" ? "" : (typeof out.subject === "string" ? out.subject : "").trim().slice(0, 60);
  const alreadySeen = hadSeen && fixedStatus !== "searching" && out.already_seen === true;
  return { status: fixedStatus, move, subject, already_seen: alreadySeen };
}

export async function aim(image: NonNullable<ParsedRequest["image"]>, seen?: string[]) {
  const parts = [{ inlineData: { mimeType: image.mimeType, data: image.data } }, { text: aimUserPrompt(seen) }];
  const opts = { system: AIM_SYSTEM_PROMPT, schema: AIM_SCHEMA, temperature: 0.1, maxOutputTokens: 1024 };
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AIM_TIMEOUT_MS);
  let model = AIM_MODEL;
  try {
    let res;
    try {
      res = await callModel(model, parts, ctrl.signal, opts);
    } catch (err) {
      // Aiming model not available to this project: use the main model instead.
      if (err instanceof ApiError && err.status === 404 && model !== GEMINI_MODEL) {
        console.warn(`[aim] ${model} returned 404, retrying with ${GEMINI_MODEL}`);
        model = GEMINI_MODEL;
        res = await callModel(model, parts, ctrl.signal, opts);
      } else {
        throw err;
      }
    }
    const text = res.text;
    if (!text) throw new ApiFailure("model_error", undefined, `aim: no text, reason=${res.candidates?.[0]?.finishReason}`);
    let parsed: Partial<AimResponse>;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiFailure("model_error", undefined, `aim: bad JSON: ${text.slice(0, 120)}`);
    }
    return { body: normalizeAim(parsed, Boolean(seen?.length)), model, ms: Date.now() - started };
  } catch (err) {
    throw mapError(err);
  } finally {
    clearTimeout(timer);
  }
}
