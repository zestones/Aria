# ARIA — Design Plan (M6.2 identity pass)

> Hybrid source: `modern-design` (editorial rigor) ∩ `industrial-brutalist-ui`
> (tactical telemetry). Adapted to a **data-dense control-room app**, not a
> landing page. This document is the **visual law** that governs every
> component that lands in M6.3 → M9.

---

## 1. Direction artistique

**Name:** *Editorial Industrial Telemetry.*

**Brief:** an operator console for a water-treatment plant that happens to be
driven by autonomous AI agents. The interface must feel **precision-engineered**
(SCADA / Bloomberg Terminal / SIMATIC HMI), **editorial** (Swiss print, Linear
app, Figma Config), and **restrained** (no marketing lyricism, no AI sparkle).
Dense when it's data. Spacious when it's meaning. Always deliberate.

**North star references**
- Bloomberg Terminal — tabular data, tight mono, utilitarian color
- Linear — sobriety, motion discipline, zero decoration
- SIMATIC HMI / Honeywell Experion — industrial conventions operators recognize
- Teenage Engineering OP-1 — uppercase micro-labels, mechanical precision
- Figma Config posters — editorial sans at high contrast
- Aerospace HUDs (F-35 MFD) — crosshairs, brackets, purposeful framing

**Vibe test (the judge look-up-from-screen test)**
If a juror glances at the screen for half a second, we want:
- "this is an actual operator tool" — not a slide deck
- "it's pulling live data" — not a static mockup
- "there's a system behind it" — not copy-pasted components

**Vibe anti-test**
- "oh, another AI product landing" → failure
- "that looks like shadcn" → failure
- "why does it glow?" → failure

---

## 2. Palette (final hex, locked)

**Substrate: Tactical Telemetry (dark).** Never mix a light mode.

```
--ds-bg-base       #0a0e14    warm obsidian  (avoid pure #000 — dead zone)
--ds-bg-surface    #0d131d    +1 level       (panels, chat, drawers)
--ds-bg-elevated   #1a2435    +2 level       (cards inside panels, artifacts)
--ds-border        #232d3f    hairline       (1px compartment lines, default)
--ds-border-strong #334155    structural     (2px for section dividers only)

--ds-fg-primary    #e4e9f2    phosphor       (data, headlines, primary text)
--ds-fg-muted      #8491a8    label gray     (captions, metadata, tool names)
--ds-fg-subtle     #52627a    blueprint gray (dividers annotations, footnotes)

--ds-accent        #3ab5c9    steel cyan     (1 accent — THE accent, signature)
--ds-accent-hover  #5fd0e3    interaction visible on hover
--ds-accent-glow   rgb(58 181 201 / 0.22)  for 1px rings only, no blur

--ds-status-nominal   #2fa67c  moss green
--ds-status-warning   #d9922b  amber ochre
--ds-status-critical  #d84545  aviation red (hazard)

--ds-agent-sentinel      #5a7fb5  steel blue
--ds-agent-investigator  #8b6fd9  slate violet
--ds-agent-kb-builder    #2fa67c  moss green
--ds-agent-work-order    #c89635  dried ochre
--ds-agent-qa            #c76ca3  dusty rose
```

**Discipline:**
- **One** accent. Cyan. Nothing else competes.
- Status colors are **for status only** (threshold states, alerts, badges) — never decorative.
- Agent colors appear **only** where an agent is named (badge, activity feed row, inspector header).
- **Zero gradients, zero glassmorphism, zero glow-as-decoration.** The only glow permitted is a 1px accent ring on focus.

---

## 3. Typography

Two fonts. No third. No serif ornamentation.

```
--ds-font-sans      Inter — variable weights 400/500/600/700/900
--ds-font-mono      JetBrains Mono — 400/500/600
```

**Why Inter + JBM (not Syne, not Space Grotesk):**
- Inter's hinting is bullet-proof at small sizes — we display data in 11-14px a lot
- JetBrains Mono's 400 is already tight enough to sit next to numerals without optical drift
- Both are free, already loaded, zero new deps

**Upgrade path if needed:** add `@fontsource-variable/archivo` for a heavier display-only weight on 1-2 hero-scale surfaces. Decide at implementation if Inter 900 alone holds up.

### Type scale (fluid, capped — we're an app, not a landing)

