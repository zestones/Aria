# Architecture Decisions

> [!NOTE]
> This document captures the non-obvious choices made during the hackathon — the ones where the "obvious" alternative was considered, tried, or initially shipped before being replaced. Each entry records the decision, the alternatives weighed, the trigger that forced the choice, and the consequences. Read this to understand *why* the codebase looks the way it does.

---

## Two paths: Messages API vs Managed Agents

**Decision.** The Investigator runs on Anthropic Managed Agents (M5.5). The Q&A agent runs on the Messages API. Sentinel, Work Order Generator, and KB Builder run on the Messages API. The Investigator's Messages-API implementation is kept behind `INVESTIGATOR_USE_MANAGED=False` as a 5-minute rollback path.

**Alternatives considered.**

- *Q&A on Managed Agents (originally shipped in M5.4).* Removed. Interactive sub-second turns fight the platform's `agent.message`-block grain — there is no token-level streaming, only block-level, which would have required artificial chunking on the backend to satisfy the chat `text_delta` contract.
- *Investigator on Messages API only (the M4 baseline).* Works, but loses three differentiation features the platform uniquely enables: built-in conversation compaction, persistent session ids that survive across requests, and the in-sandbox bash + Python environment for quantitative diagnostics.
- *Both on Managed Agents.* Rejected for the same reason as Q&A above.

**Trigger.** [docs/audits/M5-managed-agents-refactor-audit.md](../audits/M5-managed-agents-refactor-audit.md) explicitly framed the question: which agent is the right Managed-Agents target? The audit's answer — the long-running, tool-heavy, asynchronous one — drove the M5.5 pivot.

**Consequences.**

- The 414-line Q&A Managed-Agents implementation was deleted in M5.5.
- The Investigator gained `agents/investigator/managed/` (575 LOC across 5 files) and migration 009 added `work_order.investigator_session_id`.
- Hosted MCP became part of the production deployment surface, requiring the Cloudflare tunnel and the path-secret URL.
- Two Investigator entry points (Messages API and Managed Agents) co-exist with the same external contract, which lets us compare cost and latency in real time.

---

## Path-secret URL as the MCP auth mechanism

**Decision.** The MCP HTTP mount is at `/mcp/<aria_mcp_path_secret>` rather than `/mcp`. There is no per-request auth on the mount.

**Alternatives considered.**

- *Custom HTTP header (e.g. `X-MCP-Token`).* Rejected — the Anthropic Managed Agents `mcp_servers` config does not support custom headers.
- *OAuth + Anthropic vault integration.* Rejected for hackathon scope. The full OAuth flow plus vault provisioning is several days of work and adds zero demo value.
- *No auth (mount at `/mcp`).* Rejected — anyone with the public Cloudflare URL would have unauthenticated read+write access to the database via the MCP write tool.

**Trigger.** Plugging hosted MCP into Managed Agents during M5.5 made the auth question urgent.

**Consequences.**

- The path secret is generated with `openssl rand -hex 32` and stored in `.env` only. It is shared between `aria_mcp_url` (loopback) and `aria_mcp_public_url` (Cloudflare tunnel).
- All MCP traffic, internal and external, goes through the same secret-bearing URL. Rotating the secret rotates both transports atomically.
- The mount lives in [backend/main.py](../../backend/main.py) — `app.mount(f"/mcp/{settings.aria_mcp_path_secret}", mcp_http_app)`.

---

## Safety nets on every agent loop

**Decision.** Every long-running agent body (Sentinel tick, Investigator run, Work Order Generator run, Q&A turn) is wrapped in `asyncio.wait_for(body, timeout=N)` plus an outer `try/except Exception`, with a graceful-degradation DB update on failure.

**Alternatives considered.**

- *No timeout, no outer try.* The M4 audit flagged this as the highest-risk gap before any agent code shipped. A hung tool call would have left work orders stuck in `status='detected'` and the Sentinel loop unable to make progress.
- *Per-tool-call timeout instead of per-run timeout.* Insufficient — the failure mode is the agent loop accumulating turns, not a single tool call hanging.

**Trigger.** [docs/audits/M4-M5-sentinel-investigator-workorder-qa-audit.md §4](../audits/M4-M5-sentinel-investigator-workorder-qa-audit.md) "Missing guard-rails".

**Consequences.**

