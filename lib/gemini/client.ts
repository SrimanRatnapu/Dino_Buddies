/**
 * Shared Gemini plumbing for /api/describe and /api/aim: the client (API key
 * or Vertex AI with ADC), thinking settings per model family, and mapping
 * SDK errors to the contract's error codes.
 */
import { GoogleGenAI, ApiError, ThinkingLevel, type Part, type ThinkingConfig } from "@google/genai";
import { ApiFailure } from "@/lib/http/errors";
import { USE_VERTEX, GCP_PROJECT, GCP_LOCATION } from "./config";

let client: GoogleGenAI | null = null;
export function getClient(): GoogleGenAI {
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

export interface JsonCallOptions {
  system: string;
  schema: object;
  temperature: number;
  maxOutputTokens: number;
}

/** One structured-JSON generateContent call, with the thinking setting for the model. */
export async function callModel(model: string, parts: Part[], signal: AbortSignal, opts: JsonCallOptions) {
  const thinking = noThinkingConfig.has(model) ? undefined : thinkingFor(model);
  try {
    return await generate(model, parts, signal, opts, thinking);
  } catch (err) {
    if (thinking && err instanceof ApiError && err.status === 400 && /think/i.test(err.message)) {
      console.warn(`[gemini] ${model} rejected thinking config, retrying without it: ${err.message.slice(0, 160)}`);
      noThinkingConfig.add(model);
      return generate(model, parts, signal, opts, undefined);
    }
    throw err;
  }
}

function generate(
  model: string,
  parts: Part[],
  signal: AbortSignal,
  opts: JsonCallOptions,
  thinking: ThinkingConfig | undefined,
) {
  return getClient().models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseJsonSchema: opts.schema,
      temperature: opts.temperature,
      maxOutputTokens: opts.maxOutputTokens,
      abortSignal: signal,
      ...(thinking ? { thinkingConfig: thinking } : {}),
    },
  });
}

/** Maps any error from a Gemini call to a contract error code. */
export function mapError(err: unknown): ApiFailure {
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
