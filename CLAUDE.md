# Project Context: TourBuddy (working title)

Read this first. It is the shared context and the work-split contract for a weekend hackathon build, used by two builders (people or agents) working in parallel. Keep it updated as decisions change.

## The event
- GDGC DevFest hackathon, weekend of Nov 14-15, 2026. Time is very limited, so favor a working demo over completeness.
- Prize tracks:
  1. **Best Integration of Gemini or Google API**
  2. **Best Startup Potential**
  3. **Best Social Impact**
  4. **Best UI**
- Target: tracks 1, 3 and 4. Track 2 gets one pitch slide as a hypothesis only.
- Unknown (ask the user): team size confirmation, demo/judging time, whether one team can win multiple tracks, any "must use" tech rules.

## The pitch (drives the demo)
The presenter (Sriman) opens with a photo of himself posing with the Google dinosaur (ties the project to Google), then tells his lifelong-love-of-dinosaurs story. The project answers: museums, zoos and trails are built to be looked at, so people who are blind or low-vision are shut out. The demo features a **dinosaur skeleton or fossil exhibit** (museum photos or casts) before moving to live animals. Sriman does computer vision research on indoor wayfinding for visually impaired users, which gives the accessibility angle real credibility. Mention it briefly.

## The product
A mobile-friendly web app. The user points the phone camera at an exhibit, animal or scene and hears a spoken description.

Core loop:
1. Capture a frame (big button, or voice command like "describe").
2. Send the image to the backend, which calls Gemini vision.
3. Receive a structured response (see contract).
4. Speak it aloud. Offer a follow-up question by voice ("how big is it?").

Description style: lead with what it is, then size and shape in everyday comparisons ("about as long as a school bus"), posture, texture, surroundings, then one or two interesting facts. Spoken output under about 20 seconds by default, with a "tell me more" option.

## Requirements by track
- **Gemini/Google integration:** Gemini vision is the core model. Add at least one more Google API: Text-to-Speech (browser speech as fallback), Maps/Places for context, and Firebase or Cloud Run for hosting. Use current Gemini model names from the official docs and keep the model name in one config value.
- **Social impact:** designed for blind and low-vision visitors at museums, zoos and parks. Have one concrete user story ready.
- **Best UI:** accessibility-first. Large touch targets, high contrast, screen-reader labels, voice control, audio or haptic confirmation, nothing that depends on seeing the screen. The demo should show the app used without looking at the screen. UI is designed in **Google Stitch** (see below).
- **Startup potential (one slide):** sell to museums, zoos and parks as an accessibility tool. Do not cite market-size numbers unless verified.

## Roles
Fill in the names. Each builder may be a person or a Claude Code agent.

| Role | Builder | Owns |
|---|---|---|
| **A: Experience** | TBD | Stitch design, UI code, camera capture, speaking and voice input, accessibility, pitch visuals |
| **B: Intelligence** | Claude Code agent | Gemini integration, prompts, API routes, TTS endpoint, Google API extras, hosting and deploy |

## File ownership
Only the owner edits these. If you need a change in the other side's area, ask them or leave a note in `CONTRACT CHANGES` below.

- **A owns:** `/app` pages and components, `/components`, `/styles`, `/design` (Stitch exports), `DESIGN.md`, `DEMO.md` (demo script and test images)
- **B owns:** `/app/api/*`, `/lib/gemini`, `/lib/tts`, `/prompts`, `/fixtures`, `.env.example`, deploy config
- **Shared, change only by agreement:** the contract below, `/shared/contract.ts` (types mirroring it), this file

## The contract (interface between A and B)
Version: **v1.3** (v1, plus `POST /api/aim` in v1.1, the optional visit memory `seen` in v1.2, and the Gemini voice on `/api/speak` in v1.3). Any change bumps the version and gets logged under `CONTRACT CHANGES`. Neither side changes shapes silently.

### `POST /api/describe`
Request (JSON):
```json
{
  "image": "base64 JPEG, long edge max 1024px, no data: prefix",
  "mode": "default | detailed",
  "question": "optional string for a follow-up",
  "previous": { "subject": "string", "description": "string" },
  "seen": ["optional (v1.2): subjects already described this visit, oldest first, max 8"]
}
```
Success response (200):
```json
{
  "subject": "string, what it is",
  "confidence": "high | medium | low",
  "description": "string, spoken-ready, plain language",
  "size_comparison": "string",
  "fun_fact": "string",
  "caveats": "string, empty if none"
}
```
Error response (4xx/5xx):
```json
{ "error": { "code": "string", "message": "short, speakable sentence" } }
```
Error messages are read aloud to a blind user, so write them as plain spoken sentences ("I couldn't see that clearly. Try again with more light.").

