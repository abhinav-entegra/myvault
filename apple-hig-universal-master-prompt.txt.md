# UNIVERSAL APPLE HIG DESIGN SYSTEM — MASTER PROMPT
## For Any Application Type · Version 1.0
## Paste this at the top of ANY future UI/UX build prompt.

---

> **AI INSTRUCTION — READ BEFORE ANYTHING ELSE**
>
> This document is a DESIGN CONSTITUTION. Every rule below is a hard constraint.
> - Do NOT substitute, reinterpret, or "improve upon" any visual rule.
> - Do NOT add components, patterns, or libraries not listed here.
> - Do NOT apply your own aesthetic choices — this document makes all aesthetic decisions.
> - When a rule says "exact", implement it exactly.
> - When something is not described in this document, ask before inventing it.
> - "Apple-style" does NOT mean "copy Apple's website." It means follow Apple Human Interface Guidelines precisely as documented here.
> - This prompt is complete. Silence = exclusion. If it's not here, it doesn't exist in the UI.

---

## SECTION 1 — IDENTITY & PHILOSOPHY

### 1.1 Design Language

This system implements **Apple Human Interface Guidelines (HIG)** for all platforms.

The aesthetic is:
- **Calm, not sterile.** Content-forward, never chrome-forward.
- **Spatial, not flat.** Depth through layering and blur, not shadows-as-decoration.
- **Restrained, not empty.** Every element earns its place. Nothing decorative.
- **Consistent, not rigid.** Same rules everywhere. No screen has a different visual grammar.

### 1.2 Forbidden Aesthetics (AI must not use these regardless of context)

- Material Design patterns (FABs, ripple effects, colored toolbars, elevation-as-color)
- Gradients on UI surfaces, cards, buttons, or navigation (exception: data visualizations only)
- Neon / glowing colors
- Heavy drop shadows (only soft, multi-layer shadows at low opacity as defined below)
- Rounded corners larger than 20px on any card or container
- Sharp corners (0px radius) on buttons, inputs, cards, or modals
- All-caps text as a design choice (only allowed for section headers per spec)
- Custom decorative fonts — system font only (SF Pro / -apple-system)
- Colored navigation bars, sidebars, or tab bars
- Animated backgrounds, particle effects, mesh gradients as backgrounds
- Any icon library that doesn't match SF Symbols visual style

---

## SECTION 2 — TECH STACK

### 2.1 Mandatory

```
Framework:     React (functional components + hooks)
Styling:       Tailwind CSS utility classes + CSS custom properties for tokens
Icons:         Heroicons v2 OR inline SVG paths matching SF Symbols style
Fonts:         System font stack only (see Section 3.2)
Animations:    CSS transitions/keyframes only (no GSAP, Framer Motion, etc.)
State:         useState / useReducer / useContext — no external state libraries
               unless the project specifically requires it
```

### 2.2 Forbidden Libraries

```
NEVER USE:
- Material UI / MUI
- Chakra UI
- Ant Design
- Bootstrap
- Tailwind UI (components) — use Tailwind CSS utilities only
- Framer Motion (unless project explicitly requires it)
- Any component library with its own visual language
```

### 2.3 Allowed Libraries

```
OK TO USE:
- Tailwind CSS (utilities only)
- Heroicons v2 (icon paths)
- date-fns (date formatting)
- clsx / classnames (conditional classes)
- Headless UI (behavior only — no visual styles from it)
```

---

## SECTION 3 — DESIGN TOKENS

### 3.1 Color System

Define ALL colors as CSS custom properties. Never hardcode hex values in components.