| Token | Size | Use |
|---|---|---|
| `--ds-text-xs` | 11px | mono labels, metadata, coordinates |
| `--ds-text-sm` | 13px | small body, captions |
| `--ds-text-base` | 14px | default body text |
| `--ds-text-md` | 16px | primary UI text, primary button |
| `--ds-text-lg` | 20px | card titles, badges on cards |
| `--ds-text-xl` | clamp(24px, 2vw, 28px) | section headers |
| `--ds-text-2xl` | clamp(32px, 3vw, 40px) | page headers (login screen, demo memory scene only) |
| `--ds-text-display` | clamp(48px, 5vw, 64px) | reserved — scene-1 onboarding welcome **only** |

**Hard rule:** no text ever uses `15vw` or anything landing-scale. We're not impressing a recruiter, we're watching a pump.

### Tracking & leading

| Class | tracking | leading | case |
|---|---|---|---|
| Display header (Inter 900) | -0.025em | 0.95 | mixed case allowed |
| Section header (Inter 700) | -0.015em | 1.1 | mixed case |
| Body (Inter 400-500) | 0 | 1.5 | sentence case |
| Data (JBM 500) | +0.02em | 1.35 | as-is |
| **Micro-label** (JBM 500 small caps) | **+0.08em** | 1.2 | **ALL CAPS** |

The uppercase micro-label at +0.08em tracking is the **single most recognizable visual signature** across the whole app. It brackets data, names sections, labels tools, marks agents. If we do **one** typographic thing right, it's that.

---

## 4. Grid & spatial architecture

**Base unit:** 4px. All spacing is `n × 4px`.

**Compartmentalization rule (industrial-brutalist-ui §5):**
Surfaces are delimited by **visible 1px hairlines** in `--ds-border`, not by shadows. Cards, drawers, panels, chat messages — all read as adjacent compartments, not floating glass elements.

**Border-radius discipline:**
- Interactive controls (Button, Input, Tab): **5px** (current `--ds-radius-sm`)
- Surfaces (Card, Drawer panels): **7px** (`--ds-radius-md`)
- Status tags (Badge): **3px** (`--ds-radius-xs`, rectangles)
- **Never** `rounded-full` except on StatusDot (which is literally a dot)
- **Never** `rounded-2xl` or anything louder than 10px

**Shadows:** forbidden as decoration. Only `--ds-accent-glow` 1px ring on focus-visible. Elevation is conveyed by the `bg-base → bg-surface → bg-elevated` ladder, not by blur.

**Negative space:**
- Between primary layout zones (topbar / main / drawer): 0 (adjacent, divider-only)
- Between cards inside a panel: 12px (3 units)
- Inside a card: 16px padding (4 units)
- Around section headers: 24px top, 12px bottom (6 / 3 units)

**Bimodal density (brutalist §5):** the chat / artifacts / thinking inspector stay dense (≤12px gaps, mono data everywhere). The P&ID canvas stays spacious (equipment nodes ≥80px apart, empty-void feels deliberate). The interface breathes **differently** per zone — that's the editorial part.

---

## 5. Micro-patterns that give identity (the signatures)

These 6 micro-patterns appear everywhere. They're the difference between "clean design" and "this has its own language."

### 5.1 Bracketed micro-labels
Section headers get leading/trailing bracket characters rendered as mono chars, not components:

```
[ CONTROL ROOM ]        PUMP / P-02        AGENT / INVESTIGATOR
```

Bracket / slash / dot separators replace colons, arrows, and icons for metadata. Implemented as plain text — no decoration overhead.

### 5.2 Registration marks as structure, not legal text
`REV / 2026.04.22` · `UNIT / D-02` · `CELL / 02.01` appear as top-right metadata on major panels. They're signal ("this is a real system") — and they auto-fill from real data (site id, cell id, commit sha), so they're never dummy.

### 5.3 Hairline compartment lines
`grid; gap: 1px` on containers with child `bg-[--ds-bg-surface]` creates razor-thin dividers between rows and columns **without ever declaring a border**. Used in the KPI bar, activity feed, work order list. Structural, not decorative.

### 5.4 Status rail
Along the left edge (2px wide) of any surface that represents a live entity (equipment card, chat message, WO row), a colored rail conveys its current state (`nominal / warning / critical / idle`). Think of it as the tab of a filing folder. Silent when nominal, speaks when critical.

### 5.5 Scanline overlay — *sparingly*
On the Agent Inspector "Thinking" tab only, a 3-4% opacity `repeating-linear-gradient` adds a faint CRT feel. This is the **only** place scanlines appear — it frames Opus 4.7's extended thinking as something being "piped in from elsewhere". Everywhere else = flat. Respects `prefers-reduced-motion`.