Rules:
- `confidence` below `high` means the UI must speak `caveats` first (for example "I'm not certain, but this looks like...").
- The server never returns safety advice such as whether it is safe to approach an animal.
- The API key lives only on the server.

### `POST /api/aim` (v1.1, live aiming guidance)
Request: `{ "image": "base64 JPEG, long edge about 512px, no data: prefix", "seen": ["optional (v1.2)"] }`, sent about once a second while the user holds the phone up.
Response (200): `{ "status": "ready | adjust | searching", "move": "left | right | up | down | back | closer | none", "subject": "string", "already_seen": false }`. `already_seen` (v1.2) is true only when `seen` was sent and the attraction being guided to is on it; the client then doesn't auto-capture. `move` is `none` unless `status` is `adjust`. Image left is the user's left. Errors use the same JSON as `/api/describe`. Any error means "stop guiding and just take the photo".

### `POST /api/speak` (optional, B builds if time allows)
Request: `{ "text": "string" }`. Response: audio bytes, `audio/wav` from a Gemini text-to-speech model (default, v1.3) or `audio/mpeg` from Google Cloud Text-to-Speech. Any `audio/*` type is playable.
If this endpoint is missing or fails, A falls back to the browser's `speechSynthesis`. A should build the fallback first so the demo never depends on this endpoint.

### Mock mode
B ships `/api/describe` in **mock mode first**: when `MOCK=1`, it returns a fixture from `/fixtures/describe.json` (a T. rex skeleton, a giraffe, an error case). A builds against this from the start. Real Gemini replaces the mock without changing the shape.

## Google Stitch (UI design, owned by A)
Stitch is Google's AI UI design tool. It generates screens from a text prompt or an image or sketch, and exports code and a `DESIGN.md` design-system file. It also has an MCP server that lets a coding agent read the designs directly. Setup details are in the official docs (https://stitch.withgoogle.com/docs/mcp/setup/); check them rather than guessing commands.

Workflow:
1. **Time-box Stitch to about 45 minutes.** It is a fast first draft, not the finished UI.
2. Generate 3 screens: **Capture** (camera view with one huge describe button), **Result** (description text, replay and "tell me more", high contrast), **Follow-up** (voice question state).
3. Export `DESIGN.md` into the repo root and the screen code into `/design`.
4. A wires the generated markup to the real behavior: camera, calls to `/api/describe`, speech. Stitch produces front-end UI only, so it will not do any of this.
5. **Audit the output for accessibility** before trusting it: color contrast, tap target size, focus order, ARIA labels, and that every state is announced aloud. Generated UI often looks good and still fails these.

Stitch prompt seed: "Mobile web app for blind and low-vision museum visitors. Huge centered camera button, high-contrast dark theme, large readable text, minimal controls, friendly and calm. Screens: capture, result, follow-up question."

## Suggested stack
- Frontend: React/Next.js (or plain web app), installable as a PWA, `getUserMedia` for the camera.
- Backend: thin API routes (Next.js routes or Cloud Run) holding the Gemini key.
- Speech: browser `speechSynthesis` first, Google Cloud TTS as an upgrade. Browser speech recognition for voice commands if time allows.
- Hosting: Firebase Hosting or Cloud Run.

## Sync points
Times are relative to kickoff. Replace with real clock times once demos are scheduled.
1. **T+0:** both read this file and agree on the contract v1. Nothing else starts before this.
2. **~T+1h:** B has mock `/api/describe` running. A has the Stitch screens drafted.
3. **~T+3h:** first end-to-end loop: camera, real Gemini, spoken result. Do not add features before this works.
4. **Feature freeze, 3 hours before demos:** only bug fixes, accessibility fixes and demo prep after this.
5. **1 hour before demos:** rehearse the full demo path twice on a real phone.

## Demo path (lock this first)
1. Photo of a well-known dinosaur skeleton or museum cast. App describes it aloud.
2. A live animal image, such as a zoo photo or a printed image.
3. A voice follow-up question.
4. Show the accessible UI with the screen turned away or eyes closed.

## Scope
**In:** camera capture, Gemini description, spoken output, one voice follow-up, accessible UI built from Stitch, one extra Google API.

**Nice to have:** Maps/Places context, multi-language output, saved history.

**Out for now:** custom model training, 3D modeling, indoor navigation, user accounts.

## Risks and rules
- Gemini can misidentify animals and fossils. Always surface confidence.
- Keep latency low. A resizes images to 1024px before upload. Speak a short "looking now" cue while waiting.
- Do not use real people's images or copyrighted exhibit photos in public materials. Use own photos or freely licensed images.
- Never commit API keys. Use environment variables and keep `.env.example` current.

