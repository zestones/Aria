# ARIA Documentation

> Full index of every document in this repository. The architecture chapters are the canonical source for *how* the system is built; audits explain *why* a contract has the shape it does; planning notes capture *what was scoped, considered, and dropped* during the hackathon. Demo and hackathon material live alongside for completeness.

For the project pitch, the rubric, and the three-minute demo storyline, jump to the [PRD](./ARIA_PRD.md). For the running system, the [main README](../README.md) has the quickstart.

---

## Getting started

- [Project README](../README.md) — what ARIA is, quickstart, stack, daily make targets.
- [Product Requirements Document](./ARIA_PRD.md) — the problem, the rubric, the three-minute demo storyline.
- [Roadmap](./planning/ROADMAP.md) — milestone-by-milestone delivery plan.

---

## Architecture and reference

The architecture chapters are written so the executive summary plus the topology diagram of each one is enough to understand the system end to end without reading code.

> **[Architecture index →](./architecture/README.md)**

### Foundation

- [Data layer](./architecture/01-data-layer.md) — agent-facing JSONB columns, Pydantic mirrors, the integrity guards behind every write.
- [MCP server](./architecture/02-mcp-server.md) — the 14 read tools and 1 write tool that are the agents' only path to data.

### Agents

- [KB Builder](./architecture/03-kb-builder.md) — PDF vision extraction and the four-question onboarding dialogue that hybridises manual and operator knowledge.
- [Sentinel and Investigator](./architecture/04-sentinel-investigator.md) — 30-second breach detection plus the RCA loop with extended thinking and the failure-history memory.
- [Work Order Generator and Q&A](./architecture/05-workorder-qa.md) — structured work order output and the operator chat with agent-as-tool handoffs.
- [Forecast-watch](./architecture/06-forecast-watch.md) — predictive alerting before threshold crossings, plus server-side enrichment of the `render_pattern_match` artifact.
- [Managed Agents](./architecture/07-managed-agents.md) — hosted agent loop, hosted MCP, hosted session memory, sandboxed Python container.

### Operational data

- [Simulators](./architecture/08-simulators.md) — Markov state machine, composable signal behaviors, scenario-as-configuration, demo vs realtime modes.
- [Operational data and KPIs](./architecture/09-kpi-and-telemetry.md) — TimescaleDB hypertables and OEE / MTBF / MTTR / downtime / quality math.

### Cross-cutting

- [Cross-cutting concerns](./architecture/cross-cutting.md) — WebSocket frame catalogue, auth, ContextVar-driven turn ids, shared helpers.
- [Architecture decisions](./architecture/decisions.md) — the non-obvious choices and why they were made.

---

## Audits

Pre- and post-implementation technical reviews. Each audit was written before merging the corresponding milestone and re-read after to confirm the shipped code matched the intent. Read these to understand *why* a contract has the shape it does — every quirk in the codebase has a paragraph in one of these documents.

- [M2 — MCP Server audit](./audits/M2-mcp-server-audit.md) — review of the 14-tool surface against M3-M5 consumers.
- [M3 — KB Builder audit](./audits/M3-kb-builder-audit.md) — PDF extraction shape, onboarding dialogue, threshold-key integrity.
- [M4-M5 — Sentinel / Investigator / Work Order / Q&A audit](./audits/M4-M5-sentinel-investigator-workorder-qa-audit.md) — pre-implementation review of the agent-loop safety nets and contract.
- [M4-M5 — Per-issue context pass](./audits/M4-M5-issue-context-pass.md) — issue-level cross-pass against the codebase.
- [M5 — Managed Agents refactor audit](./audits/M5-managed-agents-refactor-audit.md) — the audit that drove the M5.4 → M5.5 pivot from Q&A to Investigator on Managed Agents.
- [M5.5 — End-to-end test report](./audits/M5.5-end-to-end-test-report.md) — full live-test report with the seven cascade fixes that landed during the migration.
- [M9 — Frontend pre-demo audit](./audits/M9-frontend-pre-demo-audit.md) — final-stretch review of the operator UI against the demo storyline.

---

## Planning

The hackathon was sliced into milestones M1 through M10. Each milestone has an `issues.md` capturing the scope as filed on the project board; M9 has supplementary design and strategy docs because that milestone fanned out across several concerns.

### Roadmap

- [Roadmap](./planning/ROADMAP.md) — the master view: what ships in each milestone, what depends on what.

### Milestone scopes