```css
:root {
  /* ─── Backgrounds ─────────────────────────────── */
  --color-bg-primary:       #FFFFFF;   /* Main content surface */
  --color-bg-secondary:     #F2F2F7;   /* App background, grouped list bg */
  --color-bg-tertiary:      #E5E5EA;   /* Input fills, segmented track */
  --color-bg-quaternary:    #D1D1D6;   /* Pressed states, deep fills */

  /* ─── Text ────────────────────────────────────── */
  --color-text-primary:     #1C1C1E;   /* Main text */
  --color-text-secondary:   #636366;   /* Supporting text */
  --color-text-tertiary:    #AEAEB2;   /* Placeholders, hints */
  --color-text-quaternary:  #C7C7CC;   /* Disabled text */

  /* ─── Accent (use sparingly) ──────────────────── */
  --color-accent:           #007AFF;   /* Interactive elements, links */
  --color-accent-hover:     #0063CC;   /* Hover state of accent */

  /* ─── Semantic System Colors ──────────────────── */
  --color-green:            #34C759;
  --color-orange:           #FF9500;
  --color-red:              #FF3B30;
  --color-yellow:           #FFCC00;
  --color-teal:             #5AC8FA;
  --color-indigo:           #5856D6;
  --color-pink:             #FF2D55;
  --color-purple:           #AF52DE;

  /* ─── Separators ──────────────────────────────── */
  --color-separator:        rgba(60, 60, 67, 0.12);
  --color-separator-opaque: #C6C6C8;

  /* ─── Frosted Glass ───────────────────────────── */
  --color-glass-bg:         rgba(255, 255, 255, 0.72);
  --color-glass-border:     rgba(255, 255, 255, 0.40);

  /* ─── Shadows ─────────────────────────────────── */
  --shadow-xs:    0 1px 2px rgba(0,0,0,0.06);
  --shadow-sm:    0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md:    0 4px 16px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.06);
  --shadow-lg:    0 8px 32px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.06);
  --shadow-float: 0 16px 48px rgba(0,0,0,0.16), 0 4px 12px rgba(0,0,0,0.08);
  --shadow-focus: 0 0 0 4px rgba(0, 122, 255, 0.30);
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg-primary:       #1C1C1E;
    --color-bg-secondary:     #2C2C2E;
    --color-bg-tertiary:      #3A3A3C;
    --color-bg-quaternary:    #48484A;

    --color-text-primary:     #FFFFFF;
    --color-text-secondary:   #AEAEB2;
    --color-text-tertiary:    #636366;
    --color-text-quaternary:  #48484A;

    --color-accent:           #0A84FF;
    --color-accent-hover:     #409CFF;

    --color-green:            #30D158;
    --color-orange:           #FF9F0A;
    --color-red:              #FF453A;
    --color-yellow:           #FFD60A;
    --color-teal:             #64D2FF;
    --color-indigo:           #5E5CE6;
    --color-pink:             #FF375F;
    --color-purple:           #BF5AF2;

    --color-separator:        rgba(255, 255, 255, 0.10);
    --color-separator-opaque: #38383A;

    --color-glass-bg:         rgba(28, 28, 30, 0.72);
    --color-glass-border:     rgba(255, 255, 255, 0.12);

    --shadow-xs:    0 1px 2px rgba(0,0,0,0.20);
    --shadow-sm:    0 1px 3px rgba(0,0,0,0.24), 0 1px 2px rgba(0,0,0,0.16);
    --shadow-md:    0 4px 16px rgba(0,0,0,0.30), 0 2px 4px rgba(0,0,0,0.18);
    --shadow-lg:    0 8px 32px rgba(0,0,0,0.36), 0 4px 8px rgba(0,0,0,0.20);
    --shadow-float: 0 16px 48px rgba(0,0,0,0.48), 0 4px 12px rgba(0,0,0,0.24);
    --shadow-focus: 0 0 0 4px rgba(10, 132, 255, 0.40);
  }
}
```

**Color usage rules:**
- `--color-accent` is for interactive elements ONLY: buttons (primary), links, active tab icons, active toggle, focused inputs, active navigation item, selected segment. Not for decoration.
- Semantic colors (`--color-green`, `--color-red`, etc.) are for status indicators, badges, and data only.
- `--color-bg-secondary` is the page/screen background. `--color-bg-primary` is for card surfaces on top of it.
- Never use a custom color not in this system without defining it as a CSS variable and justifying it.

### 3.2 Typography

```css
--font-system: -apple-system, BlinkMacSystemFont, "SF Pro Display",
               "SF Pro Text", "Helvetica Neue", Arial, sans-serif;
--font-mono:   "SF Mono", "Menlo", "Monaco", "Courier New", monospace;
```

**Type scale — use ONLY these roles. Do not invent new sizes:**

