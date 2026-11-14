import { ApiError, type Part } from "@google/genai";
import type { DescribeSuccess } from "@/shared/contract";
import { SYSTEM_PROMPT, describeUserPrompt, followUpUserPrompt } from "@/prompts/describe";
import { ApiFailure } from "@/lib/http/errors";
import { GEMINI_MODEL, GEMINI_FALLBACK_MODEL, GEMINI_TIMEOUT_MS } from "./config";
import { callModel as callJson, mapError } from "./client";
import { normalize, type ModelOutput, type ParsedRequest } from "./validate";

/** JSON schema Gemini must follow. Mirrors DescribeSuccess plus `usable`. */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    usable: { type: "boolean" },
    subject: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    caveats: { type: "string" },
    description: { type: "string" },
    size_comparison: { type: "string" },
    fun_fact: { type: "string" },
  },
  required: ["subject", "confidence", "description", "size_comparison", "fun_fact", "caveats", "usable"],
} as const;

function callModel(model: string, parts: Part[], signal: AbortSignal) {
  return callJson(model, parts, signal, {
    system: SYSTEM_PROMPT,
    schema: RESPONSE_SCHEMA,
    temperature: 0.4,
    // Room for the longest reply ("tell me more", about 140 words of JSON)
    // plus any thinking the model still does.
    maxOutputTokens: 4096,
  });
}

export interface DescribeResult {
  body: DescribeSuccess;
  model: string;
  ms: number;
}

export async function describe(req: ParsedRequest): Promise<DescribeResult> {
  const parts: Part[] = [];
  if (req.image) parts.push({ inlineData: { mimeType: req.image.mimeType, data: req.image.data } });
  parts.push({
    text: req.question
      ? followUpUserPrompt(req.question, req.previous, req.mode)
      : describeUserPrompt(req.mode, req.previous),
  });

  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);

  let model = GEMINI_MODEL;
  try {
    let res;
    try {
      res = await callModel(model, parts, ctrl.signal);
    } catch (err) {
      // Retired or misspelled model name: retry once on the alias.
      if (err instanceof ApiError && err.status === 404 && GEMINI_FALLBACK_MODEL !== model) {
        console.warn(`[gemini] ${model} returned 404, retrying with ${GEMINI_FALLBACK_MODEL}`);
        model = GEMINI_FALLBACK_MODEL;
        res = await callModel(model, parts, ctrl.signal);
      } else if (err instanceof ApiError && (err.status === 500 || err.status === 503)) {
        // One quick retry on transient server errors.
        res = await callModel(model, parts, ctrl.signal);
      } else {
        throw err;
      }
    }

    const text = res.text;
    const finish = res.candidates?.[0]?.finishReason;
    if (finish === "MAX_TOKENS") {
      throw new ApiFailure("model_error", undefined, `reply cut off at maxOutputTokens (model=${model})`);
    }
    if (!text) {
      const reason = res.candidates?.[0]?.finishReason ?? res.promptFeedback?.blockReason;
      throw new ApiFailure("model_error", undefined, `no text, reason=${reason}`);
    }

    let parsed: Partial<ModelOutput>;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ApiFailure("model_error", undefined, `bad JSON: ${text.slice(0, 200)}`);
    }

    return { body: normalize(parsed), model, ms: Date.now() - started };
  } catch (err) {
    throw mapError(err);
  } finally {
    clearTimeout(timer);
  }
}