- [M1 — Data layer](./planning/M1-data-layer/issues.md) — schema and Pydantic mirrors.
- [M2 — MCP server](./planning/M2-mcp-server/issues.md) — the 14-tool catalogue.
- [M3 — KB Builder](./planning/M3-kb-builder/issues.md) — PDF onboarding agent.
- [M4 — Sentinel + Investigator](./planning/M4-sentinel-investigator/issues.md) — anomaly detection and RCA loop.
- [M5 — Work Order + Q&A](./planning/M5-workorder-qa/issues.md) — work order generation and operator chat.
- [M5.5 — Managed Agents refactor](./planning/M5-workorder-qa/managed-agents-refactor-issues.md) — the post-M5 pivot to hosted infrastructure.
- [M6 — Frontend foundation](./planning/M6-frontend-foundation/issues.md) — design system and app shell.
- [M7 — Control Room and backend wire](./planning/M7-control-room/issues.md) — animated P&ID, KPI surfaces, chat wiring.
- [M8 — Agentic Workspace](./planning/M8-agentic-workspace/issues.md) — the nine generative-UI artifacts.
- [M9 — Polish and E2E](./planning/M9-polish-e2e/issues.md) — final-stretch demo polish.
- [M10 — Submission](./planning/M10-submission/issues.md) — submission package and deadline checklist.

### M9 — strategic and design notes

- [Win plan (J-2 battle plan)](./planning/M9-polish-e2e/win-plan-48h.md) — strategic audit and prioritisation 48 hours before submission.
- [Demo build spec](./planning/M9-polish-e2e/demo-build-spec.md) — authoritative storyboard and technical contracts for the three-minute video.
- [Demo plant design](./planning/M9-polish-e2e/demo-plant-design.md) — the bottled-water line scenario, machine-by-machine.
- [Demo seed content](./planning/M9-polish-e2e/demo-seed-content.md) — KB blobs, human context, history rows seeded into the database.
- [Wow-factor ideas](./planning/M9-polish-e2e/wow-factor-ideas.md) — visual moments shortlisted for the demo.
- [Competitive analysis vs CrossBeam](./planning/M9-polish-e2e/competitive-analysis-vs-crossbeam.md) — comparison against the previous hackathon winner.

---

## Demo

- [Demo submission checklist](./demo/DEMO.md) — the living checklist for the submission package.
- [Demo script (v6)](./demo/SCRIPT.md) — voice-over and storyboard for the three-minute video.

---

## Frontend

- [Design system](./frontend/DESIGN.md) — visual language, motion grammar, component tokens.

---

## Hackathon reference

- [Hackathon overview](./hackathon/README.md) — the *Built with Opus 4.7* event description.
- [Participant rules and resources](./hackathon/rules.md) — submission rules, Discord, judging criteria.

---

## Where to read first

| If you are                            | Read in this order                                                                                                                                                             |
|---------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| New to the project                    | [Main README](../README.md) → [PRD](./ARIA_PRD.md) → [Architecture index](./architecture/README.md)                                                                            |
| Tracing "anomaly to RCA" in code      | [Data layer](./architecture/01-data-layer.md) → [MCP server](./architecture/02-mcp-server.md) → [Sentinel and Investigator](./architecture/04-sentinel-investigator.md)        |
| Working on the operator UI            | [Cross-cutting concerns](./architecture/cross-cutting.md) → [Frontend design system](./frontend/DESIGN.md)                                                                     |
| Adding a new MCP tool                 | [MCP server](./architecture/02-mcp-server.md) → [Architecture decisions](./architecture/decisions.md)                                                                          |
| Adding a new agent                    | [Sentinel and Investigator](./architecture/04-sentinel-investigator.md) → [Architecture decisions](./architecture/decisions.md)                                                |
| Understanding the Managed Agents path | [Managed Agents](./architecture/07-managed-agents.md) → [M5 audit](./audits/M5-managed-agents-refactor-audit.md) → [M5.5 test report](./audits/M5.5-end-to-end-test-report.md) |
| Modifying simulator scenarios or KPIs | [Simulators](./architecture/08-simulators.md) → [Operational data and KPIs](./architecture/09-kpi-and-telemetry.md)                                                            |
| Preparing or reviewing the demo       | [Demo checklist](./demo/DEMO.md) → [Demo script](./demo/SCRIPT.md) → [Demo build spec](./planning/M9-polish-e2e/demo-build-spec.md)                                            |