| Role | Size | Weight | Line-height | Letter-spacing | When to use |
|---|---|---|---|---|---|
| Large Title | 34px | 700 | 1.18 | -0.4px | Primary screen title |
| Title 1 | 28px | 700 | 1.21 | -0.3px | Section heading |
| Title 2 | 22px | 700 | 1.27 | -0.2px | Panel/card heading |
| Title 3 | 20px | 600 | 1.30 | -0.15px | Subsection heading |
| Headline | 17px | 600 | 1.35 | -0.1px | List section header, card title |
| Body | 17px | 400 | 1.47 | -0.1px | Primary content |
| Callout | 16px | 400 | 1.50 | -0.08px | Secondary content |
| Subhead | 15px | 400 | 1.40 | -0.06px | Supporting text |
| Footnote | 13px | 400 | 1.38 | 0px | Timestamps, metadata |
| Caption 1 | 12px | 400 | 1.33 | 0.2px | Labels, fine print |
| Caption 2 | 11px | 400 | 1.27 | 0.3px | Minimal labels only |

**Typography rules:**
- Never go below 11px for any visible text.
- Heading hierarchy must be sequential — do not skip levels on a single screen.
- Bold (700) is for titles only. Semibold (600) for interactive labels and headlines. Regular (400) for body.
- Never use 300 (light) weight — it reads as broken in small sizes.
- Never use ALL CAPS except for list section headers (Footnote size, 600 weight, letter-spacing 0.08em).

### 3.3 Spacing — 8pt Grid

All padding, margin, and gap values must be multiples of 8px.

```
4px  — Internal component micro-spacing (icon gaps, badge padding)
8px  — Tight spacing (between icon and label, between stacked metadata)
16px — Standard spacing (card padding, list item padding)
24px — Comfortable spacing (section gaps, modal padding)
32px — Generous spacing (screen padding on desktop)
40px — Section separation
48px — Large section breaks
64px — Hero/header spacing
```

Exception: 4px is permitted only for internal component spacing (pill padding, icon-to-text gap within a button).

### 3.4 Corner Radius

```
4px  — Small internal elements (progress bars, micro-badges)
8px  — Chips, small tags, list inset group inner radius
10px — Input fields, segmented control active indicator
12px — Buttons (standard)
16px — Cards, panels, bottom sheet inner cards
20px — Modal sheets (top corners), large cards
24px — Full-screen sheet bottom rounded (when used as overlay)
50%  — Avatars, circular icon buttons
```

**Hard rules:**
- 0px radius is FORBIDDEN on buttons, inputs, cards, modals.
- Radius above 20px is FORBIDDEN except on avatars (50%) and explicitly modal top corners.
- When in doubt: 12px for interactive, 16px for container.

### 3.5 Shadows — Use Only These

```
--shadow-xs    → Subtle elevation: toggle thumb, small chips
--shadow-sm    → Cards, inputs on hover
--shadow-md    → Floating toolbars, date pickers
--shadow-lg    → Popovers, dropdown menus
--shadow-float → Modals, bottom sheets, floating panels
--shadow-focus → Focus ring on all interactive elements
```