- Investigator: `MAX_TURNS=12`, `_TIMEOUT_SECONDS=120`, on timeout sets `rca_summary='Investigation timed out'` (status stays at `detected`).
- Work Order Generator: `MAX_TURNS=6`, `_TIMEOUT_SECONDS=60`, on timeout leaves the WO at `status='analyzed'` so the operator can hit Regenerate.
- Q&A: per-turn safe-send on every WS write so a dropped client cannot tear down the agent loop mid-turn.
- Sentinel: per-cell try/except inside the tick body so one bad cell never breaks the rest.

---

## Extended thinking — signed block preservation

**Decision.** The Investigator's `_llm_call` reconstructs the next turn's assistant message from `final_message.content` rather than from `text_delta` accumulation. This preserves Anthropic's signed `thinking` block verbatim across turns.

**Alternatives considered.**

- *Reconstruct the assistant turn from streamed `text_delta` chunks.* Returns `400 thinking block signature invalid` on the next turn. The signed block is not part of the streamed text — it is a separate content block in `final_message.content`.
- *Disable extended thinking.* Loses the operator-visible reasoning trace that is one of the demo's strongest moments.

**Trigger.** First end-to-end test of the Investigator after enabling `thinking={enabled, 10000}`.

**Consequences.**

- The `_llm_call` helper returns the full `final_message` and the agent-loop appends `{"role": "assistant", "content": final_message.content}` directly. No reconstruction, no chunking.
- `thinking_delta` events are still streamed live to the events bus for UI rendering — the live stream and the message-history block are two separate concerns.
- This is the most important single line of code in [backend/agents/investigator/service.py](../../backend/agents/investigator/service.py).

---

## Dropping `render_correlation_matrix`

**Decision.** The originally planned `render_correlation_matrix` generative-UI tool was removed from `INVESTIGATOR_RENDER_TOOLS` before M4 shipped.

**Alternatives considered.**

- *Ship the tool, let the LLM compute correlation matrices.* Rejected. No MCP tool computes correlations — the LLM would synthesise plausible-looking but fabricated numbers, which is fatal in a predictive-maintenance pitch.
- *Add an MCP `compute_correlation_matrix` tool.* Out of scope for M4. The signal-correlation use case did not earn its own backend route within the milestone budget.

**Trigger.** [docs/audits/M2-mcp-server-audit.md](../audits/M2-mcp-server-audit.md) flagged the data-source mismatch during the pre-implementation review of the render tool family.

**Consequences.**

- Investigator's render tool surface is the three trustworthy ones: `render_signal_chart`, `render_diagnostic_card`, `render_pattern_match`.
- Future addition of correlation requires the round trip: add an MCP tool that computes from real samples first, then expose the render tool.

---

## Token-budget hardening: breach windows and trend caps

**Decision.** `get_signal_anomalies` returns aggregated breach windows, not per-sample rows. `get_signal_trends` enforces a hard 500-row cap.

**Alternatives considered.**

- *Per-sample rows with an LLM-side instruction to summarise.* Returned 575k tokens in a single tool result during the first hosted-MCP run, overflowing the 200k context window mid-call.
- *Lower per-tool token cap configured on Managed Agents.* The platform's own compaction works at conversation grain, not tool-result grain. The fix had to be on our side.

**Trigger.** [docs/audits/M5.5-end-to-end-test-report.md §4](../audits/M5.5-end-to-end-test-report.md) "Token overflow resolved".

**Consequences.**

- The same query on the same data now returns ~28 windows / ~2 400 tokens — a 240x reduction.
- `get_signal_trends` truncated responses include `{"_truncated": true, "hint": "..."}` so the LLM can self-correct by narrowing its window.
- Both fixes apply to the Messages-API path too — the change improved Investigator latency and cost on the existing path even though the trigger was the hosted path.

---

## Hosted-MCP wiring quirks: `permission_policy` and `mcp_toolset`

**Decision.** The bootstrap of every Managed Agents session sets `default_config.permission_policy = "always_allow"` and includes `{"type": "mcp_toolset", "mcp_server_name": "aria"}` in the `tools` array.

**Trigger.** First end-to-end run of the Managed Investigator hung indefinitely. Second run returned `400 mcp_servers declared but no mcp_toolset references them`.

**Consequences.**

