# DESIGN.md: Wildlife Described

Owner: A (Experience). This is the design system the UI code follows. It merges the Google Stitch design system (`/design/stitch/DESIGN.stitch.md`, screens in `/design/stitch/`) with the app's accessibility rules. Where the two conflict, the accessibility rules here win. See **Stitch reconciliation** below.

## Principles
1. **Works with eyes closed.** Every state change gets a sound, a vibration where the phone supports it, and spoken words. Nothing depends on seeing the screen.
2. **The bottom of the screen is always the main action.** One huge button sits in the same place on every screen: Describe, Cancel, Try again or Describe new. Users find it by thumb, not by sight.
3. **Few controls, always in the same places.** At most three secondary buttons, in one row, directly above the main action.
4. **Say what's uncertain.** If confidence is not `high`, the caveat is spoken first and shown first, in a caution color.
5. **Low vision is a first-class user.** Large type, very high contrast, and the photo that was described stays on screen so a low-vision user or a companion can see what the app looked at.
6. **The camera is on only to take a photo.** No continuous feed: Describe turns it on, waits about 0.6 s for exposure, takes one frame and turns it off. That saves battery, keeps the camera light off, and means only the photo the user chose ever leaves the phone.

## Tokens (`/styles/globals.css`)
| Token | Value | Use | Contrast on black |
|---|---|---|---|
| `--bg` | `#000000` | page | |
| `--surface` / `--surface-2` | `#161616` / `#222222` | cards, secondary buttons (Stitch surface tiers) | |
| `--line` | `#ffffff` | 2px borders on secondary controls (Stitch) | 21:1 |
| `--text` | `#ffffff` | body | 21:1 |
| `--text-muted` | `#d6d6d6` | secondary text | 14.4:1 |
| `--accent` | `#ffd60a` | main button, titles, labels | 14.9:1 (black text on it: 14.9:1) |
| `--caution` | `#ffb4a9` | caveats, errors | 12.4:1 (9.1:1 on `--surface-2`) |
| `--focus` | `#ffd60a` | 4px focus ring with a black gap (Stitch) | 14.9:1 |
| `--info` | `#5ac8fa` | mode toggles and status badges (Stitch tertiary) | 11.2:1 |

Type: **Atkinson Hyperlegible Next** (Google Fonts, designed by the Braille Institute for low-vision readers). Body 22px, titles 36px, main button 36px, secondary buttons 20px bold, nothing interactive under 20px. Letter spacing 0.01em.

Shape: 8px corners on controls and cards, 12px on the stage and main button. No pill shapes (Stitch: square-ish footprints are easier to find by touch). 16px minimum between tap targets.

Targets: secondary buttons at least 76px tall. The main button takes at least 30% of the viewport height (18% on the result screen). The header toggle is 48px. All are well above the 44px WCAG and Apple minimum.

## Screens (one page, five states)
| State | Stage shows | Controls | Sound and voice |
|---|---|---|---|
| **Capture** (`idle`) | The last photo (or nothing) and one hint line. The camera is off. | Ask, Guide me, Use a photo, **Describe** | none |
| **Taking photo** (`capturing`) | Live camera for about a second, "Hold still…" | **Cancel** | "Hold still", then the shutter tone when the frame is taken. The camera turns off straight after. |
| **Looking** | Pulsing ring, "Looking…" | **Cancel** | shutter tone, "Looking now", then "Still looking" after 8s |
| **Listening** (follow-up) | Pulsing mic, "Listening…" | **Cancel** | rising two-note tone, mic opens 300ms later |
| **Result** | Subject title, caveat, description, size, fun fact | Repeat or Stop, Tell me more, Ask, **Describe new** | done chime, result read aloud |
| **Guiding** (`guiding`, from **Guide me**) | Live camera, a large arrow and the current instruction | Cancel, **Take it now** | "Hold the phone up in front of you…", then a soft tick and a short instruction ("Turn a little to the left", "Step back a little") only when it changes or every 4 s. Two "ready" answers in a row: "Got it", shutter tone, camera off, then the normal description. After 25 s, or if guidance fails twice, it takes the photo anyway and says so. |
| **Error** | The error message, large | Ask, Guide me, Use a photo, **Try again** | low falling tone, message read aloud |