**Shadow rules:**
- Use ONLY one shadow level per element. Never stack shadows.
- No colored shadows (no `box-shadow: 0 4px 12px rgba(0,122,255,0.3)` — that's a glow, not a shadow).
- Shadows encode elevation, not brand. They must be neutral black at low opacity.

### 3.6 Frosted Glass — Usage Allowlist

Use this ONLY on these element types:

```css
.glass {
  background: var(--color-glass-bg);
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  border: 1px solid var(--color-glass-border);
}
```

**Allowed on:**
- Floating modals and bottom sheets
- Navigation bar (when scrolled)
- Tab bar (mobile)
- Floating action toolbars
- Context menus and popovers

**Forbidden on:**
- Regular cards
- Sidebar / main navigation (static)
- Input fields
- Any element that doesn't float over other content

---

## SECTION 4 — COMPONENT LIBRARY

Every component below must be implemented exactly as specified. Do not add variants not listed.

### 4.1 Buttons

**Variants (exhaustive — implement all, add none):**

```
Primary      → --color-accent fill, white text, 50px height, 12px radius
Secondary    → --color-bg-tertiary fill, --color-text-primary, same size
Ghost        → transparent fill, --color-accent text, same size
Destructive  → --color-red fill, white text, same size
Icon Button  → 44×44px, --color-bg-secondary fill, centered icon
Text Link    → no container, --color-accent text, underline on hover
```

**All button rules:**
- Minimum height: 44px (touch target rule)
- Standard height: 50px for primary actions
- Font: Callout (16px) size, weight 600
- Press animation: `transform: scale(0.96)`, 120ms ease — ALL buttons
- Disabled state: 40% opacity, no interaction
- Loading state: replace label with spinner (see Section 4.10)
- No border on Primary/Destructive; 1px `--color-separator` on Secondary
- Corner radius: exactly 12px

### 4.2 Input Fields

```css
.input {
  height: 48px;
  background: var(--color-bg-secondary);
  border: 2px solid transparent;
  border-radius: 10px;
  padding: 0 16px;
  font-family: var(--font-system);
  font-size: 17px;   /* Body */
  color: var(--color-text-primary);
  transition: border-color 150ms ease;
  outline: none;
}
.input:focus {
  border-color: var(--color-accent);
  background: var(--color-bg-primary);
}
.input::placeholder { color: var(--color-text-tertiary); }
.input.error { border-color: var(--color-red); }
```

**Input rules:**
- Never use a visible border in default (unfocused) state
- Never use a drop shadow on inputs
- Error state: red border + red helper text below (Footnote size)
- Success state: green border only (no icon)
- Label: Subhead size, `--color-text-secondary`, 8px above input

### 4.3 Toggle Switch (iOS-style — Replaces ALL checkboxes)

No checkboxes anywhere. Every boolean value uses this toggle.

```css
.toggle-track {
  width: 51px; height: 31px;
  border-radius: 16px;
  position: relative;
  cursor: pointer;
  transition: background 200ms ease;
  background: var(--color-bg-tertiary);
}
.toggle-track.is-on { background: var(--color-green); }
.toggle-thumb {
  width: 27px; height: 27px;
  border-radius: 50%;
  background: #FFFFFF;
  position: absolute;
  top: 2px; left: 2px;
  transition: transform 200ms ease;
  box-shadow: 0 2px 4px rgba(0,0,0,0.20);
}
.toggle-track.is-on .toggle-thumb { transform: translateX(20px); }
```

**Toggle rules:**
- "On" color is always `--color-green` unless the setting controls a danger action (use `--color-red`)
- Label is always to the RIGHT of the toggle, same row, Body size
- Never stack the label above or below — always inline
- Touch target extends to full row (44px minimum height)

### 4.4 Segmented Control

```css
.seg-control-track {
  display: inline-flex;
  background: var(--color-bg-tertiary);
  padding: 4px;
  border-radius: 10px;
  gap: 2px;
}
.seg-control-segment {
  padding: 6px 16px;
  border-radius: 8px;
  font-size: 15px;    /* Subhead */
  font-weight: 500;
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: color 180ms ease;
  white-space: nowrap;
  user-select: none;
}
.seg-control-segment.active {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-sm);
}
```

**Segmented control rules:**
- Maximum 5 segments — use a picker/menu above 5 options
- Active background transition: the white pill slides (use absolute-positioned div with translateX) — do NOT just toggle background color without movement
- Never use color (other than white/gray) for the active segment
- Minimum segment width: enough to fit the label without wrapping

### 4.5 Cards

```css
.card {
  background: var(--color-bg-primary);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
}
.card-interactive:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
  transition: all 200ms ease;
}
.card-interactive:active {
  transform: translateY(0) scale(0.99);
}
```

**Card rules:**
- No colored card backgrounds — always `--color-bg-primary`
- No gradient backgrounds on cards — ever
- No border by default; optional 1px `--color-separator` when on same bg as page
- Use `--shadow-sm` at rest; `--shadow-md` on hover for interactive cards
- Inner content respects 16px padding from all card edges

### 4.6 Lists (iOS Grouped Style)

This is the primary content pattern for settings, logs, and structured data.

```
Structure:
  Section Header  → Subhead, 600 weight, UPPERCASE, --color-text-secondary,
                    --color-bg-secondary background, padding 8px 16px
  List Group      → --color-bg-primary, 16px corner radius, overflow hidden
  List Row        → min 44px height (48-56px preferred), 16px horizontal padding
  Row Separator   → 0.5px --color-separator, INSET (starts after leading content, not full-width)
  Last row        → no separator
```

**Row anatomy (left to right):**
1. Leading icon or avatar (optional, 28-40px)
2. 16px gap
3. Content stack (label on top, value/description below)
4. Spacer (flex: 1)
5. Trailing value (--color-text-secondary, Subhead)
6. 8px gap
7. Chevron icon (for navigation rows only, --color-text-tertiary)

**List rules:**
- Destructive actions (delete, remove): red label, no icon
- Navigation rows always have a chevron
- Toggle rows never have a chevron
- Info-only rows have neither
- Never use alternating row colors (zebra striping)

### 4.7 Navigation Bar

**Mobile:**
```
Height:         56px (+ status bar safe area, ~44px = 100px total)
Background:     --color-bg-primary (opaque) OR frosted glass when scrolled
Title:          Headline size, weight 600, centered
Left item:      Back button ("‹ Label") OR action icon, --color-accent
Right item:     Text action OR icon, --color-accent
Border bottom:  none at top of scroll; 0.5px --color-separator-opaque when scrolled
Large title:    Large Title size, 700 weight, appears when scrolled to top
```

**Desktop Sidebar:**
```
Width:          260px fixed
Background:     --color-bg-secondary
Right border:   1px solid --color-separator
Nav item height: 44px
Nav item radius: 8px
Active item bg: --color-bg-tertiary
Active item text/icon: --color-accent
Inactive text:  --color-text-secondary
Section header: Caption 1 size, UPPERCASE, 600 weight, --color-text-tertiary
Padding:        16px horizontal, 8px between items
```

### 4.8 Tab Bar (Mobile Bottom Navigation)

```
Height:         49px (+ safe area inset, ~34px = 83px total)
Background:     Frosted glass always
Border top:     0.5px --color-separator
Item layout:    Icon centered, label below
Icon size:      24×24px at rest, 25px active
Label size:     Caption 2 (10px), weight 500
Active:         --color-accent icon (filled) + --color-accent label
Inactive:       --color-text-tertiary icon (outlined) + --color-text-tertiary label
Max tabs:       5 (use "More" if exceeding)
```

**Tab bar rules:**
- No badge unless notification count is a product requirement
- Never color-code tabs differently (all use same accent for active)
- Active icon must be the "filled" variant of the icon
- Tab transition: icon scale 0.95 → 1.0 (100ms ease) on tap

### 4.9 Modal / Bottom Sheet

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.30);
  /* NOT backdrop-filter blur — blur the modal itself, not the overlay */
}
.modal-sheet {
  background: var(--color-glass-bg);
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  border: 1px solid var(--color-glass-border);
  border-radius: 20px 20px 0 0;  /* Mobile: rounded top only */
  box-shadow: var(--shadow-float);
}
/* Desktop: centered modal */
.modal-centered {
  border-radius: 20px;  /* All corners */
  max-width: 540px;
  width: calc(100% - 48px);
}
```

**Entry animation:**
```css
/* Slide up */
@keyframes sheet-enter {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
animation: sheet-enter 380ms cubic-bezier(0.34, 1.56, 0.64, 1);
/* cubic-bezier(0.34, 1.56, 0.64, 1) = Apple spring — use this EXACTLY */
```

**Dismiss animation:** reverse, 300ms ease-in-out.

**Drag handle:** 4px tall, 36px wide, `--color-text-tertiary`, 50% radius, centered, 8px from top.

**Modal rules:**
- Every modal has a drag handle on mobile
- Tap outside always dismisses (unless form has unsaved changes — then confirm dialog)
- Never nest modals. One modal at a time.
- Max height: 90vh on mobile, 80vh on desktop

### 4.10 Search Bar

```css
.search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-bg-tertiary);
  border-radius: 10px;
  padding: 0 12px;
  height: 36px;
}
.search-icon { color: var(--color-text-tertiary); width: 16px; height: 16px; }
.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 17px;
  color: var(--color-text-primary);
}
.search-input::placeholder { color: var(--color-text-tertiary); }
```

**Search bar rules:**
- Always has a magnifying glass icon on the left
- "Cancel" text button on right when focused (--color-accent)
- Never a bordered search bar — background fill only
- Full-screen search overlay fades in (200ms) over current screen

### 4.11 Avatar / Initials

```
Sizes:   24px (micro), 32px (list), 40px (detail), 48px (profile), 72px (hero)
Shape:   50% border radius (always circular)
Fallback: Initials (first + last initial), 15% opacity accent background,
          accent color text, Footnote/Caption size
