import { GoogleGenAI, ApiError, ThinkingLevel, type Part, type ThinkingConfig } from "@google/genai";
import type { DescribeSuccess } from "@/shared/contract";
import { SYSTEM_PROMPT, describeUserPrompt, followUpUserPrompt } from "@/prompts/describe";
import { ApiFailure } from "@/lib/http/errors";
import { GEMINI_MODEL, GEMINI_FALLBACK_MODEL, GEMINI_TIMEOUT_MS, USE_VERTEX, GCP_PROJECT, GCP_LOCATION } from "./config";
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

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  if (client) return client;
  if (USE_VERTEX) {
    // Vertex AI with Application Default Credentials: no key in the app.
    if (!GCP_PROJECT) throw new ApiFailure("not_configured", undefined, "GOOGLE_CLOUD_PROJECT missing");
    client = new GoogleGenAI({ vertexai: true, project: GCP_PROJECT, location: GCP_LOCATION });
    return client;
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ApiFailure("not_configured", undefined, "GEMINI_API_KEY missing");
  client = new GoogleGenAI({ apiKey });
  return client;
}

/**
 * Keep thinking short: it adds seconds before anything can be spoken, and
 * thinking tokens count against maxOutputTokens. 2.5 models take a token
 * budget; 3.x models take a level (and reject a budget).
 */
function thinkingFor(model: string): ThinkingConfig | undefined {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: ThinkingLevel.LOW };
  return undefined;
}

/** Models that rejected our thinking setting; called without it from then on. */
const noThinkingConfig = new Set<string>();

async function callModel(model: string, parts: Part[], signal: AbortSignal) {
  const thinking = noThinkingConfig.has(model) ? undefined : thinkingFor(model);
  try {
    return await generate(model, parts, signal, thinking);
  } catch (err) {
    if (thinking && err instanceof ApiError && err.status === 400 && /think/i.test(err.message)) {
      console.warn(`[gemini] ${model} rejected thinking config, retrying without it: ${err.message.slice(0, 160)}`);
      noThinkingConfig.add(model);
      return generate(model, parts, signal, undefined);
    }
    throw err;
  }
}

function generate(model: string, parts: Part[], signal: AbortSignal, thinking: ThinkingConfig | undefined) {
  return getClient().models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_SCHEMA,
      temperature: 0.4,
      // Room for the longest reply ("tell me more", about 140 words of JSON)
      // plus any thinking the model still does.
      maxOutputTokens: 4096,
      abortSignal: signal,
      ...(thinking ? { thinkingConfig: thinking } : {}),
    },
  });
}

function mapError(err: unknown): ApiFailure {
  if (err instanceof ApiFailure) return err;
  if (err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message))) {
    return new ApiFailure("timeout", undefined, err.message);
  }
  // Vertex mode without usable Application Default Credentials.
  if (err instanceof Error && /credential|invalid_grant|reauth|unable to impersonate/i.test(err.message)) {
    return new ApiFailure("not_configured", undefined, err.message);
  }
  if (err instanceof ApiError) {
    if (err.status === 429) return new ApiFailure("rate_limited", undefined, err.message);
    if (err.status === 400 && /api key/i.test(err.message)) return new ApiFailure("not_configured", undefined, err.message);
    // 401/403: bad key or no access. 402: AI Studio prepaid credits used up. Retrying won't help.
    if (err.status === 401 || err.status === 402 || err.status === 403) {
      return new ApiFailure("not_configured", undefined, `${err.status} ${err.message}`);
    }
    if (err.status === 400 && /image|inline_?data|mime/i.test(err.message)) {
      return new ApiFailure("unclear_image", undefined, err.message);
    }
    return new ApiFailure("model_error", undefined, `${err.status} ${err.message}`);
  }
  return new ApiFailure("model_error", undefined, String(err));
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