### 5.6 The A-mark
The `AriaMark` (triangle-A with a telemetry pulse crossing it, already shipped in affûtage commit) is the sole logo. It appears:
- Topbar left, 24px, accent color
- Boot screen loader, 64px, subtle pulse
- Favicon, rendered at 32x32 from the same SVG
- Never in an AI-slop "sparkles emoji" role

---

## 6. Motion language

**We keep framer-motion. No GSAP, no Lenis, no SplitText, no magnetic cursors.** The motion library is a **narrow vocabulary** deliberately, not a catalog.

| Variant | When | Duration | Easing |
|---|---|---|---|
| `fadeInUp` | Any element entering viewport | 220ms | cubic-bezier(0.16, 1, 0.3, 1) |
| `streamToken` | Chat tokens arriving (chat, thinking stream) | 80ms/token | linear |
| `artifactReveal` | Generative UI artifact renders in chat | 280ms | cubic-bezier(0.16, 1, 0.3, 1) |
| `anomalyPulse` | Equipment under critical status | 1.4s loop | easeOut |
| `handoffSweep` | Agent handoff row in Activity Feed | 320ms once | cubic-bezier(0.16, 1, 0.3, 1) |
| `drawerSlide` | Drawers (chat, inspector) | 240ms | cubic-bezier(0.16, 1, 0.3, 1) |

**Hover interactions:**
- Buttons: background shade, 120ms
- Rows (WO list, Activity Feed): 1px left accent rail appears, 120ms
- Equipment nodes on P&ID: node stroke thickens +0.5px, 120ms
- Cards: **no** scale, **no** shadow. The only hover sign is the status rail intensifying.

**Banned motion patterns:**
- Text reveal word-by-word (landing-flavor)
- Marquees (cheap horizontal motion)
- Parallax on cards (disorients in dense UI)
- Ripple on click (Material Design leak)
- Any animation > 420ms outside of `anomalyPulse` loop

---

## 7. Iconography

**Lucide stays, but curated & standardized.**

| Rule | Reason |
|---|---|
| Stroke-width **always 1.5** (never default 2) | Matches the 1px hairlines grid |
| Size class = `size-4` (16px) or `size-5` (20px) only | No icon ever larger than the text it pairs with |
| Icon + label > icon alone everywhere except toolbar toggles | Accessibility + no decoration |
| **Never** use `Sparkles`, `Zap` decoratively — only where literal (power, speed) | These are the most AI-slop icons in lucide |
| Color = `--ds-fg-muted` default, inherit on hover/active | Icons should whisper, labels talk |

**Custom icons:** `AriaMark` is the only non-lucide icon allowed in v1. Adding custom SVGs requires PR justification.

---

## 8. Component translations (primitives → this plan)

| Primitive | Change required | Status |
|---|---|---|
| `AriaMark` | keep as-is | ✅ done in affûtage |
| `Button` | tighten radius to 5px ✅, confirm disabled visual is zero-opacity (not reduced) | done |
| `Card` | add optional `rail` prop (status color on left edge) | **todo** |
| `Badge` | `tag` variant mono-uppercase ✅, add mono default for agent badges | mostly done, refine |
| `StatusDot` | keep, add `showLabel` prop to pair with mono micro-label | **todo** |
| `Drawer` | keep, but remove the `rounded` on bottom drawer edges — flush to viewport | **todo** |
| `Tabs` | change selected tab background from surface to a 2px bottom rail in accent | **todo** |
| `KbdKey` | keep, align height to 20px (grid-aligned) | done |
| `Icons` | add wrapper that forces stroke-width 1.5 | **todo** |
| *new* `SectionHeader` | mono uppercase, +0.08em tracking, optional bracket chars, optional metadata right-align | **todo** |
| *new* `MetaStrip` | right-side metadata strip (UNIT, CELL, REV) for panels | **todo** |
| *new* `Hairline` | 1px divider with optional label inlay (`─── control room ───`) | **todo** |
| *new* `StatusRail` | 2px vertical colored bar for cards / rows | **todo** |

---

## 9. Anti-patterns (the banned list — non-negotiable)

This section is **armed** — when reviewing a future PR, if any of these slips in, flag it immediately.