Photo:   object-fit: cover, same circular crop
```

```css
.avatar-fallback {
  background: rgba(0, 122, 255, 0.15);
  color: var(--color-accent);
  font-weight: 600;
}
/* For variety, cycle through semantic colors for different users */
/* Always use 15% opacity background + full-opacity text of same color */
```

### 4.12 Status Badges / Pills

```css
.badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;     /* Caption 1 */
  font-weight: 600;
}
/* Color classes using semantic system colors */
.badge-success { background: rgba(52,199,89,0.15);  color: var(--color-green); }
.badge-warning { background: rgba(255,149,0,0.15);  color: var(--color-orange); }
.badge-danger  { background: rgba(255,59,48,0.15);  color: var(--color-red); }
.badge-info    { background: rgba(0,122,255,0.15);  color: var(--color-accent); }
.badge-neutral { background: var(--color-bg-tertiary); color: var(--color-text-secondary); }
```

### 4.13 Spinner / Loading

```css
@keyframes spin { to { transform: rotate(360deg); } }
.spinner {
  width: 20px; height: 20px;
  border: 2px solid var(--color-bg-tertiary);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
```

Use this exact style. No other loading patterns (skeleton screens are acceptable — see below).

**Skeleton screens:**
```css
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-bg-tertiary) 25%,
    var(--color-bg-quaternary) 50%,
    var(--color-bg-tertiary) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
  border-radius: 6px;
}
```

---

## SECTION 5 — INTERACTION PATTERNS

### 5.1 Animation Timing — Use Only These Values

```
Ultra-fast:  100ms ease         → Button press, toggle tap
Fast:        150ms ease-in-out  → Icon change, color change, fade
Standard:    200ms ease-in-out  → Tab switch, fade transitions, filter changes
Comfortable: 280ms ease-in-out  → Accordion open, dropdown, filter panel
Deliberate:  350ms ease-in-out  → Screen transitions, navigation pushes
Spring:      380ms cubic-bezier(0.34, 1.56, 0.64, 1) → Modal entry, panel slide-up
Dismiss:     300ms ease-in-out  → Modal close, panel dismiss
Pan/Scroll:  400ms ease-in-out  → Camera pan, scroll-to-element
```

### 5.2 Interaction States — All Elements

Every interactive element must have ALL of these states defined:

```
Default   → base styles
Hover     → desktop only; subtle background change or shadow increase
Focus     → --shadow-focus (4px accent ring), accessible
Active    → scale(0.96) transform, 100ms ease
Disabled  → 40% opacity, cursor: not-allowed, no interaction
Loading   → spinner replaces label (maintain button width with min-width)
```

### 5.3 Hover Effects (Desktop Only)

```css
/* List rows */
.list-row:hover { background: var(--color-bg-secondary); }

