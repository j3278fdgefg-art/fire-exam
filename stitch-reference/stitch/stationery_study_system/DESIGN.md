---
name: Stationery Study System
colors:
  surface: '#fbf9f9'
  surface-dim: '#dcd9da'
  surface-bright: '#fbf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f3'
  surface-container: '#f0eded'
  surface-container-high: '#eae7e8'
  surface-container-highest: '#e4e2e2'
  on-surface: '#1b1b1c'
  on-surface-variant: '#44474b'
  inverse-surface: '#303031'
  inverse-on-surface: '#f3f0f0'
  outline: '#74777b'
  outline-variant: '#c4c7cb'
  surface-tint: '#556069'
  primary: '#0b161d'
  on-primary: '#ffffff'
  primary-container: '#202a32'
  on-primary-container: '#87919b'
  inverse-primary: '#bdc8d2'
  secondary: '#546068'
  on-secondary: '#ffffff'
  secondary-container: '#d5e1eb'
  on-secondary-container: '#58646c'
  tertiary: '#1e1207'
  on-tertiary: '#ffffff'
  tertiary-container: '#342619'
  on-tertiary-container: '#a18c7a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d9e4ef'
  primary-fixed-dim: '#bdc8d2'
  on-primary-fixed: '#131d24'
  on-primary-fixed-variant: '#3e4851'
  secondary-fixed: '#d8e4ed'
  secondary-fixed-dim: '#bcc8d1'
  on-secondary-fixed: '#111d24'
  on-secondary-fixed-variant: '#3d4850'
  tertiary-fixed: '#f7deca'
  tertiary-fixed-dim: '#dac2af'
  on-tertiary-fixed: '#26190d'
  on-tertiary-fixed-variant: '#544435'
  background: '#fbf9f9'
  on-background: '#1b1b1c'
  surface-variant: '#e4e2e2'
typography:
  display-lg:
    fontFamily: Noto Serif TC
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Noto Serif TC
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
  headline-md:
    fontFamily: Noto Serif TC
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Noto Sans TC
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
  body-lg:
    fontFamily: Noto Sans TC
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Noto Sans TC
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Noto Sans TC
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.05em
  caption-sm:
    fontFamily: Noto Sans TC
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
  container-max-width: 1200px
---

## Brand & Style

The design system is built on the philosophy of a "Stationery Study Environment." It seeks to evoke the tactile, focused, and organized feeling of a physical study desk. The target audience consists of professionals and students preparing for technical certifications who require a calm, distraction-free interface that encourages deep concentration.

The visual style is **Tactile / Skeuomorphic Modern**. It utilizes physical metaphors—such as binder rings, index tabs, and paper grain—to create a sense of familiarity and permanence. The aesthetic is grounded in Japanese stationery design: functional, minimalist in its complexity, and warm in its material expression.

**Key Brand Attributes:**
- **Quietude:** Soft colors and natural textures reduce eye strain during long study sessions.
- **Organization:** Grid-based layouts and clear physical divisions (tabs, binders) mimic real-world filing systems.
- **Diligence:** Hand-drawn accents and stamp-like icons provide positive reinforcement for progress.

## Colors

The color palette is inspired by natural paper and traditional inks.

- **Canvas (#F4F1E9):** Used for the base background layer, simulating a desk mat or heavy cardstock.
- **Surface (#FFFEFA):** The primary workspace color, mimicking high-quality writing paper.
- **Primary Ink (#202A32):** A deep charcoal for high-contrast text and structural lines.
- **Secondary Ink (#647078):** A muted slate for metadata, secondary text, and inactive states.
- **Vermilion Accent (#BE4F3B):** Used sparingly for "grading" effects, highlights, and primary call-to-actions, mimicking a teacher's red pen.
- **Quiet Sage (#728674):** Used for success states, completed tasks, and steady progress indicators.

## Typography

Typography follows a hierarchy that distinguishes between "content" and "interface."

- **Serif (Noto Serif TC):** Reserved for chapter titles, article headers, and significant milestone markers. It adds an authoritative, literary feel to the study material.
- **Sans Serif (Noto Sans TC):** Used for all UI elements, navigation, and body text. It ensures maximum legibility and a modern, clean reading experience.

For mobile devices, `display-lg` and `headline-lg` should scale down to 32px and 24px respectively to maintain balance within the narrower viewport of the "binder" frame.

## Layout & Spacing

The layout is modeled after a **physical binder**.

1. **The Desktop Layer:** The outer `background_canvas` provides generous margins, mimicking the desk surface.
2. **The Binder Layer:** A centered or slightly offset container with a fixed or fluid width that features "binder ring" graphics on the left or center spine.
3. **The Paper Layer:** Content resides on "pages" (white surfaces) with internal padding of 24px-32px.

**Grid System:**
A 12-column grid is used within the Paper Layer. Gutters are kept tight (16px) to mimic the structured columns of a notebook. Layouts should prefer vertical stacking for study content, with sidebars used for "tabs" or "index markings."

## Elevation & Depth

Hierarchy is achieved through **Physical Layering** rather than abstract light sources.

- **Level 0 (Desk):** The `background_canvas`. Non-interactive.
- **Level 1 (Binder):** Subtle, large-radius shadow (#000 at 5% opacity) to separate the binder from the desk.
- **Level 2 (Paper):** Multiple stacked paper edges are represented by 1px offsets and light borders, creating the illusion of volume.
- **Level 3 (Interactive Elements):** Cards and buttons use a very crisp, short shadow (2px offset) to look "resting" on the paper.
- **Level 4 (Floating/Tactile):** Elements like paperclips, sticky notes, and index tabs use slightly more aggressive shadows to appear as if they are physically attached to the top of the page.

## Shapes

The shape language is primarily **rectilinear with soft corners**, mimicking machine-cut paper and cardstock.

- **Primary Radius:** 4px (Soft) for cards, input fields, and paper edges.
- **Index Tabs:** Top corners rounded at 8px, bottom corners sharp to merge into the page edge.
- **Binder Rings:** Perfect circles, rendered with a metallic gradient.
- **Action Buttons:** Use a slightly higher radius (8px) to differentiate from static content blocks.

## Components

### Buttons & Navigation
- **Primary Button:** Solid fill of Primary Ink or Vermilion. Text is white.
- **Secondary Button:** Outlined (1px) with Secondary Ink. Background is transparent or subtle paper-white.
- **Navigation Tabs:** Styled as physical "index tabs" protruding from the side or top of the paper container. Active tabs should "merge" into the paper surface.

### Cards & Study Blocks
- Cards represent specific clauses or questions. Use a thin 1px border (#E0DDD5) and a slight inner "grain" texture.
- Headers within cards use a dashed bottom border, mimicking a perforated line.

### Form Inputs
- **Text Fields:** Underlined style (simulating a ruled notebook) or a soft-bordered box with a #F9F7F2 background.
- **Checkboxes:** Styled as hand-drawn squares. When checked, use a Vermilion "X" or a Quiet Sage "check" that looks like a stamp.

### Tactile Accents
- **Paperclips:** Used to "pin" important notes or summary sections to the side of the main container.
- **Highlighters:** Background tints (subtle yellow or sage) used behind text to indicate importance, with slightly irregular edges to look hand-applied.
- **Progress Bars:** Designed to look like a "thermometer" or a filled fountain pen reservoir.
