# DESIGN.md: Wildlife Described

Owner: A (Experience). This is the design system the UI code follows. Google Stitch exports, when they exist, go in `/design`. Reconcile them against this file. Accessibility rules here win over anything a generated screen does.

## Principles
1. **Works with eyes closed.** Every state change gets a sound, a vibration where the phone supports it, and spoken words. Nothing depends on seeing the screen.
2. **The bottom of the screen is always the main action.** One huge button sits in the same place on every screen: Describe, Cancel, Try again or Describe new. Users find it by thumb, not by sight.
3. **Few controls, always in the same places.** At most three secondary buttons, in one row, directly above the main action.
4. **Say what's uncertain.** If confidence is not `high`, the caveat is spoken first and shown first, in a caution color.
5. **Low vision is a first-class user.** Large type, very high contrast, and a camera preview so a sighted companion or low-vision user can aim.

## Tokens (`/styles/globals.css`)
| Token | Value | Use | Contrast on black |
|---|---|---|---|
| `--bg` | `#000000` | page | |
| `--surface` / `--surface-2` | `#141414` / `#242424` | cards, secondary buttons | |
| `--text` | `#ffffff` | body | 21:1 |
| `--text-muted` | `#d6d6d6` | secondary text | 14.4:1 |
| `--accent` | `#ffd60a` | main button, titles, labels | 14.9:1 (black text on it: 14.9:1) |
| `--caution` | `#ffb4a9` | caveats, errors | 12.4:1 (9.1:1 on `--surface-2`) |
| `--focus` | `#5cc8ff` | 4px focus ring | 11.2:1 |

Type: **Atkinson Hyperlegible** (Google Fonts, designed by the Braille Institute for low-vision readers). Body 22px, titles 36px, main button 36px, secondary buttons 20px bold.

Targets: secondary buttons at least 76px tall. The main button takes at least 30% of the viewport height (18% on the result screen). The header toggle is 48px. All are well above the 44px WCAG and Apple minimum.

## Screens (one page, five states)
| State | Stage shows | Controls | Sound and voice |
|---|---|---|---|
| **Capture** (`idle`) | Live camera and one hint line | Ask, Use a photo, **Describe** | none |
| **Looking** | Pulsing ring, "Looking…" | **Cancel** | shutter tone, "Looking now", then "Still looking" after 8s |
| **Listening** (follow-up) | Pulsing mic, "Listening…" | **Cancel** | rising two-note tone, mic opens 300ms later |
| **Result** | Subject title, caveat, description, size, fun fact | Repeat or Stop, Tell me more, Ask, **Describe new** | done chime, result read aloud |
| **Error** | The error message, large | Ask, Use a photo, **Try again** | low falling tone, message read aloud |

## Voice and keyboard
- **Ask** opens the mic once. Saying "more", "repeat", "stop" or "describe" runs that command. Anything else is sent as a follow-up question about the current photo. Asking before any photo takes one first.
- Where speech recognition is missing, a typed-question box appears instead.
- Keys (Bluetooth keyboards and switch devices): **D** describe, **A** ask, **R** repeat, **M** more, **S** stop, **Esc** cancel or stop. Exposed with `aria-keyshortcuts`.

## Screen readers
- **App voice** toggle in the header, on by default. Turning it off sends results to the user's own screen reader (VoiceOver or TalkBack) through a polite live region instead of the app's voice, so the two don't talk over each other. The setting is saved per device.
- Focus moves to the result title or the error message when they appear, so the next swipe starts there.
- The camera preview is `aria-hidden`. Icons are decorative. Every button has a text label.
- Errors use `role="alert"` only when app voice is off, which avoids double speech.

## Motion and modes
- `prefers-reduced-motion` turns off the pulse and the press animation.
- `forced-colors` (Windows high contrast) gives every button a system-colored border.

## Accessibility audit checklist (run on any Stitch output before using it)
- [ ] Text contrast 7:1 or better (AAA). Large text 4.5:1 or better.
- [ ] Every tap target 44px or larger, with 8px or more between targets.
- [ ] Focus order runs top to bottom: header, result, secondary buttons, main button.
- [ ] Every control has a visible text label (not icon-only) and an accessible name.
- [ ] Every state is announced aloud (app voice or live region).
- [ ] Usable with VoiceOver on iOS and TalkBack on Android, end to end.
- [ ] Usable at 200% text zoom without horizontal scrolling.