## Voice and keyboard
- **Ask** opens the mic once. Saying "more", "repeat", "stop" or "describe" runs that command. Anything else is sent as a follow-up question about the current photo. Asking before any photo takes one first.
- Where speech recognition is missing, a typed-question box appears instead.
- Keys (Bluetooth keyboards and switch devices): **D** describe, **G** guide me, **T** take it now (while guiding), **A** ask, **R** repeat, **M** more, **S** stop, **Esc** cancel or stop. Exposed with `aria-keyshortcuts`. Letter keys work only while focus is on the result or the action buttons (WCAG 2.1.4, character key shortcuts), so a stray key or speech input elsewhere can't trigger them. Esc works anywhere. After each result, focus lands on the result title, so the keys work straight away.
- Saying "describe" when the camera is off can't open the photo picker (browsers require a tap), so the app says so and points to the Describe button.

## Tour ("I am here")
- Say **"I am here"** (also "I'm here", "start tour", "show me around"), press **I am here**, or press **I** on a keyboard.
- Each round: aim at the nearest exhibit not heard yet (same guidance as Help me aim), take one photo, describe it, then "Ask me about it, or say next." Questions, "more" and "repeat" are answered (up to 4), then silence or "next" moves on: "Let's find the next one."
- Nothing new in view for a whole round (25 s): "I don't see anything new here. Walk a few steps or turn around, and I'll look again." A second empty round ends the tour: "Walk somewhere else, then say I am here."
- Ending: say "end tour", "stop" or "pause", press **End tour** (the one wide button while touring) or Esc, or tap the screen between exhibits. A tap while it's speaking only skips the speech; a tap while aiming takes the photo now.
- With App voice off, or no microphone, the tour does one exhibit per press so it never talks over the screen reader.
- The camera is on only while aiming and taking each photo, never while describing or listening.

## Visit memory
- The app remembers the last 8 exhibits it described in this browser tab (cleared when the tab closes) and tells Gemini about them.
- **Help me aim** steers toward something the person hasn't heard about yet. If only a familiar exhibit is in view, it says "That's the … you already heard about. Turn to find something new, or tap the screen to hear it again" (repeated at most every 12 s) and doesn't take the photo on its own. A tap still takes it.
- Pointing at a familiar exhibit on purpose gets "This is the … again." and different details, not a repeat of the first description.

## Screen readers
- **App voice** toggle in the header, on by default. Turning it off sends results to the user's own screen reader (VoiceOver or TalkBack) through a polite live region instead of the app's voice, so the two don't talk over each other. The setting is saved per device.
- Focus moves to the result title or the error message when they appear, so the next swipe starts there.
- The camera preview is `aria-hidden`. Icons are decorative. Every button has a text label.
- Errors use `role="alert"` only when app voice is off, which avoids double speech.

## Motion and modes
- `prefers-reduced-motion` turns off the pulse and the press animation.
- `forced-colors` (Windows high contrast) gives every button a system-colored border.

## Stitch reconciliation
Stitch generated three screens (capture, result, follow-up) and a design system. Kept and changed as follows.

**Adopted:** yellow `#FFD60A` primary on black with black text, Atkinson Hyperlegible Next, 2px white borders on secondary controls, soft 8px corners and no pills, yellow focus ring, 16px target spacing, icon plus text label on every button, at most 3 secondary buttons in a row, primary action pinned to the bottom third, the "Tap anywhere in this area" hint on the main button, the caution style for uncertainty.

**Not adopted, and why:**
- **Bottom tab bar (Capture, Result, Follow-up).** It adds three more targets below the main button, so the main action is no longer at the very bottom. The app moves between states on its own, so tabs aren't needed.
- **"Hold to speak".** Press-and-hold is awkward with VoiceOver and TalkBack (it takes a double-tap-and-hold gesture). The app uses tap to ask, with automatic end of speech.
- **"Artifact detected nearby (3 ft)", gallery numbers, audio scrubber, Save tour, Type code.** These are features we don't have. Showing them would promise more than the demo does.
- **Museum logo, profile avatar and "Speech Active" header.** The logo image was broken and the header text overlapped at phone width. Replaced by the app name and the App voice toggle.
- **Uppercase button labels.** All-caps text is harder to read for low-vision users. Labels are sentence case.

## Accessibility audit checklist (run on any Stitch output before using it)
- [ ] Text contrast 7:1 or better (AAA). Large text 4.5:1 or better.
- [ ] Every tap target 44px or larger, with 8px or more between targets.
- [ ] Focus order runs top to bottom: header, result, secondary buttons, main button.
- [ ] Every control has a visible text label (not icon-only) and an accessible name.
- [ ] Every state is announced aloud (app voice or live region).
- [ ] Usable with VoiceOver on iOS and TalkBack on Android, end to end.
- [ ] Usable at 200% text zoom without horizontal scrolling.
