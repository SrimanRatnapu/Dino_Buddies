/**
 * What the Gemini voice is sent. Only the words to speak: Gemini text-to-speech
 * models can read a style instruction ("Read this aloud in a warm voice...")
 * out loud as part of the text, so the tone comes from the chosen voice
 * (SPEAK_VOICE) instead of a prompt.
 */
export function speakPrompt(text: string): string {
  return text;
}