## Working agreements
- **Main always runs.** Small commits, merge to `main` often. Use branches named `ui/*` (A) and `api/*` (B). If two agents work at once, use separate git worktrees.
- Prefer the simplest thing that demos well. Ask before adding dependencies.
- Put all prompts in `/prompts` so they are easy to tune.
- If you are blocked by the other side, work against the mock and note it, do not wait.
- If a change breaks the contract, stop, log it below, and tell the other builder before merging.

## CONTRACT CHANGES
(Log every change here: date or time, who, what changed, new version.)

- **2026-11-14, B: clarifications and additive mock-only options. No shape change, still v1. A, please confirm or object.**
  - Speaking follows A's `components/spokenText.ts`. On a first look the UI speaks `caveats` (if confidence is not high), `description`, `size_comparison`, then "Fun fact: " + `fun_fact`, so in default mode the server keeps size and fact out of `description` and returns both as full sentences. For `mode: "detailed"` and follow-up answers only `description` is spoken, so there it stands alone.
  - Server guarantees: `caveats` is never empty when confidence is not high, and always `""` when it is high.
  - `image` may be omitted on a follow-up if `question` and `previous` are sent. Sending it is still preferred.
  - Error codes used: `bad_request` 400, `image_too_large` 413, `unclear_image` 422, `rate_limited` 429, `not_configured` 503, `model_error` 502, `timeout` 504. Listed in `shared/contract.ts`.
  - Mock only: `?fixture=trex|giraffe|lowconf|error` query param, auto `followup` fixture when `question` is set, and `MOCK_DELAY_MS` env. Ignored in real mode.
  - Added `GET /api/health` (status, no secrets).
  - `next.config.ts` gains `output: "standalone"` for the Cloud Run image. `package.json` gains `@google/genai` and the `dev:mock`, `models` and `smoke` scripts.

