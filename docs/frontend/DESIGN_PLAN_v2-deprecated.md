# ARIA — Design Plan v2 (Operator-Calm pivot)

> Supersedes `DESIGN_PLAN_v1_deprecated.md`. The v1 direction
> ("Editorial Industrial Telemetry") was read as **too tech-fiction** —
> bracketed labels, mono-caps +0.08em everywhere, `UNIT / D-02`
> registration marks, grain overlay, electric cyan — all of it skewed
> Bloomberg Terminal / SCADA / Hollywood-hacker.
>
> v2 pivots to **operator-calm**: the visual register of Linear, Vercel,
> and Stripe Dashboard. Dark-first with a real light mode. Sober,
> startup-pro, trustworthy. The app is an AI-driven operator console —
> but the UI doesn't try to prove it. The data does.
>
> Scope: this is an **app**, not a landing page. The `modern-design`
> tropes (100vh hero, `clamp(Nrem, 15vw, …)`, Lenis smooth scroll,
> word-by-word reveal) are **not applicable** here. The typography,
> motion, spacing, accessibility rules from that skill still stand.

---

## 1. Direction artistique

**Name:** *Operator-Calm.*

**Brief:** a console where plant operators, investigators and AI agents
co-work on water-treatment telemetry. The UI must feel **calm**
(nothing moves unless something changed), **trustworthy** (the kind of
surface you'd accept a 3 AM alert from), and **fast**
(zero chrome between operator and data). No cinematic lyricism, no
industrial cosplay, no AI sparkle.

**North-star references**
- **Linear** — quiet keyboard-driven density; restraint as a feature
- **Vercel Dashboard** — generous negative space, crisp typography, one accent
- **Stripe Dashboard** — tabular clarity; numbers are the design
- **GitHub** (dark/light parity) — proof a content-heavy tool can own both themes
- **Height / Attio** — section headers that state, don't decorate

**Deliberately dropped as reference (v1 carryover):**
Bloomberg Terminal, SIMATIC HMI, Honeywell Experion, F-35 MFD,
Teenage Engineering OP-1. Their vocabulary was too costume.

**Vibe test (half-second judge look)**
- "this looks like a real SaaS console" — pass
- "I'd trust this to page me at 3 AM" — pass
- "feels like a tool I already know how to use" — pass

**Vibe anti-test**
- "Bloomberg Terminal / SCADA cosplay" → failure
- "generic shadcn dashboard" → failure
- "another AI product landing" → failure
- "why is it glowing / scanning / grainy?" → failure

---

## 2. Palette (final hex, locked — dark AND light)

**Two themes, both first-class.** Dark is the default (operator context,
night shifts, demos). Light is shipped and maintained, not retro-fitted.
Every token below has both values.

### 2.1 Neutral ramp — warm, not cool

v1 used cool slate-blue neutrals (`#0a0e14 → #52627a`). v2 switches to
a **warm neutral** ramp — same family as Linear/Vercel. Warmer grays read
less "military", more "product".

| Token | Dark | Light | Use |
|---|---|---|---|
| `--ds-bg-base` | `#0b0b0f` | `#fafaf9` | App background |
| `--ds-bg-surface` | `#111114` | `#ffffff` | Panels, drawers, chat |
| `--ds-bg-elevated` | `#17171c` | `#f5f5f4` | Cards inside panels, inputs |
| `--ds-bg-hover` | `#1c1c22` | `#efeeec` | Hover state on rows/buttons |
| `--ds-border` | `#24242b` | `#e7e5e2` | 1px hairlines, default dividers |
| `--ds-border-strong` | `#33333c` | `#d4d2cf` | Section dividers, input borders |
| `--ds-fg-primary` | `#ededef` | `#1a1a1a` | Headlines, data, primary text |
| `--ds-fg-muted` | `#9a9aa3` | `#5e5e5a` | Captions, labels, metadata |
| `--ds-fg-subtle` | `#64646d` | `#8a8984` | Placeholders, footnotes, dividers annotations |

Design discipline: both ramps are **monochrome + warm-tinted**. No blue
cast, no green cast. The accent (§2.2) does the coloring.

### 2.2 Accent — one and only

v1 used `#3ab5c9` (steel cyan). Too "industrial control room". v2 picks
a **calm product blue** instead:

| Token | Dark | Light | Use |
|---|---|---|---|
| `--ds-accent` | `#3478f6` | `#2563eb` | Brand accent, primary CTA, selected state |
| `--ds-accent-hover` | `#5990f8` | `#1d4fd8` | Hover/active on accent surfaces |
| `--ds-accent-soft` | `rgb(52 120 246 / 0.12)` | `rgb(37 99 235 / 0.08)` | Subtle accent background (selected rows, badges) |
| `--ds-accent-ring` | `rgb(52 120 246 / 0.35)` | `rgb(37 99 235 / 0.35)` | 2px focus ring |
| `--ds-accent-fg` | `#ffffff` | `#ffffff` | Text on accent fill |

Blue, not cyan. `#3478f6` is the closest match to the Linear/Vercel
family without being an exact copy. Readable, calm, defensible.

### 2.3 Status colors — desaturated, functional only

Same role as v1 (status only, never decoration), but tones shifted to
read "product" rather than "aviation hazard".

| Token | Dark | Light | Meaning |
|---|---|---|---|
| `--ds-status-nominal` | `#3ecf8e` | `#10a877` | Healthy / green / pass |
| `--ds-status-warning` | `#e5a13a` | `#b8791b` | Degraded / amber / attention |
| `--ds-status-critical` | `#e5484d` | `#c8312f` | Failed / red / page-me |
| `--ds-status-info` | inherits `--ds-accent` | inherits `--ds-accent` | Neutral info / runs |

Softer greens/ambers than v1. Red stays assertive — critical must cut
through.

### 2.4 Agent identities — slightly warmer, still whispered

Agent colors appear **only** where an agent is named (badge, activity
row, inspector header). Never as decoration.

| Token | Dark | Light | Agent |
|---|---|---|---|
| `--ds-agent-sentinel` | `#6b8fcf` | `#3f6fb8` | Sentinel (watcher) |
| `--ds-agent-investigator` | `#a18bdd` | `#7858c4` | Investigator |
| `--ds-agent-kb-builder` | `#3ecf8e` | `#10a877` | KB Builder — aligns with nominal green on purpose |
| `--ds-agent-work-order` | `#d4a24a` | `#a77318` | Work Order |
| `--ds-agent-qa` | `#d17ba9` | `#a34e81` | QA |

### 2.5 Discipline

- **One** accent. Blue. Nothing else competes.
- **No gradients** (multi-color, vertical, radial). The only permitted
  `background-image` at the app-shell level is the neutral base.
- **No glassmorphism**, no `backdrop-blur` on surfaces (drawers may
  use a plain translucent overlay for the scrim behind them — that's
  the only exception).
- **No glow** as decoration. Focus ring is a 2px solid
  `--ds-accent-ring`, no blur.
- **No grain overlay**, no `feTurbulence` noise, no scanlines. v1's
  `body::before` noise layer is removed.

---

## 3. Typography

### 3.1 Fonts — Inter everywhere, mono rare

| Token | Value | Use |
|---|---|---|
| `--ds-font-sans` | `"Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif` | **Everything** — headers, body, labels |
| `--ds-font-mono` | `"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, Menlo, monospace` | Rare — numerics in tables, code blocks, kbd keys |

**v1 → v2 change:** mono is **no longer a primary typographic register**.
v1 used mono for every micro-label, section header, metadata strip —
that's the single biggest contributor to the Bloomberg/SCADA read. In
v2, mono shows up only where literal: numeric cells, kbd shortcuts,
code artifacts, commit SHAs. Everywhere else → Inter.

### 3.2 Type scale — fluid-capped, app-appropriate

| Token | Size | Weight | Line-height | Use |
|---|---|---|---|---|
| `--ds-text-xs` | `11px` | 500 | 1.45 | Fine print, table metadata |
| `--ds-text-sm` | `13px` | 400-500 | 1.5 | Captions, labels, secondary body |
| `--ds-text-base` | `14px` | 400 | 1.55 | **Default body** — the app runs on this |
| `--ds-text-md` | `15px` | 500 | 1.5 | Primary UI controls, button text |
| `--ds-text-lg` | `17px` | 600 | 1.4 | Card titles, drawer headers |
| `--ds-text-xl` | `20px` | 600 | 1.3 | Section / panel headers |
| `--ds-text-2xl` | `24px` | 600 | 1.25 | Page headers |
| `--ds-text-3xl` | `30px` | 700 | 1.2 | Login splash, empty-state displays (rare) |

**Hard rules:**
- **No `clamp()` with vw units** in the type scale. This is an app; the
  window is not a canvas. Use static px.
- **No display token beyond 30px**. If something feels like it needs
  `48px+`, it's a landing page, not an app surface.
- **No letter-spacing +0.08em mono-caps pattern.** That was v1's signature
  and it's retired.

### 3.3 Tracking & case

| Role | Weight | Tracking | Case |
|---|---|---|---|
| Page header | 600-700 | `-0.01em` | Sentence case |
| Section header | 600 | 0 | Sentence case (not uppercase) |
| Card title | 600 | 0 | Sentence case |
| Body | 400 | 0 | Sentence case |
| Small label / caption | 500 | 0 | Sentence case |
| Table column header | 500 | `0.01em` | Sentence case |
| KBD key | 500 (mono) | 0 | As-is |
| Numeric cell | 500 (mono, tabular-nums) | 0 | As-is |

**Section headers are sentence case, not uppercase.** `Control room`,
not `CONTROL ROOM`. This is the second biggest v1 → v2 change and the
fastest way to kill the SCADA read.

---

## 4. Grid & spatial architecture

### 4.1 Base unit — 4px

All spacing is `n × 4px`. Nothing changes here.

### 4.2 Radius — unified at 10px

v1 had five radii (3/5/7/10/14) with deliberately different values per
component class. v2 **collapses this** to three, with 10px as the
everyday radius — the "Linear / Vercel look".

| Token | Value | Use |
|---|---|---|
| `--ds-radius-sm` | `6px` | Badges, small tags, kbd keys, inline chips |
| `--ds-radius-md` | `10px` | **Default** — buttons, inputs, cards, drawers, menus |
| `--ds-radius-lg` | `14px` | Modals, large surfaces (rare) |

**Never:**
- `rounded-full` (except on `StatusDot`, which is a 6px circle)
- `rounded-2xl` or anything > 14px
- `rounded-none` / radius 0

### 4.3 Elevation — shadows are allowed (sparingly)

v1 banned shadows outright. v2 allows **one elevation shadow** for
overlays (dropdowns, modals, floating menus, toast notifications) to
separate them from the app shell. Cards and drawers still rely on the
`bg-base → bg-surface → bg-elevated` ladder; only floating overlays
get shadow.

| Token | Dark | Light |
|---|---|---|
| `--ds-shadow-overlay` | `0 10px 30px -10px rgb(0 0 0 / 0.6), 0 4px 12px -4px rgb(0 0 0 / 0.5)` | `0 10px 30px -10px rgb(0 0 0 / 0.15), 0 4px 12px -4px rgb(0 0 0 / 0.08)` |

No other shadow token exists. If a component wants a shadow and isn't
a floating overlay, the answer is no.

### 4.4 Hairlines — kept, but quieter

Compartment hairlines (1px `--ds-border`) stay — they're how we separate
panels without shadows. But we stop using the brutalist `grid; gap: 1px`
trick where the "divider" is the gap background showing through. Plain
`border-*: 1px solid var(--ds-border)` is clearer and easier to tune.

### 4.5 Negative space

| Zone | Value |
|---|---|
| Between layout regions (topbar / main / drawer) | 0 — adjacent, divided by 1px border |
| Between cards inside a panel | 12px (3 units) |
| Inside a card | 16px padding (4 units), 20px for dense-content cards |
| Around section headers | 20px top, 12px bottom |
| Around page headers | 32px top, 24px bottom |
| Inline gap in kpi/stat groups | 24px |

### 4.6 Density

v1's "bimodal density" (dense chat/inspector vs. spacious P&ID) is
retained in principle — but the dense zones **relax slightly**. Chat
rows gain 2px vertical padding; activity-feed rows move from 28px
height to 32px. The app should feel like it breathes.

---

## 5. Signatures (what makes the app recognizable — v2 version)

v1 listed six signatures. Four of them leaned costume. Here's the v2 set.

### 5.1 Section meta-line (replaces bracketed labels)

Every major panel has a one-line header of the form:

```
Pump overview                                      P-02 · Apr 22, 2026
```

- Title: Inter 600, `text-xl`, sentence case, primary fg
- Right meta: Inter 500, `text-sm`, muted fg, `·` separators
- No brackets. No mono. No uppercase.
- Example meta tokens: entity id, last update, active agent, run id.

This is the **single most recognizable v2 pattern** — calm, stated,
never decorated. It replaces both the bracketed label (§5.1 v1) and the
registration-mark strip (§5.2 v1).

### 5.2 Status rail — kept, quieter

2px vertical rail on the left edge of any surface that represents a
**live entity under watch** (equipment card, critical WO row, active
chat session). Silent when nominal/idle (no rail rendered at all —
absence is the default state), speaks when warning/critical. Pulse
animation kept on critical, 1.6s loop, `prefers-reduced-motion`
respected.

**v1 → v2 change:** rail no longer appears on *every* card. It's the
exception, not the default. Most cards read as plain bordered surfaces.

### 5.3 Inline metadata line (replaces `MetaStrip` brackets)

Inline metadata — `P-02 · apr 22, 2026 · sentinel` — is rendered as
plain sans-serif muted text with `·` separators. No `LABEL / value`
structure, no slashes-as-decoration, no mono-caps.

```
Before (v1):   UNIT / D-02  ·  CELL / 02.01  ·  REV / 2026.04.22
After  (v2):   Unit D-02 · Cell 02.01 · Updated Apr 22
```

### 5.4 Keyboard-first micro-affordances

Inspired by Linear: every actionable surface shows its keyboard
shortcut on hover (or always visible for primary CTAs). `KbdKey`
appears next to commands, menu items, drawer triggers. This signals
"this app is meant to be driven by keyboard" — and operators will
actually use it.

### 5.5 Empty states — illustration-free, text-first

No empty-state SVG illustrations, no cartoon mascots. Empty states are
a muted headline + one body line + a single accent CTA button. Calm,
direct, unembarrassed.

### 5.6 The A-mark

The `AriaMark` (triangle-A with telemetry pulse) stays as the sole logo.
It appears:
- Topbar left, 20px, `--ds-fg-primary` (**not** accent — the brand mark
  doesn't need the accent)
- Boot/loading screen, 48px, subtle pulse
- Favicon, 32×32 from the same SVG
- Never as a decorative badge next to AI features

**v1 → v2 change:** the mark's default color is now fg-primary, not
accent. Cyan mark everywhere contributed to the over-branded feel.

### 5.7 Retired signatures (from v1)

- ❌ Bracketed section headers `[ CONTROL ROOM ]`
- ❌ Mono-caps +0.08em tracking everywhere
- ❌ Registration marks `REV / 2026.04.22` · `UNIT / D-02` pattern
- ❌ Scanline overlay on thinking inspector
- ❌ Grain overlay on `body::before`
- ❌ Status rail on every card by default

---

## 6. Motion language

Framer Motion stays. Vocabulary narrows further.

| Variant | When | Duration | Easing |
|---|---|---|---|
| `fadeIn` | Most entries (panels, menus, rows) | 160ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `fadeSlideUp` | Heavier entries (drawer content, modal) | 220ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `streamToken` | Chat / thinking tokens arriving | 60ms/token | linear |
| `drawerSlide` | Drawer open/close | 220ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `modalScale` | Modal/popover open | 180ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `statusPulse` | Critical-status entity rail | 1.6s loop | `ease-in-out` |

**Hover interactions:**
- Buttons: `background-color` shift, 120ms
- Rows (WO list, activity feed): `background: --ds-bg-hover`, 120ms.
  **No** indent, **no** accent rail appearing on hover (v1 had that —
  removed; too busy).
- Cards: no hover effect at rest. If the card is clickable, the whole
  surface shifts to `--ds-bg-hover`, that's it.
- Links: underline on hover, accent color on active.

**Banned motion patterns (carried from v1, tightened):**
- Word-by-word text reveal on any content
- Marquees
- Parallax on cards or any app content
- Ripple on click (Material leak)
- `layoutId` flying animations between panels
- GSAP, Lenis, smooth-scroll libs, SplitText, ScrollTrigger
- Cursor lerp / magnetic buttons / custom cursor of any kind
- Any animation > 300ms **except** `statusPulse` (1.6s loop) and
  `drawerSlide` (220ms — already under 300)

All timing tokens halve under `prefers-reduced-motion: reduce`;
`statusPulse` becomes a static opacity.

---

## 7. Iconography

Lucide stays. Rules unchanged from v1 except:

| Rule | v2 |
|---|---|
| Stroke-width | **1.75** (was 1.5 — slightly heavier reads better on light mode) |
| Size | `size-4` (16px) or `size-5` (20px) only |
| Pair with label | Yes, except toolbar toggles and close icons |
| Banned decoratively | `Sparkles`, `Zap`, `Wand2`, `Bot`, `Brain` |
| Default color | `--ds-fg-muted`, inherit on hover/active |

`AriaMark` remains the only custom SVG in v1 scope.

---

## 8. Theming — dark and light, both shipped

### 8.1 Implementation

- Root CSS variables defined on `:root` (dark by default)
- Light theme applied via `:root[data-theme="light"]`, setting the same
  token names to their light values
- Theme picker in user menu (topbar): `System / Dark / Light`. System
  follows `prefers-color-scheme`.
- First paint reads theme from `localStorage` before React mounts
  (inline script in `index.html`) — no theme flicker on load.
- All component styles use tokens exclusively. Zero hardcoded hex in
  `.tsx` files below the token layer.

### 8.2 Dark-first discipline

Dark stays the primary — component screenshots, demo videos, docs
default to dark. Light must pass the same a11y checks but is not where
we optimize first.

### 8.3 Accessibility (both themes)

- Body text contrast ≥ 4.5:1 (`--ds-fg-primary` on `--ds-bg-base`)
- UI text / placeholders ≥ 3:1 (`--ds-fg-muted` on `--ds-bg-base`)
- Accent on surface ≥ 4.5:1 for text, ≥ 3:1 for non-text indicators
- Focus ring: 2px `--ds-accent-ring`, 2px offset from `--ds-bg-base`,
  visible on both themes
- Every interactive element has a `:focus-visible` state. No `outline: none`
  without a replacement ring.

---

## 9. Anti-patterns (v2 banned list)

### Carried from v1 (still banned):
- ❌ Multi-color gradients, radial gradients, backdrop-blur on surfaces
- ❌ Neon glow (any color, any component)
- ❌ Emoji in product UI text
- ❌ `Sparkles`/`Zap`/`Wand2`/`Bot`/`Brain` icons used decoratively
- ❌ "Powered by AI / Generated with Claude" badges in product UI
- ❌ Stock photos, vector illustrations with hands-holding-screens
- ❌ Shadcn components dropped in directly (keep our own primitives)
- ❌ GSAP, Lenis, ScrollTrigger, Three.js, react-three-fiber
- ❌ Custom cursor, magnetic hovers, cursor-following reveals
- ❌ `rounded-full` outside StatusDot; `rounded-2xl`; radius 0
- ❌ `layoutId` flying animations between panels
- ❌ Placeholder `lorem ipsum`; "Unleash the power of…" microcopy
- ❌ Count-up animation on numbers (values change, they don't count-up)
- ❌ Titles at `clamp(Nrem, 15vw, …)` / 100vh hero / landing tropes

### Newly banned (v2 pivot):
- ❌ Bracketed section headers `[ … ]`
- ❌ Mono-caps +0.08em tracking on headers, labels, metadata
- ❌ Registration-mark metadata pattern `UNIT / D-02 · CELL / 02.01 · REV / 2026.04.22`
- ❌ Uppercase on any section/card/page header
- ❌ Electric cyan / steel cyan accent — blue only
- ❌ Grain overlay / `feTurbulence` noise / scanline overlay
- ❌ Status rail on every card by default (exception-only now)
- ❌ Five-radii system (collapsed to three)
- ❌ "Military / aviation / terminal" visual references in new work
- ❌ Accent color applied to `AriaMark` by default

### Review-time check (v2):
> *"Would this appear in Linear, Vercel Dashboard, or Stripe Dashboard?
> No → banned. Does this read 'AI-slop' or 'SCADA cosplay'? Yes →
> banned."*

---

## 10. Migration table (v1 → v2)

This is the **executable delta**. `dev-frontend` works off this section
once Adam signs off.

### 10.1 Tokens (`tokens.css`)

| Token | Action | Detail |
|---|---|---|
| `--ds-bg-base` (dark) | **REFACTOR** | `#0a0e14` → `#0b0b0f` (warm neutral) |
| `--ds-bg-surface` (dark) | **REFACTOR** | `#0d131d` → `#111114` |
| `--ds-bg-elevated` (dark) | **REFACTOR** | `#1a2435` → `#17171c` |
| `--ds-bg-hover` | **ADD** | new token — `#1c1c22` dark / `#efeeec` light |
| `--ds-border` (dark) | **REFACTOR** | `#232d3f` → `#24242b` |
| `--ds-border-strong` (dark) | **REFACTOR** | `#334155` → `#33333c` |
| `--ds-fg-primary` (dark) | **REFACTOR** | `#e4e9f2` → `#ededef` |
| `--ds-fg-muted` (dark) | **REFACTOR** | `#8491a8` → `#9a9aa3` |
| `--ds-fg-subtle` (dark) | **REFACTOR** | `#52627a` → `#64646d` |
| `--ds-accent` | **REFACTOR** | `#3ab5c9` (cyan) → `#3478f6` (blue) |
| `--ds-accent-hover` | **REFACTOR** | `#5fd0e3` → `#5990f8` |
| `--ds-accent-glow` | **REMOVE** | replaced by `--ds-accent-ring` (solid, no blur) |
| `--ds-accent-ring` | **ADD** | `rgb(52 120 246 / 0.35)` dark / light |
| `--ds-accent-soft` | **ADD** | `rgb(52 120 246 / 0.12)` dark / `rgb(37 99 235 / 0.08)` light |
| `--ds-accent-fg` | **KEEP** (value changes) | `#04131a` → `#ffffff` |
| `--ds-status-nominal` | **REFACTOR** | `#2fa67c` → `#3ecf8e` dark, `#10a877` light |
| `--ds-status-warning` | **REFACTOR** | `#d9922b` → `#e5a13a` dark, `#b8791b` light |
| `--ds-status-critical` | **REFACTOR** | `#d84545` → `#e5484d` dark, `#c8312f` light |
| `--ds-status-info` | **ADD** | inherits `--ds-accent` |
| `--ds-agent-sentinel` | **REFACTOR** | `#5a7fb5` → `#6b8fcf` dark, `#3f6fb8` light |
| `--ds-agent-investigator` | **REFACTOR** | `#8b6fd9` → `#a18bdd` dark, `#7858c4` light |
| `--ds-agent-kb-builder` | **REFACTOR** | `#2fa67c` → aligned with new nominal green |
| `--ds-agent-work-order` | **REFACTOR** | `#c89635` → `#d4a24a` dark, `#a77318` light |
| `--ds-agent-qa` | **REFACTOR** | `#c76ca3` → `#d17ba9` dark, `#a34e81` light |
| `--ds-radius-xs` | **REMOVE** | collapsed into `--ds-radius-sm` |
| `--ds-radius-sm` | **REFACTOR** | `5px` → `6px` (badges, tags, kbd) |
| `--ds-radius-md` | **REFACTOR** | `7px` → `10px` (the default everything) |
| `--ds-radius-lg` | **REFACTOR** | `10px` → `14px` (modals / large) |
| `--ds-radius-xl` | **REMOVE** | not used in v2 |
| `--ds-shadow-overlay` | **ADD** | new — for floating overlays only |
| `--ds-text-*` scale | **REFACTOR** | static px values (no clamp), add `--ds-text-md` 15px and `--ds-text-3xl` 30px; remove `--ds-text-display` |
| `--ds-motion-*` | **KEEP** | values unchanged (120 / 220 / 420 ms), but `--ds-motion-slow` now only used by `statusPulse` |
| `--ds-ease-out` | **KEEP** | unchanged |
| `body::before` grain layer | **REMOVE** | entirely |

**Light theme block (`:root[data-theme="light"]`):** add as new block
in `tokens.css` with every token's light value per §2.

### 10.2 Components (`src/design-system/*`)

| Component | Action | Detail |
|---|---|---|
| `AriaMark.tsx` | **REFACTOR** | Default color → `--ds-fg-primary`. Accent only when explicitly requested via prop. |
| `Button.tsx` | **REFACTOR** | Radius `--ds-radius-sm` → `--ds-radius-md` (10px). Focus ring uses `--ds-accent-ring`, not `--ds-accent`. Sizes stay (sm 28 / md 36 / lg 44 px height). Font weight 500. |
| `Card.tsx` | **REFACTOR** | Radius `--ds-radius-md` → `--ds-radius-md` (value changed 7→10px). `rail` prop kept but no longer used by default — callers opt in only for live-entity cards. |
| `Badge.tsx` | **REFACTOR** | Radius `--ds-radius-xs` (3px) → `--ds-radius-sm` (6px). **Remove `tag` variant's mono-uppercase default** — default becomes sentence-case sans. `tag` prop becomes `variant="code"` for rare code-flavored badges (version strings, SHAs). |
| `StatusDot.tsx` | **KEEP** | unchanged; circle 6px |
| `Drawer.tsx` | **REFACTOR** | Radius follows `--ds-radius-md` (10px) on top edges; bottom flush to viewport kept. Overlay scrim kept (translucent, no blur). |
| `Tabs.tsx` | **REFACTOR** | Selected-tab visual: **underline 2px accent** (was already heading there in v1). Tab font weight 500, sentence case. |
| `KbdKey.tsx` | **KEEP** | mono stays here — this is a literal use. Height 20px aligned. |
| `icons.tsx` | **REFACTOR** | Forced stroke-width `1.5` → `1.75`. |
| `SectionHeader.tsx` | **REFACTOR** (major) | Drop mono, drop uppercase, drop +0.08em tracking, drop bracket option. New API: sentence-case title (Inter 600 `text-xl`) + optional right `meta` (sentence-case sans muted). Keep `marker` prop only if we actually want numbered sections (rare). |
| `MetaStrip.tsx` | **REFACTOR** (major) | Drop mono, drop uppercase, drop slashes-as-decoration. Render as `Label value · Label value` sentence-case sans muted, `·` separators only. Simpler API: same `items` shape accepted, rendering changes. |
| `Hairline.tsx` | **REFACTOR** | Drop mono-caps label. Label option now renders sentence-case sans muted. Default unlabeled divider unchanged. |
| `StatusRail.tsx` | **KEEP** | behavior unchanged; will be used less (exception-only per §5.2). |
| *(new)* `ThemeProvider` | **ADD** | context + hook that sets `data-theme` on `<html>`, syncs to `localStorage`, responds to `prefers-color-scheme` when set to system. |
| *(new)* `ThemeToggle` | **ADD** | segmented control in user menu: `System / Dark / Light`. |
| *(new)* `Kbd` utility | **KEEP** existing `KbdKey` — just verify it's used in §5.4 places (command palette, menu items) once shell lands. No immediate change. |

### 10.3 App-shell & pages

| Surface | Action | Detail |
|---|---|---|
| `App.tsx` bootstrap | **REFACTOR** | Wrap in `ThemeProvider`. Add `<script>` in `index.html` that sets `data-theme` before React mounts. |
| `DesignPage` | **REFACTOR** | Updated to showcase new primitives in both themes. Add theme toggle. Remove all v1-flavored examples (bracketed headers, UNIT/CELL metadata). |
| Topbar (per M6.3) | **N/A** | Will be built per §5.1 meta-line pattern — this plan is its spec. |
| `body::before` grain | **REMOVE** | delete the rule and its `prefers-reduced-motion` guard. |

### 10.4 Count summary

- **KEEP as-is:** 4 (AriaMark behavior minus color default, StatusDot, KbdKey, StatusRail)
- **REFACTOR:** 11 component-level + most tokens
- **REMOVE:** grain overlay, `--ds-accent-glow`, `--ds-radius-xs`, `--ds-radius-xl`, `--ds-text-display`
- **ADD:** 5 tokens (`--ds-bg-hover`, `--ds-accent-ring`, `--ds-accent-soft`, `--ds-status-info`, `--ds-shadow-overlay`), full light-theme block, `ThemeProvider`, `ThemeToggle`

---

## 11. Rollout plan (same branch `feat/36-app-shell`)

All of this ships on the existing M6.3 branch — no separate branch.

### Phase A — tokens & theming foundation (first PR on branch)
1. Rewrite `tokens.css` with v2 dark values + light-theme block
2. Remove `body::before` grain
3. Add `ThemeProvider` + `ThemeToggle` + pre-mount theme script in `index.html`

### Phase B — primitive refactor pass
4. Refactor `SectionHeader`, `MetaStrip`, `Hairline` per §10.2
5. Radius + focus-ring pass on `Button`, `Card`, `Drawer`, `Badge`, `Tabs`
6. Icon stroke-width bump
7. `AriaMark` default color swap

### Phase C — DesignPage refresh + visual regression
8. Rebuild `DesignPage` as the v2 showcase, both themes
9. QA a11y + contrast checks (§8.3)
10. Adam review before M6.3 app-shell uses these primitives

### Out of scope for this PR
- Favicon regeneration from `AriaMark` SVG
- Self-hosted font packages (keep CDN for now)
- Any feature-page work (M6.3 consumes these primitives later)

---

## 12. Validation checklist (Adam's call before dev-frontend touches code)

- [ ] §1 Direction artistique (operator-calm, Linear/Vercel/Stripe refs) validée
- [ ] §2 Palette dark **and** light accepted (including blue accent `#3478f6`)
- [ ] §3 Typography: Inter-everywhere, sentence-case headers, no mono-caps signature — accepted
- [ ] §4 Radius unified to `sm 6 / md 10 / lg 14`, shadow reintroduced for overlays only — accepted
- [ ] §5 v2 signatures (meta-line, quiet status rail, inline metadata, kbd-first, text-first empty states) accepted; v1 signatures retired accepted
- [ ] §6 Motion vocabulary narrower; no cursor/magnetic/scroll libs — accepted
- [ ] §8 Dark + light as equal citizens, theme toggle in topbar — accepted
- [ ] §9 Anti-patterns additions (brackets, mono-caps, registration marks, grain, scanline, cyan) accepted as binding
- [ ] §10 Migration table is executable as-is by dev-frontend (no further spec needed)
- [ ] §11 Rollout lands on `feat/36-app-shell` in three phases — accepted
- [ ] Nothing critical missing

→ Validate by replying **"go v2"** — team-lead unblocks task #2 (dev-frontend).
→ Reject a section by naming it (e.g. "§2.2 accent: try teal"; "§4.2 radius: keep five"); I amend, you re-validate.
→ Want additions (new signature, missing component, extra ref) → say so, I'll amend §5 / §10 and bump this file.
