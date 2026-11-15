/**
 * Style for the Gemini voice (/api/speak). Gemini text-to-speech follows a
 * short spoken-style instruction before the text. Keep the instruction short
 * and end it with a colon, so only the text after it is read aloud.
 */
export const SPEAK_STYLE =
  "Read this aloud in a warm, calm and clear voice, like a friendly museum guide talking to one visitor, at an easy pace";

export function speakPrompt(text: string): string {
  return `${SPEAK_STYLE}:\n\n${text}`;
}
