# TourBuddy

Point a phone at an exhibit or animal and hear it described. See `CLAUDE.md` for the plan and the A/B contract.

## Run it

```bash
npm install
cp .env.example .env.local   # MOCK=1 by default, no key needed
npm run dev                  # http://localhost:3000
npm run smoke                # hits /api/health, /api/describe, /api/speak
npm run voice-check          # tries each Gemini voice model with your .env.local and saves a sample WAV
```

For real Gemini: set `GEMINI_API_KEY` in `.env.local` and `MOCK=0`. Run `npm run models` (with the key exported) to see which model names your key can use. The default is `gemini-3.5-flash` (our Vertex AI project got a 404 for `gemini-2.5-flash`). If it 404s, the server retries once with `gemini-3.1-flash-lite`.

Phones only allow camera access over HTTPS. To test on a phone locally, use `npx next dev --experimental-https` or test on the Cloud Run URL.

## Notes for A (Experience)

- **Mock mode:** `MOCK=1`. Choose a fixture with a query string: `/api/describe?fixture=trex|giraffe|lowconf|error`. Any request with `question` returns the follow-up fixture. `MOCK_DELAY_MS=2500` simulates Gemini latency so you can test the "looking now" cue. The request is validated even in mock mode, so shape bugs show up early.
- **What the server writes for your `spokenText.ts`:** in default mode `description` leaves out the size and the fact, and `size_comparison` and `fun_fact` are full sentences, so your caveats → description → size → "Fun fact:" sequence reads cleanly with no repeats. In `detailed` mode and for answers, `description` stands alone.
- **"Tell me more":** resend the same image with `mode: "detailed"` plus `previous`, which you already do. The server uses `previous` to add new detail instead of repeating.
- **Follow-up:** send `question` plus `previous: {subject, description}`. Include the image if you have it, because it gives better answers. A text-only follow-up also works.
- **Errors:** every non-200 has `error.message` written to be read aloud as-is. 422 `unclear_image` means retake the photo.
- **`/api/speak`:** returns audio in a Gemini AI voice (`audio/wav`, using the same key or Vertex AI setup as describe), or Cloud TTS (`audio/mpeg`) as a fallback, or a JSON error. Treat any non-200 as "use `speechSynthesis`". Change the voice with `SPEAK_VOICE`.
- **Image:** a data-URL prefix is stripped if you send one, and PNG/WebP are accepted, but JPEG at 1024px long edge keeps latency down.
- `GET /api/health` shows mock/real, model, and whether keys are set. It never shows the keys themselves.

## Layout (B-owned)

| Path | What |
|---|---|
| `app/api/describe/route.ts` | Contract v1 endpoint, mock + real |
| `app/api/aim/route.ts` | Live aiming guidance for "Guide me" (contract v1.1) |
| `app/api/speak/route.ts` | Gemini voice (WAV), Cloud TTS fallback (MP3) |
| `app/api/health/route.ts` | Status for A and deploys |
| `lib/gemini/config.ts` | **The one place the model name lives** |
| `lib/gemini/describe.ts` | Gemini call, structured JSON output, timeout, retries |
| `lib/gemini/validate.ts` | Request validation; response cleanup, caveats rule, safety-advice filter |
| `lib/tts/google.ts` | TTS REST client |
| `prompts/describe.ts` | All prompt text, tune here |
| `fixtures/describe.json` | Mock responses |
| `shared/contract.ts` | Shared types mirroring the contract |
