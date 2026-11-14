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
