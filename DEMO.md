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
- **On a phone:** the camera needs https. Either deploy (Firebase Hosting or Cloud Run), or run `npm run dev:https` and open `https://<laptop-ip>:3000` on the phone, accepting the self-signed certificate warning. If the camera can't start, Describe opens the phone's own camera or photo picker, so the demo still works.

## Demo path (about 3 minutes)
1. **Hook (slide):** Sriman with the Google dinosaur. Lifelong love of dinosaurs. "Museums are built to be looked at."
2. **The problem:** blind and low-vision visitors are shut out of exhibits. Sriman's research on indoor wayfinding for visually impaired users (one line).
3. **One tap, then just talk:** tap anywhere on the screen. It says "I'm listening" and plays a tone. Point at the T. rex image and say **"What's this?"** Let the shutter tone, "Looking now", the chime and the description play out. Don't touch the phone again.
4. **Follow-up by voice:** after the description it plays the listening tone by itself. Say **"How big were its teeth?"** The answer is spoken, and it listens again.
5. **Live animal:** say **"What's this?"** again on the zoo animal image. If confidence is lower, point out that it says it isn't certain first: honesty for users who can't double-check.
6. **Eyes closed, with aiming help:** close your eyes, hold the phone up roughly toward the exhibit and say **"Help me aim."** Let it say "Turn a little to the left… Step back a little… Got it", then describe. Then say **"Pause"** to end. "Everything you just heard also works with VoiceOver and TalkBack: turn App voice off and tap for each question."
   - Rehearse on the real exhibit image. Start slightly off to one side so the audience hears at least one instruction. Each aiming step takes about a second, so move slowly.
   - If the room is loud and it mishears, tap the screen to interrupt and say it again. It can't hear you while it is speaking (it would hear itself), so a tap is how you cut in.
7. **Close:** Google pieces (Gemini vision, Cloud Text-to-Speech, Google Fonts' Atkinson Hyperlegible, Firebase or Cloud Run), and the museum, zoo and park pilot pitch.

## User story (social impact)
Maya is 14 and has been blind since birth. On a school trip to the natural history museum, her classmates crowd around the T. rex. She taps her screen once, points her phone, says "what's this?", and hears: "a Tyrannosaurus rex skeleton… about as long as a school bus." She asks, "How big were its teeth?" For the first time she is asking questions about the exhibit instead of waiting for someone to describe it.

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
