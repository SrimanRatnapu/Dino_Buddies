---
name: High-Contrast Museum Access
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#d0c6ab'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#999077'
  outline-variant: '#4d4632'
  surface-tint: '#e9c400'
  primary: '#fff5dc'
  on-primary: '#3b2f00'
  primary-container: '#ffd60a'
  on-primary-container: '#705d00'
  inverse-primary: '#705d00'
  secondary: '#c6c6c7'
  on-secondary: '#2f3131'
  secondary-container: '#454747'
  on-secondary-container: '#b4b5b5'
  tertiary: '#edf7ff'
  on-tertiary: '#003548'
  tertiary-container: '#abe1ff'
  on-tertiary-container: '#006688'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffe171'
  primary-fixed-dim: '#e9c400'
  on-primary-fixed: '#221b00'
  on-primary-fixed-variant: '#554600'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#c1e8ff'
  tertiary-fixed-dim: '#74d1ff'
  on-tertiary-fixed: '#001e2b'
  on-tertiary-fixed-variant: '#004d67'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
typography:
  headline-xl:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: 0.02em
  headline-xl-mobile:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: 0.02em
  headline-lg:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 42px
    letterSpacing: 0.015em
  headline-lg-mobile:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: 0.015em
  headline-md:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: 0.01em
  headline-sm:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 34px
    letterSpacing: 0.01em
  body-lg:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 24px
    fontWeight: '400'
    lineHeight: 36px
    letterSpacing: 0.01em
  body-md:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 22px
    fontWeight: '400'
    lineHeight: 34px
    letterSpacing: 0.01em
  body-sm:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 20px
    fontWeight: '400'
    lineHeight: 30px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Atkinson Hyperlegible Next
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: 0.02em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  margin: 1.5rem
  space-xs: 0.5rem
  space-sm: 1rem
  space-md: 1.5rem
  space-lg: 2rem
  space-xl: 3rem
---

## Brand & Style

This design system delivers an uncompromising, dignified, and tactile-inspired digital companion for blind and low-vision museum visitors. Built to meet and exceed WCAG AAA accessibility thresholds, the visual language balances clinical precision with an inviting, cultural warmth. 

The aesthetic is anchored in **High-Contrast Functionalism**: pure light-absorbing black grounds paired with razor-sharp structural boundaries and radiant signal accents. The interface avoids ephemeral trends, subtle skeuomorphic gradients, or low-contrast decorative noise. Instead, it relies on structural clarity, deterministic screen-reader pathways, predictable tap footprints, and unequivocal state indicators. The resulting atmosphere empowers visitors to explore artifacts, hear descriptive audio tracks, and navigate gallery physical halls without cognitive friction, visual fatigue, or ambiguity.

## Colors

The palette is engineered around high luminance differentials to maximize legibility across varying degrees of macular degeneration, cataracts, glaucoma, and field loss.

- **Primary Accent (`#FFD60A`)**: A vivid signal yellow. When paired with `#000000` text, it achieves a contrast ratio surpassing 14:1 (exceeding WCAG AAA). Used exclusively for primary call-to-actions, active audio scrubbers, and primary route guidance.
- **Secondary Accent (`#FFFFFF`)**: Pure optic white. Provides maximum contrast on deep backgrounds for structural borders, prominent navigational dividers, and primary titles.
- **Tertiary Accent (`#5AC8FA`)**: High-luminance daylight cyan. Reserved for contextual help, accessibility mode toggles, and live docent voice assistance indicators.
- **Neutral Canvas (`#000000`)**: Deep optical black. Eliminates ambient light bleed from mobile displays and optimizes battery efficiency for prolonged gallery tours.
- **Surface Tiers (`#161616`, `#222222`)**: Neutral charcoal containers that differentiate content areas without degrading luminance contrast.
- **Text Hierarchies**: `#FFFFFF` for default body and headers; `#D1D5DB` (Light Silver, 10.5:1 ratio against black) exclusively for supportive metadata such as timestamp lengths and accession numbers. Never drop text contrast below 7:1 under any circumstance.

## Typography

This system uses **Atkinson Hyperlegible Next** across all typographic levels. Originally developed by the Braille Institute, this typeface introduces distinct letterforms (such as exaggerated serifs on uppercase 'I', slashed or open zeros, and distinctive stems on 'b' and 'd') to eliminate character confusion among low-vision readers.