### From `modern-design` we reject (inappropriate for app context):
- ❌ Titles at `clamp(4rem, 15vw, 12rem)` — we're not a landing page
- ❌ Hero with 100vh layout — we have a dashboard
- ❌ Smooth scroll (Lenis or alternative)
- ❌ Custom cursor (any kind, including "simple dot")
- ❌ Magnetic hover on buttons
- ❌ Text reveal word-by-word on any content
- ❌ Marquees of any kind
- ❌ Image reveal that follows cursor
- ❌ Count-up animation on any number (KPI values update, they don't count-up)

### From `industrial-brutalist-ui` we partially reject (preserves professionalism):
- ❌ CRT scanlines everywhere — single-zone only (thinking inspector)
- ❌ `border-radius: 0` absolute — we allow 3-7px, not 0
- ❌ 1-bit dithering on images — feels costume
- ❌ Light mode substrate — dark-only, v1 locked

### Global AI-slop guardrails:
- ❌ Gradients (multicolor, vertical, radial outside of subtle hero grain)
- ❌ Glassmorphism, backdrop-blur on surfaces
- ❌ Neon glows (any color)
- ❌ Emoji in UI text (comments in code OK, never in product text)
- ❌ Sparkles icon in a functional role
- ❌ "Powered by AI" badges, "Generated with Claude" footers in product UI
- ❌ Shadcn components dropped-in — we have our own primitives
- ❌ Three.js, react-three-fiber
- ❌ GSAP, ScrollTrigger, SplitText
- ❌ Framer Motion layout animations with `layoutId` flying across screen
- ❌ Tailwind arbitrary rounding beyond 10px (`rounded-2xl`, `rounded-full` except StatusDot)
- ❌ Icons > text size next to them
- ❌ Placeholder `lorem ipsum` or obvious AI-generated microcopy ("Unleash the power of...")
- ❌ Stock photos, vector illustrations with hands holding screens
- ❌ Particles flottantes décoratives
- ❌ Parallax on more than the P&ID flow edges (and even there, it's a data animation, not parallax)

### Review-time check:
> *"Would this pattern appear in Bloomberg Terminal, SIMATIC WinCC, Linear, or Figma? No → banned."*

---

## 10. Deps delta (what we add, what we don't)

**Nothing mandatory to install.** Inter + JetBrains Mono are already loaded from Google Fonts in `index.html`.

**Optional upgrade paths (decide at implementation, not now):**

| Dep | Size | Reason to add | Reason to skip |
|---|---|---|---|
| `@fontsource-variable/inter` | ~300kB | self-hosted fonts, offline demo | works fine from Google CDN |
| `@fontsource-variable/jetbrains-mono` | ~200kB | same | same |
| `@fontsource-variable/archivo` | ~250kB | heavier display weight if Inter 900 looks thin at 64px | we haven't hit that need yet |

**Explicitly NOT adding:** gsap, lenis, @studio-freight/lenis, split-text, three, @react-three/*, shadcn components, radix-ui/themes, mantine, chakra.

---

## 11. Rollout plan (what I'd build, in this order)

This plan is **not** the implementation. It's the visual law that guides M6.3 → M9. Adopting it means:

### Immediately (same PR #66 as foundation + affûtage):
1. Tighten `Icons` wrapper to force stroke-width 1.5
2. Add `SectionHeader`, `MetaStrip`, `Hairline`, `StatusRail` primitives
3. Add `rail` prop to `Card`
4. Change `Tabs` selected visual to 2px bottom rail
5. Refactor `DesignPage` to showcase all new primitives + the typography scale in context

### Later (M6.3 App shell and beyond):
- Topbar uses SectionHeader/MetaStrip pattern (mono uppercase left, real metadata right)
- Compose everything with the compartment / hairline / rail language

### Not now:
- Fonts self-hosted (skip unless latency in demo is visible)
- Archivo display font (skip unless Inter 900 fails at 64px)
- Scanline overlay on thinking inspector (lands in M8.5, not M6.2)
- Favicon rendering from AriaMark SVG (lands when the app shell is built)

---

## 12. Validation checklist (Adam's call before I touch a single line)

- [ ] Direction artistique validée (§1)
- [ ] Palette finale acceptée (§2)
- [ ] Type scale + tracking rules acceptées (§3)
- [ ] Grid & radius discipline acceptées (§4)
- [ ] Les 6 signatures (§5) sont OK
- [ ] Anti-patterns list (§9) acceptée comme contraignante pour review
- [ ] Ordre de rollout (§11 Immediately) OK pour être dans PR #66
- [ ] Rien de critique manquant ?

→ Validate by replying **"go DESIGN_PLAN"** (I'll implement the Immediately list).
→ Reject a section by naming it explicitly ("§5.5 scanlines: no", "§3 type scale too big", etc).
→ Want additions (micro-pattern, reference, rule) → tell me, I'll amend the plan and you re-validate.