/* Cards */
.card-interactive:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

/* Buttons */
.btn-primary:hover { background: var(--color-accent-hover); }

/* Nav items */
.nav-item:hover { background: var(--color-bg-tertiary); }
```

No glow effects. No color shifts on hover. Only background lightening or shadow increase.

### 5.4 Transitions — Never Use These

- `all` transition property (always specify exact property: `transition: box-shadow 200ms ease`)
- Transitions on `width` or `height` (use `max-height` or `transform: scaleY`)
- `transition: none` on interactive elements (always animate state changes)

### 5.5 Accessibility — Motion

Always wrap non-essential animations in:

```css
@media (prefers-reduced-motion: no-preference) {
  .animated-element {
    animation: my-animation 300ms ease;
    transition: transform 200ms ease;
  }
}
```

State change animations (button press, toggle) are always instant when `prefers-reduced-motion: reduce`.

---

## SECTION 6 — LAYOUT PRINCIPLES

### 6.1 Responsive Breakpoints

```
Mobile:   < 768px    → Bottom tab bar, full-screen views, single column
Tablet:   768–1024px → Can use sidebar, 2-column layouts allowed
Desktop:  ≥ 1024px   → Sidebar (260px) + content + optional detail panel
Wide:     ≥ 1280px   → 3-column layout (sidebar + list + detail)
```

### 6.2 Safe Areas

Always use CSS env() for devices with notches/home indicators:

```css
padding-top: env(safe-area-inset-top);
padding-bottom: env(safe-area-inset-bottom);
padding-left: env(safe-area-inset-left);
padding-right: env(safe-area-inset-right);
```

### 6.3 Content Width

```
Mobile body:   100% - 32px (16px each side)
Tablet body:   100% - 48px
Desktop body:  max-width: 1200px, centered, 32px padding
Text content:  max-width: 680px (readable line length)
```

### 6.4 Breathing Space Rules

- Minimum 16px between any two content elements
- Minimum 24px between sections
- Minimum 32px from screen edge to content on desktop
- Cards must have at least 16px internal padding on all sides
- Lists must have at least 16px horizontal padding in each row

---

## SECTION 7 — NAVIGATION PATTERNS

### 7.1 How to Decide Navigation Structure

```
≤ 4 primary sections + mobile  → Bottom Tab Bar
> 4 sections OR desktop first  → Left Sidebar
Single-flow (onboarding, setup) → Full-screen steps with Back button
Deep hierarchy                  → Navigation stack with back button
Temporary content               → Modal bottom sheet
```

### 7.2 Navigation Rules

- Never show more than one navigation chrome simultaneously (no sidebar + tab bar on mobile)
- Always show the current location (active tab, highlighted nav item, breadcrumb)
- Back button always shows the TITLE of the screen it goes back to, not just "Back"
- Destructive navigation (clear, reset) always requires confirmation modal
- Deep links (3+ levels) always show abbreviated breadcrumb or back-to-root option

---

## SECTION 8 — EMPTY STATES & ERRORS

### 8.1 Empty State Pattern

```
Structure:
  Icon      → 56×56px, --color-text-tertiary, centered
  Title     → Title 3 size, --color-text-primary, centered, 8px below icon
  Body      → Body size, --color-text-secondary, centered, max 2 lines
  CTA       → Primary button (if actionable), 24px below body