- Minimum type size across all interactive elements is strictly locked to `20px` to prevent zoom requirement during casual walk-throughs.
- Line height is sustained between `1.4` and `1.6` across body passages to provide tracking clarity when reading with digital magnifiers.
- Letter spacing is subtly expanded (`0.01em` to `0.02em`) across all styles to counteract the letter clumping common under macular distortion.
- All body text supports native OS text re-scaling without clipping or breaking layout flows.

## Layout & Spacing

Layout adheres to a single-column or dual-column structural flow. Multi-column grids with dense information clusters are prohibited to prevent peripheral visual loss.

- **Margins & Gutters**: Outer margins on mobile devices are set to `1.5rem` (`24px`), moving to `2rem` (`32px`) on tablet fixtures. Gutters never drop below `1.5rem` to guarantee generous isolation between interactive elements.
- **Rhythm & Touch Anchors**: Spacing tokens are calibrated to anchor large targets. All primary tap targets require a minimum outer spatial separation of `1rem` (`16px`) to eliminate accidental touches.
- **Adaptive Reflow**: 
  - *Mobile (< 768px)*: Strict 1-column stack. Sticky primary controls always pin to the bottom third of the viewport within direct thumb reach.
  - *Tablet & Kiosk (>= 768px)*: Maximum 2-column division (left: object visual/tactile map; right: audio playback controls, description, transcript).

## Elevation & Depth

Visual depth is communicated exclusively through **crisp structural boundaries and tonal contrasts**, never through blurred drop shadows or soft gradients, which appear as perceptual smudges to low-vision eyes.

- **Ghost Borders**: Every card, modal, and interactive surface is bound by a solid `2px` or `3px` stroke (`#FFFFFF` or `#FFD60A`). This creates unambiguous object edges.
- **Surface Layering**: 
  - *Base*: `#000000` (Pure Canvas).
  - *Layer 1 (Cards, panels)*: `#161616` encased in `2px` solid `#FFFFFF`.
  - *Layer 2 (Active selections, expanded drawers)*: `#222222` encased in `3px` solid `#FFD60A`.
- **Focus & Selection**: When an element is focused or selected, apply an outer offset ring: `4px` solid `#FFD60A` with a `2px` pure black gap between the ring and the element boundary.

## Shapes

The design system employs **Soft (Level 1)** corner geometry. Standard interactive elements carry a subtle `0.25rem` (`4px`) radius, transitioning to `0.5rem` (`8px`) for large cards and modal panels. 

This modest rounding prevents the visual edge-blurring associated with sharp 90-degree points while avoiding pill shapes (`roundedness: 3`) which compromise the structural rectangular footprint necessary for predictable spatial touch identification.

## Components

### Buttons
- **Touch Target**: Absolute minimum dimension of `64px` height and `64px` width.
- **Primary Buttons**: Filled with `#FFD60A` containing `#000000` bold text. Sized prominently at `100%` width in mobile views or large fixed action blocks.
- **Secondary Buttons**: Filled with `#161616`, bordered with `2px` solid `#FFFFFF`, text in `#FFFFFF`.
- **Icon + Label Rules**: Every button with an icon must place an explicit descriptive label underneath or directly adjacent to the glyph. Never use standalone icon buttons. Limit horizontal secondary actions to a maximum of 3 in a row.

### Audio Guide Cards
- Dark surface (`#161616`) bound by a continuous `2px` white border.
- Integrated play/pause trigger with minimum `64px` hit area, always styled in `#FFD60A` with high-contrast icon rendering.
- Scrub bar has a physical track height of `12px` (background `#222222`, active progress `#FFD60A`) with a `32px` scrubber thumb.

### Input Fields & Search
- Inputs feature a dark background (`#161616`) framed by a `2px` solid `#FFFFFF` border, jumping to `4px` solid `#FFD60A` on active focus.
- Placeholder text is forbidden; static label text sits directly above the field in `22px` Atkinson Hyperlegible. Clear "Clear Input" action button positioned inside or alongside the input container.

### Lists & Gallery Directory
- List items have a minimum height of `72px` separated by a high-contrast `2px` solid `#333333` rule.
- Each row includes high-contrast chevron indicators (`#FFD60A` or `#FFFFFF`) paired with semantic room/artifact numbers.

### Checkboxes & Radio Controls
- Minimum box/circle dimension of `36px × 36px` centered inside a minimum `64px` active touch cell.
- Checked state uses thick (`4px`) internal white or yellow checkmarks with high contrast against the `#161616` container.

### Wayfinding & Beacon Banners
- Contextual alerts that trigger near exhibit beacons utilize solid `#FFD60A` surface banners with `#000000` bold text to command immediate peripheral notice.