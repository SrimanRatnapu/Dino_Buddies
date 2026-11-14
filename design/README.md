# /design: Google Stitch exports

Owner: A (Experience).

## What's here
`/design/stitch/` holds the Stitch output, unchanged:
- `capture_artwork/`, `artwork_audio_description/`, `ask_follow_up_question/`: each has `screen.png` and `code.html`. These are static mockups that load Tailwind and fonts from CDNs; the app does not serve them.
- `DESIGN.stitch.md`: Stitch's design system ("High-Contrast Museum Access").

The app's working design system is `/DESIGN.md`, which merges Stitch's tokens with the accessibility rules. Its **Stitch reconciliation** section lists what was adopted and what was left out.

## Prompts
Seed (from CLAUDE.md):
> Mobile web app for blind and low-vision museum visitors. Huge centered camera button, high-contrast dark theme, large readable text, minimal controls, friendly and calm. Screens: capture, result, follow-up question.

Add these constraints so the output matches the build:
> Pure black background, yellow #FFD60A primary button that fills the bottom third of the screen, white text, font Atkinson Hyperlegible. Every button has a text label under its icon. Max three secondary buttons in one row above the main button.

Per screen:
1. **Capture:** live camera preview in a rounded card, one hint line, "Ask" and "Use a photo" buttons, giant "Describe" button.
2. **Result:** large yellow title (the subject), an optional "Not certain" caution box, description paragraph, "Size" and "Fun fact" cards, then Repeat, Tell me more and Ask, then a "Describe new" button.
3. **Follow-up:** dimmed preview, pulsing yellow microphone ring, "Listening…", hint "Ask a question, or say 'more' or 'repeat'", and a full-width Cancel.

Audit any export with the checklist in `/DESIGN.md` before using it.
