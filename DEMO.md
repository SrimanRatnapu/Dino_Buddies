# DEMO.md: demo script and test images

Owner: A (Experience).

## Run it
```bash
npm install
```
```bash
npm run dev
```
- **Real Gemini:** put your key in `.env.local` (copy `.env.example`, set `MOCK=0` and `GEMINI_API_KEY`), then `npm run dev`.
- **Server mock:** `npm run dev:mock` serves B's fixtures from `/fixtures/describe.json` through the real route, so validation and error replies are exercised.
- **In-browser mock:** add `?mock=1` to the URL. It needs no server call at all, so it's the offline backup on stage. It uses the same fixtures and cycles through T. rex skeleton (high confidence), Triceratops skull (medium, with caveat), giraffe, and an error. A "Demo data" badge shows it's on. Follow-up questions return the T. rex size answer.
- **On a phone:** the camera needs https. Three ways, most reliable first:
  1. **Deploy** (Cloud Run, see `DEPLOY.md`): a permanent https link that works on any network. Best for judging.
  2. **Tunnel:** `npm run build && npm start`, then `cloudflared tunnel --url http://localhost:3000` in a second terminal, and open the `trycloudflare.com` link on the phone. University and venue Wi-Fi (eduroam) often block the tunnel service ("failed to request quick Tunnel … Client.Timeout"): put the laptop on the phone's hotspot and run it again.
  3. **Straight from the laptop:** laptop and phone on the same network (a phone hotspot works; eduroam usually blocks device-to-device traffic). Run `npm run dev:https`, open `https://<laptop-ip>:3000` on the phone and accept the certificate warning. Find the IP with `ipconfig getifaddr en0` on a Mac.

## Laptop demo (fastest, most reliable)
1. In the repo: `git pull`, then `npm install` if packages changed.
2. Check `.env.local`: `MOCK=0`, and either `GEMINI_API_KEY=...` or the Vertex AI lines (`GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT=...`, `GOOGLE_CLOUD_LOCATION=global`).
3. Start it: `npm run build && npm start` (or `npm run dev`). Open **http://localhost:3000** in **Chrome**.
4. Open http://localhost:3000/api/health once: `mock` should be `false` and `gemini_ready` `true`.
5. Allow the camera and microphone when Chrome asks. Turn the laptop volume up.
6. Hold the printed exhibit image (or a second screen) in front of the laptop camera, then click the big button once. It guides, takes the photo, describes it, and listens for a question.
- **If Gemini or the network fails on stage:** open http://localhost:3000/?mock=1. It needs no server calls and walks through canned exhibits.
- **To see what's happening:** add `?debug=1` for a panel showing the camera frame sent for aiming and what happened to each spoken line.
- **If the voice sounds robotic:** that's the fallback voice; the demo still works. `npm run voice-check` shows why the AI voice isn't answering.
- Use headphones or keep the volume moderate: the laptop microphone can hear the laptop's own speakers.

## Demo path (about 3 minutes)
1. **Hook (slide):** Sriman with the Google dinosaur. Lifelong love of dinosaurs. "Museums are built to be looked at."
2. **The problem:** blind and low-vision visitors are shut out of exhibits. Sriman's research on indoor wayfinding for visually impaired users (one line).
3. **One tap, then hands off (the core of the demo):** close your eyes, hold the phone up at chest height and tap anywhere on the screen once. It introduces itself and starts the tour by itself: "Turn a little to the left… Got it… Looking now", then describes the T. rex. Don't touch the phone again.
4. **Ask by voice:** after the description it says "Ask me about it, or say next." Say **"How big were its teeth?"** The answer is spoken, and it listens again.
5. **On to the next exhibit, by itself:** stay quiet. It says "Let's find the next one" and guides you to the animal image, skipping the T. rex it already described. Before explaining, it links back ("Like the T. rex you saw earlier…" when there's a real connection). If confidence is lower, point out that it says it isn't certain first.
6. **Wrap up by voice:** say **"What have I seen?"** to hear the list, then **"End tour."** "Everything you just heard also works with VoiceOver and TalkBack: turn App voice off and tap for each exhibit."
   - Set up two printed exhibit images a couple of metres apart (the T. rex and the animal) so the audience sees it move from one to the next.
   - Rehearse on the real images. Start slightly off to one side so the audience hears at least one instruction. Each aiming step takes about a second, so move slowly.
   - If the room is loud and it mishears, tap the screen to cut in. It can't hear you while it is speaking (it would hear itself). A tap between exhibits pauses the tour; the next tap carries on.
   - Rehearse once with a cleared list (say "new visit") so the demo starts from the T. rex.
7. **Close:** Google pieces (Gemini vision, Cloud Text-to-Speech, Google Fonts' Atkinson Hyperlegible, Firebase or Cloud Run), and the museum, zoo and park pilot pitch.

## User story (social impact)
Maya is 14 and has been blind since birth. On a school trip to the natural history museum, her classmates crowd around the T. rex. She taps her screen once and holds her phone up. It guides her toward the skeleton and she hears: "a Tyrannosaurus rex skeleton… about as long as a school bus." She asks, "How big were its teeth?" For the first time she is asking questions about the exhibit instead of waiting for someone to describe it.

## Test images
Use only our own photos or freely licensed images (CLAUDE.md rule). Record the source and license for each one here.

| Use | Image | Source and license |
|---|---|---|
| Dinosaur skeleton | TBD (own photo of a cast, or Wikimedia Commons CC BY or CC0) | |
| Live animal | TBD (own zoo photo, or Wikimedia Commons CC BY or CC0) | |
| Low-light or blurry (error case) | TBD (take one ourselves) | |

Print them on paper or show them on a second screen. Printed works better: there's no glare and the phone focuses easily.

## Rehearsal checklist (1 hour before)
- [ ] Phone volume up, silent switch off (iOS mutes web audio when silent mode is on).
- [ ] Do Not Disturb on. Screen auto-lock set to 5 min or more.
- [ ] Camera and microphone permissions already granted on the demo URL.
- [ ] Run the demo path twice on the real phone, on the venue Wi-Fi.
- [ ] Backup: the `?mock=1` URL open in a second tab in case Gemini or the network fails on stage.