- `permission_policy` defaults to `always_ask`, which pauses the agent waiting for a human approval that never arrives. `always_allow` is the only autonomous mode.
- The `mcp_toolset` entry is the explicit link between the declared MCP server and the agent's tool surface. Without it the platform refuses to start.
- The hosted-MCP tool ids (`sevt_*`) appear in `requires_action.event_ids` but must *not* be dispatched as custom tools — the dispatcher in [backend/agents/investigator/managed/tool_dispatch.py](../../backend/agents/investigator/managed/tool_dispatch.py) silently skips them.

---

## `additionalProperties` stripping for Managed Agents

**Decision.** [backend/agents/investigator/managed/bootstrap.py](../../backend/agents/investigator/managed/bootstrap.py) walks every custom tool input schema and removes any `additionalProperties` field before submitting the agent definition.

**Trigger.** Managed Agents rejects schemas containing `additionalProperties` even at false. The Messages API tolerates the same field.

**Consequences.**

- The schema strip is recursive — it covers nested objects.
- The same Pydantic-generated schemas are used unchanged on the Messages-API path.
- A future Anthropic SDK update that supports `additionalProperties` is a simple flip — remove the strip call.

---

## FastMCP envelope unwrapping

**Decision.** [backend/aria_mcp/client.py](../../backend/aria_mcp/client.py) recursively unwraps the `structured_content` envelope FastMCP wraps around `list[dict]` returns.

**Trigger.** Sentinel's first tick treated `[{"result": [{"signal_def_id": ...}]}]` as a list of breaches with one entry, then tried to subscript `breach["signal_def_id"]` on the wrapper dict and crashed.

**Consequences.**

- Callers see the native shape — `list[dict]` is `list[dict]`, not `{"result": list[dict]}`.
- The unwrap is recursive so deeply-nested return shapes are normalised.
- The MCP SDK update that removes the wrapping entirely is a single-line removal of the unwrap helper.

---

## Contract discipline: frontend types are the source of truth

**Decision.** Backend WebSocket payloads conform verbatim to `EventBusMap` and `ChatMap` in [frontend/src/lib/ws.types.ts](../../frontend/src/lib/ws.types.ts). When a contract changes, the frontend types are updated first and the backend is checked against them.

**Alternatives considered.**

- *Generate frontend types from backend Pydantic.* Tooling overhead too high for hackathon timeline; would have required Pydantic-to-TypeScript codegen plumbing.
- *Backend defines the contract, frontend follows.* Rejected because the consumer (frontend) has stricter requirements (exhaustive switch on type unions) than the producer.

**Trigger.** Repeated minor drifts during M4 (`from` vs `from_agent`, `parts_required` vs `required_parts`) caught at integration rather than at code review.

**Consequences.**

- Field naming on the chat socket (`from`/`to`) deliberately differs from the events bus (`from_agent`/`to_agent`). The asymmetry is documented and intentional.
- Issue #125 (sub-agent `agent_start`/`agent_end` mirroring on the chat socket) was a pure backend fix because the frontend `ChatMap` already supported the frame.

---

## Memory injection in the Investigator system prompt

**Decision.** Recent `failure_history` rows for the affected cell are loaded once at the start of every Investigator run and pasted into the system prompt as a "previously seen failure modes" block. They are *not* exposed as a tool call.

**Alternatives considered.**

- *`get_failure_history` MCP tool exposed to the LLM.* The tool exists (and is exposed), but the system-prompt injection guarantees the memory is *seen* on every run regardless of whether the LLM thinks to query it.
- *Vector search over historical failures.* Out of scope — the demo cell has at most a handful of failures, exact-match by `cell_id` is sufficient.

**Trigger.** The "knowledge does not retire with the senior technician" demo moment requires the Investigator to *spontaneously* recognise a recurring pattern, not be asked to look it up.

**Consequences.**

- Zero extra turns and zero tool dispatch overhead.
- The reasoning trace ("I noticed this matches failure mode #4 from January") is a strong demo moment.
- The system prompt grows with cell history. For the demo's 1-2 historical failures this is a non-issue; a production deployment would cap the injected window.

---

## Where to next

- The README index: [README.md](./README.md).
- The data layer: [01-data-layer.md](./01-data-layer.md).
- The MCP server: [02-mcp-server.md](./02-mcp-server.md).
- The KB Builder: [03-kb-builder.md](./03-kb-builder.md).
- Sentinel and Investigator: [04-sentinel-investigator.md](./04-sentinel-investigator.md).
- Work Order Generator and Q&A: [05-workorder-qa.md](./05-workorder-qa.md).
- Cross-cutting concerns: [cross-cutting.md](./cross-cutting.md).