```

### 8.2 Error State Pattern

```
Toast:  Bottom of screen, 320px max-width, 16px radius, --shadow-float
        --color-red background at 10%, --color-red border, red icon
        Auto-dismiss: 4 seconds
        Manual dismiss: ✕ button

Inline: Below input field, --color-red text, Footnote size, 4px below input
        Always accompanied by red input border

Full-screen error: Empty state pattern + destructive CTA ("Try Again")
```

---

## SECTION 9 — ACCESSIBILITY REQUIREMENTS

These are non-negotiable. Every build must satisfy all of these.

```
Touch targets:   Minimum 44×44px for ALL tappable elements
Focus rings:     --shadow-focus on all interactive elements, keyboard navigable
Color contrast:  WCAG AA minimum — 4.5:1 for body text, 3:1 for large text
Color alone:     NEVER the only indicator of state — always pair with icon or text
Screen readers:  aria-label on all icon-only buttons; aria-live for dynamic content
Heading order:   Sequential h1→h2→h3, no skipping
Images:          alt text always; aria-hidden for decorative
Motion:          prefers-reduced-motion respected (see Section 5.5)
Font size:       Never below 11px rendered size
```

---

## SECTION 10 — THINGS NEVER TO DO

This section exists to prevent AI hallucination. Read it before writing any code.

```
VISUAL NEVER DO:
✗ Gradients on UI surfaces (backgrounds, cards, buttons, nav bars)
✗ Colored nav bars or sidebars
✗ Sharp corners (0px radius) on cards, buttons, inputs
✗ Corners > 20px except avatars
✗ Colored shadows / glows
✗ Multiple shadows stacked on one element
✗ Frosted glass on static (non-floating) elements
✗ Zebra striping in lists
✗ Borders as separators (use background-color shift)
✗ Heavy 1px+ visible borders on cards in normal state
✗ Custom decorative or display fonts
✗ ALL CAPS except list section headers
✗ Text below 11px
✗ Weight 300 (light) or 900 (black)
✗ Colors not in the token system
✗ Inline styles for visual properties (colors, spacing — use tokens)

