/**
 * The single place the Gemini model name lives (CLAUDE.md requirement).
 * Override per environment with GEMINI_MODEL. Run `npm run models` with a key
 * to list the models your key can actually use, because names get retired.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/** Used once if GEMINI_MODEL returns 404 (retired or wrong name). */
export const GEMINI_FALLBACK_MODEL =
  process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-latest";

/** Server-side hard timeout for one Gemini call. */
export const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 15000);

export const isMock = () => process.env.MOCK === "1";

/**
 * Two ways to reach Gemini:
 * - API key (default): GEMINI_API_KEY, through the Gemini API (AI Studio billing).
 * - Vertex AI with Application Default Credentials: set
 *   GOOGLE_GENAI_USE_VERTEXAI=true and GOOGLE_CLOUD_PROJECT. No key at all:
 *   locally it uses `gcloud auth application-default login`, and on Cloud Run
 *   the service's own identity. Billed to the project's Cloud Billing account.
 */
export const USE_VERTEX = /^(1|true)$/i.test(process.env.GOOGLE_GENAI_USE_VERTEXAI ?? "");
export const GCP_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "";
/** "global" serves current Gemini models on Vertex AI with the best availability. */
export const GCP_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "global";

/** True when the server has what it needs to call Gemini (credentials are checked on first call). */
export const geminiConfigured = () => (USE_VERTEX ? Boolean(GCP_PROJECT) : Boolean(process.env.GEMINI_API_KEY));
