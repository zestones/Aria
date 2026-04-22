# ARIA — Project Instructions for Claude agents

Read this file **in full** before proposing any change or touching any file.

---

## Project context

- **Hackathon:** "Built with Opus 4.7", deadline **2026-04-26 20:00 EST** (Sunday).
- **Team:** 2 devs working in parallel.
  - **@vgtray** (Adam) — frontend lane (milestones M6 → M10).
  - **@zestones** (Idriss) — backend lane (milestones M1 → M5).
  - Shared on M10 (submission).
- **Stack:** React 19.2, TS 5.9, Tailwind v4, Vite 7, framer-motion, TanStack Query, Biome · FastAPI, asyncpg, TimescaleDB, Anthropic SDK (Opus 4.7), FastMCP · Docker Compose.
- **Pitch:** Agentic predictive-maintenance platform for water-treatment plants. Five agents (KB Builder, Sentinel, Investigator, Work Order Generator, Q&A) consume telemetry + a structured Knowledge Base, detect anomalies, run RCA with Opus 4.7 extended thinking, and emit generative-UI artifacts into the operator chat.
- **Prize targets:** Best Managed Agents \$5k · Best Use of Opus 4.7 (extended thinking) · top-3 global.

---

## MANDATORY reading order before acting

1. **`docs/planning/ROADMAP.md`** — 5-day timeline, critical path, parallelization rules.
2. **`idea.md`** — product vision, 5-scene demo flow, scoring criteria.
3. **`docs/planning/M<N>-*/issues.md`** for the milestone you'll touch (M1 data, M2 MCP, M3 KB Builder, M4 Sentinel+Investigator, M5 WO+Q&A, M6 Frontend foundation, M7 Control room, M8 Agentic workspace, M9 Polish & E2E, M10 Submission).
4. **`frontend/docs/DESIGN_PLAN.md`** — visual law. **§9 Anti-patterns is armed** — any PR introducing banned patterns must be flagged immediately.
5. **Live state:** `gh pr list` and the GitHub Project board (#28) at `https://github.com/users/zestones/projects/28`. Never assume state — check.
6. **Prior scope-creep lesson:** `~/.claude/brain/lessons/2026-04-21-aria-landing.md` — a previous round on this same project lost a day to design scope-creep. Do not repeat.

If the user gives you an issue number, `gh issue view <N>` **first** so the scope is read directly from the source, not inferred.

---

## Workflow — one issue, one branch, one PR

1. **Check out `main` and pull** — `git checkout main && git pull --rebase`.
2. **Branch name** — `<type>/<issue-number>-<kebab-description>` (e.g. `feat/36-app-shell`, `fix/41-kpi-sparkline-null`). Types: `feat` / `fix` / `chore` / `refactor` / `docs` / `test`.
3. **Move the issue to 🏗 In progress on the board** (see automation below) at start.
4. **Commits** — Conventional Commits, English, imperative mood. Scope `(frontend)` or `(backend)` or feature. **Never add `Co-Authored-By: Claude`** (persistent user preference, see `~/.claude/projects/-Users-adam-Documents-Projets-ARIA/memory/feedback_no_claude_coauthor.md`).
5. **Push and open PR** — `gh pr create --title "..." --body "...Closes #N"`. Body must include `## Summary` + `## Test plan`.
6. **Move the issue to 👀 In review** on the board after pushing the PR.
7. **Do NOT merge the PR yourself.** The user merges with squash + delete branch.
8. **Never `git push --force`** unless the user explicitly authorizes it — the sandbox blocks it anyway, and rewriting shared branch history is fragile.

### If deps change in a PR
After pulling a branch that updated `frontend/package.json`, sync the container volume:
```bash
docker compose exec frontend npm install && docker compose restart frontend
```
The dev server uses a named Docker volume for `node_modules` that does **not** pick up host changes automatically.

---

## Board automation (chef responsibility)

The GitHub Project v2 is `#28` owned by `zestones`. When chef starts/finishes work on an issue, update the `Status` field via GraphQL:

```
ProjectID:           PVT_kwHOBICTv84BVSYT
Status field ID:     PVTSSF_lAHOBICTv84BVSYTzhQvN0I
Options:
  🆕 New          e2937c4f
  📋 Backlog      e733aaf6
  🔖 Ready        75c70f3e
  🏗 In progress  4db47a6c
  👀 In review    48bea360
  ✅ Done         81ce74c2   (auto when PR merges via "Closes #N")
```

Get the issue item ID with:
```bash
gh api graphql -f query='query { repository(owner:"zestones",name:"ARIA"){ issue(number:<N>){ projectItems(first:1){ nodes { id } } } } }'
```

Then mutate:
```bash
gh api graphql -f query='
mutation { updateProjectV2ItemFieldValue(input: {
  projectId: "PVT_kwHOBICTv84BVSYT"
  itemId: "<ITEM_ID>"
  fieldId: "PVTSSF_lAHOBICTv84BVSYTzhQvN0I"
  value: { singleSelectOptionId: "<OPTION_ID>" }
}) { projectV2Item { id } } }'
```

Move to **In progress** at start, **In review** after `gh pr create` succeeds. `Done` transitions automatically when the PR merges if the body includes `Closes #<N>`.

---

## Quality gates (before opening any PR)

All three must be green from `frontend/`:
- `npm run typecheck` (runs `tsc -b --noEmit`)
- `npm run build` (runs `tsc -b && vite build`)
- `npm run check` (Biome lint + format)

Backend gates are zestones' responsibility, but PRs touching `backend/` also need `black --check`, `flake8`, `pyright`, `pytest` green — the CI runs all of them.

---

## Design discipline (frontend-touching PRs)

Before any change under `frontend/src/`, re-read `frontend/docs/DESIGN_PLAN.md`. Specifically:

- **§2 palette is locked** — no new colors, no gradients.
- **§3 type scale is capped at 64px** — we're an app, not a landing. No `clamp(4rem, 15vw, …)`.
- **§5 signatures** — always prefer `SectionHeader`, `MetaStrip`, `Hairline`, `StatusRail` primitives over inventing ad-hoc markup.
- **§7 icons** — lucide icons are stroke-width 1.5 by default via the wrapper in `frontend/src/design-system/icons.tsx`. Don't re-import from `lucide-react` directly.
- **§9 anti-patterns** — enforced. Every item on that list is a blocker, not a suggestion.

No new dependencies without a §10 justification in the PR description. Especially no `gsap`, `lenis`, `@studio-freight/*`, `three`, `@react-three/*`, `shadcn`, `@radix-ui/themes`, `mantine`.

---

## Interface contract (frontend ↔ backend)

The WebSocket event schema is frozen in `docs/planning/M4-sentinel-investigator/issues.md` §M4.1 (events table). Two endpoints:
- `WS /api/v1/events` — global broadcast (anomalies, tool calls, handoffs, thinking delta, ui_render, rca_ready, work_order_ready).
- `WS /api/v1/agent/chat` — Q&A stateful stream.

Generative-UI `render_*` tools are declared in `docs/planning/M2-mcp-server/issues.md` §M2.9. Nine components the frontend must register.

If either side needs to change the contract, **open a discussion before touching code** — both tracks depend on the contract being stable.

---

## What chef never does

- Modify files under `backend/` or `simulator/` — that's zestones' lane.
- Edit files across both lanes in the same PR.
- Merge a PR (the user merges).
- Force-push a branch.
- Auto-create a commit on `main` directly.
- Introduce deps without design-plan justification.
- Invent design tokens — they all live in `frontend/src/design-system/tokens.css`.
- Skip quality gates.

---

## Current state at resume time

**Do not trust this section blindly — verify with `gh pr list` and `git log origin/main -10`.** It's a pointer, not a source of truth.

- **Open PRs to land** (as of 2026-04-22 PM): `#66` (M6.2 design system + identity) on `feat/35-design-system`, `#65` (M2.1 FastMCP) on zestones side.
- **Next frontend issue if #66 merges:** `#36 M6.3 App shell` (topbar + control room area + chat drawer resizable).
- **`main` has:** M1 data layer entire + M6.1 UI deps installed.

---

## Last resort: who to ask

- If a technical decision isn't clear: check `docs/planning/M*/issues.md` — most decisions are marked `✅ DÉCIDÉ` with justification.
- If design-related: `frontend/docs/DESIGN_PLAN.md`.
- If it's about user preferences: `~/.claude/projects/-Users-adam-Documents-Projets-ARIA/memory/`.
- If nothing documented: **ask Adam**. Don't guess.