INTERACTION NEVER DO:
✗ Checkboxes (always use toggle switches)
✗ Hover effects on mobile (use :hover only inside desktop breakpoint)
✗ Animations with no easing (linear except for spinners)
✗ transition: all
✗ Animations above 500ms except page-level transitions
✗ Multiple simultaneous modals
✗ Click-outside not dismissing modals
✗ No loading state on async actions

STRUCTURAL NEVER DO:
✗ Hardcoded hex colors in components
✗ Hardcoded pixel values for spacing not on the 8pt grid
✗ Non-semantic HTML (div soup instead of nav, header, main, section, article)
✗ Missing aria-labels on icon buttons
✗ Placeholder text as the only label for inputs
✗ Required fields with no validation feedback
✗ Scroll-hijacking
✗ Auto-playing media
```

---

## SECTION 11 — HOW TO USE THIS MASTER PROMPT

When starting any new UI build, do this:

**Step 1 — Paste this entire document** at the top of your build prompt.

**Step 2 — Append your project-specific prompt** below it with this structure:

```
## PROJECT: [Your App Name]

### What it does:
[1-2 sentences max]

### Target platform:
[Mobile / Desktop / Both]

### Screens to build:
1. [Screen name] — [one sentence description]
2. [Screen name] — [one sentence description]
...

### Data model:
[Define your interfaces here]

### Features to include:
[Exhaustive list — if not listed, AI will not build it]

### Features NOT to include:
[Explicit exclusion list — prevents AI hallucination]

### Navigation structure:
[Tab bar with: X, Y, Z] OR [Sidebar with: X, Y, Z]

### File structure:
[Your preferred folder structure]
```

**Step 3 — Do NOT modify any rule in this master prompt** for your project. If a project-level requirement conflicts with a master prompt rule, the master prompt wins and you adapt the project requirement. The only exception: if a screen genuinely requires something not covered (e.g., a map view, a chart, a calendar), add it as a new section in the project prompt with exact specs — do not override master prompt rules to accommodate it.

---

## SECTION 12 — QUICK REFERENCE CARD

Cut this out and paste it anywhere you need a fast reminder.

```
FONT:         -apple-system stack only
SIZES:        34/28/22/20/17/17/16/15/13/12/11px — no others
WEIGHTS:      400/500/600/700 — no others
SPACING:      8pt grid: 8/16/24/32/40/48px
RADIUS:       4/8/10/12/16/20px + 50% avatars — no others
ACCENT:       #007AFF light / #0A84FF dark — interactive only
BG:           #FFFFFF / #F2F2F7 / #E5E5EA / #D1D1D6
TEXT:         #1C1C1E / #636366 / #AEAEB2 / #C7C7CC
SHADOWS:      xs/sm/md/lg/float/focus — exact values only
GLASS:        rgba(255,255,255,0.72) + blur(20px) — floating only
ANIMATION:    100/150/200/280/350ms ease + 380ms spring — these only
PRESS:        scale(0.96) 120ms — every interactive element
BOOLEANS:     Toggle switches always. No checkboxes. Ever.
CARDS:        White bg, 16px radius, --shadow-sm
LISTS:        iOS grouped. 0.5px inset separator. No zebra.
MODALS:       20px top radius. Drag handle. Spring entry.
EMPTY STATE:  Icon + Title + Body + Optional CTA. Centered.
ERRORS:       Toast (auto-dismiss 4s) or inline red text.
```

---

*This document is the design law for all projects using it. It does not expire, does not need updating per project, and does not bend to project preferences. The entire value of this system is its absoluteness.*