- **2026-11-14, A (Sriman asked A to fix B's review findings): still v1, no shape change.**
  - `shared/contract.ts` now matches the entry above: `image` is optional on a follow-up, and the error codes are listed as `ApiErrorCode`. `lib/http/errors.ts` uses that type.
  - New: `429 rate_limited` replies carry a `Retry-After` header (per-IP limits in `lib/http/rateLimit.ts`). `/api/describe` returns `413 image_too_large` for bodies over 8 MB before reading them. `/api/speak` returns `400` for text over 2000 characters.
  - Safety filter: sentences about touching casts and replicas at handling tables are kept. If filtering empties a description, the server answers "I can see: <subject>." instead of failing.

- **2026-11-14, A (Sriman asked for live aiming guidance): v1.1, additive only.**
  - New `POST /api/aim` (shape above). Uses `AIM_MODEL` (default `gemini-3.1-flash-lite`, falls back to `GEMINI_MODEL` on 404), a 6 s timeout, its own rate limit (`RATE_LIMIT_AIM_PER_MIN`, default 120), and mock replies from `/fixtures/aim.json`. Prompt in `/prompts/aim.ts`.
  - Gemini client, thinking settings and error mapping moved to `lib/gemini/client.ts`, shared by describe and aim. Image validation is `parseImage()` in `lib/gemini/validate.ts`.
  - `/api/describe` and `/api/speak` are unchanged.

- **2026-11-15, B (Sriman, as design lead, asked for a voice-first app): no API or contract change, still v1.1.** A, this touched your files:
  - The tasteskill landing page is reverted (back to the UI after Guide me), then the app is redesigned around talking: one tap starts a conversation that listens, acts, speaks and listens again until the person says "pause" or is silent twice. A tap interrupts speech, pauses listening, or takes the photo while aiming.
  - New voice commands in `components/listen.ts`: help, pause or goodbye, slower and faster, and more ways to say "what's this". With App voice off (a screen reader is talking) it runs one turn per tap and never auto-listens.
  - `components/App.tsx` and `styles/globals.css` rewritten on your tokens (black and yellow, Atkinson Hyperlegible, 76px targets). Every earlier behaviour is kept: camera on only for the photo, Guide me, photo-picker fallback, typed fallback, shortcuts. `DEMO.md` steps 3 to 6 now follow the spoken flow.

- **2026-11-15, A (Sriman asked for Gemini to remember the visit so guidance doesn't lead back to the same exhibit): v1.2, additive only.**
  - The client keeps the subjects of the last 8 first-look descriptions for the browser tab's lifetime (`sessionStorage`) and sends them as optional `seen` on `/api/describe` (first looks only) and `/api/aim`.
  - `/api/aim` prefers an attraction not in `seen` and returns `already_seen: true` when only a familiar one is in view. The client then says "That's the … you already heard about. Turn to find something new, or tap the screen to hear it again" and doesn't auto-capture; a tap still takes it.
  - `/api/describe` names a repeat ("This is the … again.") and leads with different details. Server validation: `parseSeen()` in `lib/gemini/validate.ts`. Requests without `seen` behave exactly as v1.1.

- **2026-11-15, A (Sriman asked for a Gemini AI voice): v1.3, response type only.**
  - `/api/speak` now tries a Gemini TTS model first (`SPEAK_MODEL`, default `gemini-2.5-flash-preview-tts`, 404 fallback `gemini-2.5-flash-tts`; voice `SPEAK_VOICE`, default Kore; style prompt in `/prompts/speak.ts`), using the same key or Vertex AI credentials as describe. It returns `audio/wav` (Gemini's PCM wrapped in a WAV header). On failure it falls back to Cloud TTS (`audio/mpeg`) if a TTS key is set. `SPEAK_ENGINE=cloud` restores the old behaviour.
  - Client: answers are sent in pieces of about 240 characters so the first plays quickly; every fetched clip is cached by text, so Repeat and common short phrases play instantly; short phrases play in the browser voice the first time while the AI version is fetched. "Slower" and "faster" now apply to the AI voice (playback rate). Any failure still falls back to `speechSynthesis`.
  - `/api/health` shows the active `voice`.

- **2026-11-15, A (Sriman asked for a visited-exhibits list the AI references): no shape change, still v1.3.**
  - The client now also sends `seen` (the 8 most recent visited exhibits) on follow-up questions, so answers can compare with earlier exhibits. The server already accepted it; `followUpUserPrompt` now uses it.
  - On a first look, the describe prompt shows the list in order and asks Gemini to open with one short link to an earlier exhibit when there is a real connection, besides naming repeats.
  - UI: an "Exhibits visited" list under the answer (sessionStorage key `visited`, up to 30), and voice commands "what have I seen" and "new visit".

- **2026-11-15, A (Sriman reported the Gemini voice not working): no contract change, still v1.3.**
  - Cause 1 (API key mode): the SDK defaults the Gemini API to `v1`, which rejects `speechConfig` ("Unknown name speechConfig at generation_config"), so every voice request failed and the app quietly used the phone voice. The key client now uses `v1beta`. Vertex AI mode already used `v1beta1`.
  - Cause 2 (likely on Vertex): the voice model names were 2.5-era guesses. The server now tries `SPEAK_MODELS` in order (`gemini-3.8-flash-tts`, `gemini-3.8-flash-lite-tts`, `gemini-3.1-flash-tts-preview`, then the 2.5 names) and remembers the first that works.
  - Client: the first audio piece is about one sentence and gets 10 s, so the voice starts sooner and slow first replies aren't dropped. New `npm run voice-check` diagnoses the voice with the real credentials.
- **2026-11-15, B (Sriman asked to hear more about an exhibit visited earlier): no API or contract change, still v1.3.** A, this touched your files:
  - New `components/visitMemory.ts`: for each exhibit this visit, what was said (description, "more", answers), when the visitor was last there, and a 512px copy of the photo, in `sessionStorage` (photos dropped oldest-first if storage fills).
  - New voice command `recall` in `components/listen.ts`: "go back to the T. rex", "tell me more about the giraffe", "what about the Triceratops", "the last one", "the first one". Names match loosely ("T. rex" finds "Tyrannosaurus rex skeleton"). "Tell me about its teeth" with no matching exhibit stays a normal question.
  - The app first asks "Hey, the … is an exhibit you visited 12 minutes ago. Would you like to know more about it?" and listens for yes or no (Yes and No buttons on screen too, the only way with App voice off). On yes it calls `/api/describe` in `detailed` mode with the saved photo and everything said before as `previous`, so Gemini adds new detail. Follow-up questions then stay on that exhibit, without changing its visit time.
  - The visited list items are now buttons with "N minutes ago". Aiming's "already heard about" line now says how long ago. "New visit" clears the details too.

- **2026-11-15, A (Sriman: voice switched from phone to AI mid-session, and the style instruction was read aloud): additive, still v1.3.**
  - The voice model is now sent only the text (`prompts/speak.ts`): Gemini TTS read the style instruction out loud. Tone comes from `SPEAK_VOICE`.
  - New `GET /api/speak` returns `{ "voice": "gemini:Kore" | "cloud-tts" | null }` (no secrets) so the client can key saved audio by voice.
  - Client: every line uses the AI voice when there is one (short lines wait up to 4 s, answers 10 s, before falling back), fixed phrases are fetched on page load before the first tap, and fetched audio is saved in Cache Storage (`wd-voice-v1`) across visits.

## Backup ideas (only if this stalls)
- Wildlife Rehab Triage: identify an injured animal, give "intervene or leave it" guidance, and look up the nearest rehabber with Maps.
- FossilID: Gemini vision identification of possible fossil finds with a "report it, don't dig it" flow.
