# M5 — Managed Agents Refactor — Technical Audit

> **Scope.** Review the current Managed Agents integration (M5.4 — `agents.qa.managed`) against the Anthropic Managed Agents product intent and the hackathon prize rubric, and decide what to do for Q&A and Investigator before the April 26th submission deadline. Read-only audit — code changes are scheduled in a separate issue.

> [!NOTE]
> **Revision — 2026-04-23.** Open questions in §7 cross-checked against the [Managed Agents docs](https://platform.claude.com/docs/en/managed-agents/overview) and the current code. Two of the answers change the implementation plan: thinking deltas do **not** exist on `sessions.events.stream` (§4 probe is moot — use `agent.thinking` block events), and the hosted MCP config does **not** support custom `Authorization` headers (§3 auth plan switched to path-secret URL). LOC counts, line-number refs, and `INVESTIGATOR_RENDER_TOOLS` count corrected.

---

## 0. Executive summary

> [!WARNING]
> **Verdict: the current Managed Agents integration works but is plumbed onto the wrong agent and bypasses the platform's two headline mechanisms (hosted MCP + cloud container). As written it ships, but it will not win the "Best Managed Agents" $5k.**

| Dimension                              | Today                                                                    | After refactor                                            |
|----------------------------------------|--------------------------------------------------------------------------|-----------------------------------------------------------|
| Managed Agents target                  | Q&A (interactive, sub-second, user watching)                             | Investigator (12 turns, 120 s, async background)          |
| MCP wiring                             | 14 tools wrapped as `custom` (round-trips via FastAPI)                   | Hosted MCP server registered on the agent (direct call)   |
| Tool dispatch code in our backend      | `_dispatch_custom_tool` for every MCP tool + render_* + ask_investigator | Only render_* + submit_rca + ask_kb_builder               |
| Agent-loop boilerplate (Investigator)  | ~140 lines (`_run_investigator_body` + `_dispatch_tool_uses`: 74 + 64)   | ~80 lines (event consumer + 3 custom tool handlers)       |
| Session persistence                    | Dies with the WebSocket (Q&A) / dies on submit_rca (Investigator)        | `session_id` persisted on `work_order` row                |
| Cloud container (`bash`, `web_fetch`)  | Unused                                                                   | Python signal diagnostics (trend / SPC / FFT / correlation) + datasheet lookups — optional, equipment-type agnostic |
| Streaming `thinking_delta` in frontend | Per-chunk deltas (M4.5)                                                  | Block-level via `agent.thinking` events (one frame/block) |

**What's strong in the current code.** Session-per-WebSocket with lazy bootstrap and a process-wide lock; correct event lifecycle (`agent.message` → buffer; `agent.custom_tool_use` → buffer by id; `session.status_idle` → branch on `stop_reason.type`); fallback flag (`use_managed_agents`) so the M5.2 path comes back in <5 min. Test coverage in [test_qa_agent_managed.py](backend/tests/unit/agents/test_qa_agent_managed.py) is solid.

**What's wrong.** The chosen agent (Q&A) does not match the platform's *"long-running, asynchronous, multi-turn"* target — the smoking gun is `_trickle_text` re-chunking coarse `agent.message` blocks into fake `text_delta` frames at 15 ms intervals to mimic the M5.2 token stream. We're fighting the platform's grain. Investigator is the natural target and migrating it deletes more code than it adds.

**Bottom line.** The current `agents.qa.managed` module reads like *"we did this because the prize requires one Managed Agent."* (Our own module docstring says exactly that.) The refactor flips the narrative to *"Managed Agents is used because it is the right tool for long-running tool-heavy investigations; Q&A stays on Messages API because it is the right tool for interactive streaming."* That is a defensible architecture story instead of a checkbox.

---

## 1. What Managed Agents actually provides

Restating the platform contract in concrete terms so the rest of the audit is grounded:

1. **Hosted agent loop.** Anthropic runs `for _turn in range(...)` server-side. We send `user.message` events and consume an event stream — no `messages: list` to maintain, no signed-thinking-block reconstruction, no wall-clock timeout to wrap.
2. **Hosted history.** Conversation state lives on `session_id`. Survives our process restart. **Checkpoints persist for 30 days after last activity** (per docs) — beyond that, history is retained but container state is not.
3. **Sandboxed cloud container.** 8 built-in tools ship in the `agent_toolset_20260401` toolset, all enabled by default: `bash`, `read`, `write`, `edit`, `glob`, `grep`, `web_search`, `web_fetch`. Execute inside Anthropic's container — no round-trip to our backend. **No separate `code_exec` tool — run Python/etc. via `bash`.**
4. **Hosted MCP.** Anthropic calls our `/mcp` endpoint directly when the agent invokes a tool — our FastAPI process is not in the loop for tool execution. **Auth model: OAuth-only via "vaults" referenced at session creation (`vault_ids=[...]`). Custom HTTP headers on the `mcp_servers` config are not documented as supported.**
5. **Custom tools (escape hatch).** When a tool needs our process (DB write, WebSocket broadcast), we expose it as `{"type": "custom", ...}` and Anthropic emits `requires_action` for us to dispatch.

Event types emitted on `sessions.events.stream` (per docs): `agent.message`, `agent.thinking`, `agent.tool_use`, `agent.tool_result`, `agent.mcp_tool_use`, `agent.mcp_tool_result`, `agent.custom_tool_use`, plus thread-context events (`agent.thread_context_compacted`, `agent.thread_message_sent`, `agent.thread_message_received`). **No per-chunk `thinking_delta`.** Thinking surfaces as whole `agent.thinking` events.

The platform value is in (1)–(4). Our current integration uses only (1) and (2), and only weakly because (2) is wasted on a per-WebSocket lifetime.

---

## 2. Q&A: leave on Messages API

> [!NOTE]
> **Decision: revert M5.4 to fallback-only or delete `agents.qa.managed` entirely.**

### Why Q&A is the wrong target

| Property                       | Managed Agents target                    | Q&A reality                                    |
|--------------------------------|------------------------------------------|------------------------------------------------|
| Turn duration                  | "Minutes or hours"                       | Sub-second; user watching the cursor blink     |
| Tool call count per turn       | Many                                     | Often zero (free-text answer)                  |
| Granularity Anthropic streams  | `agent.message` blocks (whole sentences) | We need token-by-token deltas for `text_delta` |
| Session benefit                | Re-open later, multi-day workflow        | Per-WebSocket, dies on disconnect              |
| Dependency on hosted MCP/cloud | High (that's the value)                  | Zero (Q&A only reads via tools)                |

### Symptoms in the current code

- `_TRICKLE_CHUNK = 30` + `_TRICKLE_DELAY_S = 0.015` in [managed.py](backend/agents/qa/managed.py) exists *only* to fake the M5.2 token stream from coarse `agent.message` blocks. The platform doesn't emit at finer granularity.
- Module docstring states: *"Eligibility for the Best Managed Agents $5k prize requires at least one agent in the hackathon to use the Managed Agents pattern."* Reads as a checkbox.
- The session is created lazily on first turn but `delete`d nowhere — minor leak, but symptomatic of "we don't actually want the persistence."

### What to do

1. **If keeping the module** (low effort): leave it gated on `use_managed_agents=False` and stop documenting it as a prize anchor. It then exists only as a fallback proof of integration.
2. **If deleting** (cleaner): drop `agents.qa.managed` (**414 LOC** today, not ~250 as previously estimated), `qa.schemas.build_custom_tools`, the `use_managed_agents` setting, and [test_qa_agent_managed.py](backend/tests/unit/agents/test_qa_agent_managed.py). Investigator becomes the sole Managed Agents anchor.

Recommendation: **delete**. The Investigator path provides better prize coverage and the dual maintenance burden is not worth it three days from submission. The 414-line deletion strengthens the net-LOC argument for the refactor.

---

## 3. Investigator: migrate to Managed Agents

> [!IMPORTANT]
> **Decision: migrate `agents.investigator.service:_run_investigator_body` to `sessions.events.stream`. Keep `submit_rca`, `ask_kb_builder`, and `render_*` as custom tools. Register the MCP server as hosted MCP.**

### Why Investigator fits the platform exactly

- `MAX_TURNS = 12` and `_TIMEOUT_SECONDS = 120.0` — exactly *"long-running… multiple tool calls"*.
- Already spawned as a background `asyncio.create_task` from Sentinel — async by design.
- Uses 14 read-only MCP tools — perfect hosted-MCP candidates (no auth, idempotent).
- Tool surface that genuinely needs our process is small: 1 terminal write (`submit_rca`), 1 handoff (`ask_kb_builder`), 3 generative-UI (`render_signal_chart`, `render_diagnostic_card`, `render_pattern_match`). Everything else can be hosted MCP.

### Code we delete

From [agents/investigator/service.py](backend/agents/investigator/service.py):

- The `for _turn in range(MAX_TURNS)` loop body (~60 lines).
- The `messages: list[dict[str, Any]]` accumulator + `[b.model_dump() for b in response.content]` reconstruction.
- `_llm_call` wrapper and the manual `thinking_delta` re-broadcast (Anthropic streams events directly).
- `asyncio.wait_for(..., timeout=_TIMEOUT_SECONDS)` — replaced by Managed Agents' `retries_exhausted` stop reason + a session-level deadline.
- Most of `_dispatch_tool_uses` — only the 3 custom tool branches survive.

Net: **~150 LOC removed, ~80 LOC added.** Smaller surface, less plumbing, fewer failure modes.

### Code we keep (and how it changes)

| Today                                              | After                                                                  |
|----------------------------------------------------|------------------------------------------------------------------------|
| `_handle_submit_rca` (DB write, handoff to WO Gen) | Same logic, called from `requires_action` dispatch on `submit_rca`     |
| `handoff.handle_ask_kb_builder`                    | Same logic, called from `requires_action` dispatch on `ask_kb_builder` |
| `_handle_render` for chart/cards                   | Same logic, called from `requires_action` dispatch on `render_*`       |
| Sentinel → `asyncio.create_task(run_investigator)` | Unchanged — entry point signature stays                                |
| `WorkOrderRepository.update_status('analyzed')`    | Plus: store `session_id` on the work_order row                         |

### Hosted MCP wiring

Required:

1. Tunnel `backend:8000/mcp` (e.g. `cloudflared tunnel --url http://localhost:8000`) and persist the tunnel URL in `.env` as `ARIA_MCP_PUBLIC_URL`.
2. In `_ensure_agent_and_env` (Investigator version), pass `mcp_servers=[{"type": "url", "name": "aria", "url": public_url}]` instead of duplicating MCP schemas via `build_custom_tools`.
3. Drop the MCP-tool branch in tool dispatch — only `render_*`, `submit_rca`, `ask_kb_builder` route through our backend.

> [!CAUTION]
> **Security — plan updated 2026-04-23.** Earlier draft of this audit proposed a FastAPI bearer-auth middleware on `/mcp`. **That is not implementable against the Managed Agents platform.** The `mcp_servers` config schema in the docs is minimal (`{"type": "url", "name": ..., "url": ...}`) and the docs explicitly state *"No auth tokens are provided at this stage."* Auth is **OAuth-only via vaults** (`vault_ids=[...]` at session creation). Custom HTTP headers are not a documented field.

**Revised mitigation — path-secret URL.** `/mcp` has zero auth today (flagged in [M2-mcp-server-audit.md](docs/audits/M2-mcp-server-audit.md)). Hosted MCP makes that a public endpoint. Two implementable paths:

| Option                                                                                                                                                               | Effort | Trade-off                                                             |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------|-----------------------------------------------------------------------|
| **Path-secret URL** (recommended) — generate a 32-byte token, mount the MCP app at `/mcp/<token>`, register that full URL with Anthropic. The URL **is** the secret. | 30 min | Token leaks = full unauth access. Rotate by remounting on a new path. |
| **OAuth + vault** — implement a minimal OAuth server on FastAPI, register a vault on the Anthropic side, reference `vault_ids` on the agent.                         | 1+ day | Correct per the platform, but overkill for a 4-day hackathon.         |

Pick option 1 for the demo. Store the secret as `ARIA_MCP_PATH_SECRET` in `.env`; derive the mount path in `main.py` (`app.mount(f"/mcp/{settings.aria_mcp_path_secret}", mcp_http_app)`). Do **not** log the full URL.

---

## 4. The one real loss: streaming `thinking_delta` — mitigated

Today [service.py:92-99](backend/agents/investigator/service.py#L92-L99) re-broadcasts each `thinking_delta` chunk to the WebSocket so the Agent Inspector (M8.5 / #49) renders the live reasoning trace.

> [!NOTE]
> **Answered 2026-04-23.** Earlier draft listed three options, ranked by preference, with "verify whether `thinking_delta` exists on the sessions stream" as option (1). **The docs answer this: it does not exist.** The events stream enumerates `agent.message`, `agent.thinking`, `agent.tool_use`, `agent.tool_result`, `agent.mcp_tool_use`, `agent.mcp_tool_result`, `agent.custom_tool_use`, and thread-context events — no per-chunk thinking variant. Option (1) is therefore skipped and option (2) promoted to the plan.

**The good news** framing from the previous draft overstated the loss. `agent.thinking` events **do** exist — thinking surfaces as whole blocks (one event per reasoning step), just not at sub-block granularity. The Inspector still gets a live reasoning trace; the only thing lost is the character-by-character fill animation.

**Plan (single option).** Map each `agent.thinking` event to one `EventBusMap.thinking_delta` WebSocket frame. Signature is identical to M4.5 (`{agent, content, turn_id}`) so the frontend needs zero changes. The Inspector updates once per reasoning block instead of once per token — fine for a 3-min demo, arguably more readable than a stream of 3-char fragments.

Do **not** turn extended thinking off on the migrated path — that was the "do not pick" fallback in the previous draft and remains so. Thinking is an M4.5 differentiator and costs nothing extra here.

---

## 5. Effort, sequencing, and rollback

### Effort

| Task                                                                                  | Estimate (rough)   |
|---------------------------------------------------------------------------------------|--------------------|
| ~~Probe `sessions.events.stream` for thinking deltas~~ **answered by docs — skipped** | ~~30 min~~ 0       |
| Write `agents.investigator.managed:run_investigator_managed` (mirror QAM)             | 3-4 h              |
| `cloudflared` tunnel + **path-secret URL mount** (no middleware)                      | 45 min             |
| Wire `mcp_servers=[{type,name,url}]` on the agent + drop MCP custom-tool branch       | 30 min             |
| Persist `session_id` on `work_order`; expose "Re-open investigation" route            | 1 h (backend only) |
| Tests (mirror `test_qa_agent_managed.py` shape, swap render_* → submit_rca)           | 2 h                |
| Delete `agents.qa.managed` (**414 LOC**) + tests + `use_managed_agents` setting       | 45 min             |
| **Total**                                                                             | **~1 working day** |

### Sequencing (so demo is never broken)

1. Land the `cloudflared` tunnel + **path-secret URL** mount first — independently testable, doesn't touch the agent. Verify the tunneled URL with a curl to a benign MCP tool.
2. Build `agents.investigator.managed` next to the existing service; gate behind `INVESTIGATOR_USE_MANAGED=False`.
3. Sentinel still calls `run_investigator` (M4.5). Add a one-line dispatcher inside `run_investigator` that branches on the flag.
4. Flip the flag locally, run an end-to-end P-02 scenario, compare against the M4.5 trace.
5. Once green, delete `agents.qa.managed` and bump `use_managed_agents` semantics to apply to Investigator only.
6. Demo day: flag on. If anything misbehaves, flag off — back to M4.5 in <5 min, zero data-shape impact (the `work_order` row is the only persisted artifact).

### Rollback contract

The `work_order` row shape is unchanged. The WebSocket frame contract (`anomaly_detected`, `agent_start`, `agent_end`, `ui_render`, `rca_ready`) is unchanged. The only new column is `work_order.investigator_session_id TEXT NULL` — backwards-compatible. Therefore a flag flip is the entire rollback.

---

## 6. Demo-day narrative (what changes in the pitch)

Today's pitch fragment for the M5.4 module *"we use Managed Agents for the Q&A chat"* is weak because the Q&A is interactive — the audience can't see anything Managed Agents specifically enabled.

After the refactor, the pitch becomes:

> *"When a threshold breaches, Sentinel hands the work order to an Investigator agent **running on Anthropic's Managed Agents infrastructure**. The agent uses our MCP server directly — Anthropic calls our endpoint without round-tripping through our backend. The session lives on Anthropic's side, so two days later an operator can re-open the same investigation and continue the conversation with full context. Our backend is a thin orchestrator; the agent loop, the conversation history, and the tool execution flow run in managed infrastructure."*

That maps directly to the prize blurb: *"the team that leveraged the Claude platform the best… meaningful, long-running tasks — not just a demo, but something you'd actually ship."*

---

## 6.5 Differentiation add-ons (recommended for the prize)

> [!IMPORTANT]
> **Why this section exists.** The migration in §2–§5 is *architecturally correct* but not *creative*. "We deleted 150 LOC of agent-loop plumbing" is a competence story, not a prize-winning story. Most submissions will look identical: long-running agent + hosted MCP + cloud container. To win *Best Managed Agents*, the demo needs **at least one capability that the platform uniquely enables and that nobody else will ship**. The two add-ons below are scoped to fit inside the remaining hackathon window and tie directly to the industrial-maintenance domain.

### Add-on A — Night-shift "Continue investigation"

**The capability.** When the Investigator finishes (`submit_rca` fires), the work order is left with `investigator_session_id` populated. An operator on a later shift opens the work order in the UI and clicks *"Continue investigation"*. We resume the **same Anthropic session** — full reasoning trace, full tool history, full mid-investigation context. The operator can ask *"why did you rule out the bearing?"* or *"what would you check next if the vibration spikes again tomorrow?"* and the agent answers from its own memory of what it tried, not from a static `rca_summary` text field.

**Why this is differentiated.** Architecturally impossible on Messages API: you'd have to replay the full message history (including signed thinking blocks) on every reopen and pay token cost for context that already lived server-side. Hosted sessions make it free.

**Demo line (10 s clip).** *"Day-shift operator triggers the investigation. We jump 8 hours — night-shift operator opens the same work order, asks 'why did you rule out the bearing?', and the agent answers from its own memory of what it tried earlier today."*

**Implementation sketch.**

| Layer    | Change                                                                                                                                                                                                                                                   |
|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| DB       | `investigator_session_id` already in scope (§5 migration). No new column.                                                                                                                                                                                |
| Backend  | New endpoint `POST /api/v1/work_order/{id}/continue_investigation` — opens a WS, resumes session via `sessions.events.stream(session_id)`, surfaces a `user.message` from operator input, streams events back as the existing `EventBusMap` frames.      |
| Frontend | *"Continue investigation"* button on the WO detail page when `investigator_session_id IS NOT NULL` and the checkpoint is within the 30-day TTL (see §7 risk #6). On click → open the existing Agent Inspector view, but seeded with the resumed session. |
| Tests    | Mirror `test_second_turn_reuses_cached_session` from [test_qa_agent_managed.py](backend/tests/unit/agents/test_qa_agent_managed.py) — second WS call hits `sessions.events.stream(<existing_id>)` instead of creating a new session.                     |

**Effort.** ~3 h — endpoint + button + one test. Reuses the entire WS frame contract; no new event types.

**Risk.** Tied to the 30-day checkpoint TTL (§7 risk #6). Pitch wording must say *"reopen until checkpoint expires"*, not *"reopen indefinitely"*. For the demo itself, the gap is minutes — not at risk.

### Add-on B — `bash` + Python for in-sandbox signal diagnostics

> [!NOTE]
> **Framing.** The ARIA schema is equipment-agnostic: `equipment.equipment_type` is a free string, thresholds are keyed by signal name, and the signal catalogue covers 13 types (vibration, temperature, pressure, flow, voltage, current, power, torque, speed, force, cycle_time, score, level) — any rotating, fluid, thermal, or electrical asset. The capability below is **"run Python diagnostics on raw signal data inside Anthropic's container,"** not "compute FFTs on pump bearings." FFT-on-vibration is one concrete instance; the same pattern applies to trend fits, rate-of-change, SPC control limits, cross-signal correlation, or degradation-to-end-of-life regression on any signal the equipment produces.

**The capability.** Investigator writes a short Python script inside the cloud container to compute something the model cannot compute in tokens. The script pulls raw signal data for the breach window, runs domain-appropriate math, and returns a conclusion with numerical evidence into `submit_rca`.

**What the agent can actually compute** (menu, not mandate):

| Signal type              | Diagnostic technique                                                  | Asset examples               |
|--------------------------|-----------------------------------------------------------------------|------------------------------|
| Any time-series          | Rolling mean / median, linear or exponential trend fit, rate-of-change | All equipment                |
| Any time-series          | SPC control limits (±3σ), CUSUM drift detection                       | All equipment                |
| Multi-signal             | Cross-correlation (e.g. current vs temperature rise)                  | Motors, compressors, HVAC    |
| Vibration / current      | FFT + spectral peak detection                                         | Rotating equipment, VFD-driven motors |
| Vibration on rolling kit | Bearing fault frequencies (BPFO/BPFI/BSF/FTF) if KB has geometry      | Pumps, fans, gearboxes with known bearing specs |
| Temperature / pressure   | Degradation fit → projected time-to-threshold                         | Heat exchangers, seals, filters |

The agent picks the technique based on the breached signal and the KB's `failure_patterns.signal_signature`. None of it is hardcoded in our backend.

**Why this is differentiated.** It is **diagnostic computation the model cannot do in tokens**. M4.5 with Messages API physically cannot offer it (no shell, no Python runtime). It is the textbook *"capability that didn't exist without the platform"*, and it matches a real industrial workflow — condition-monitoring and reliability engineers do this analysis by hand today, across every asset class.

**Demo scenario (concrete, because P-02 is what's seeded).** The current seed is a Grundfos centrifugal pump with vibration breaches in its failure-mode catalogue, so the demo reads: *"The agent suspects bearing wear. It writes a Python script in its sandbox, runs an FFT on the raw vibration signal, compares the dominant frequency against the bearing's outer-race fault frequency, and concludes outer-race spalling with 0.87 confidence. None of that math happens in tokens — it runs as actual Python in Anthropic's container."* If the demo equipment changes (e.g. we add a motor or heat exchanger cell before Friday), the script changes but the capability — and the pitch line — do not.

**Implementation sketch.**

| Layer       | Change                                                                                                                                                                                                                                                                                    |
|-------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Prompt      | Add a section to `INVESTIGATOR_SYSTEM`: *"For numerical anomalies, you may write Python in `bash` to compute trends, statistics, frequency content, or cross-correlations on raw signals. Numpy, scipy, and pandas are available."* + one worked-example block per technique family.      |
| Environment | When creating the environment, declare `pip` dependencies: `numpy`, `pandas`, `scipy`. Per docs, environments allow pre-installed packages.                                                                                                                                               |
| Data access | Either (a) `bash curl http://<tunnel>/api/v1/signal/{id}/csv?start=...&end=...` (path-secret auth as in §3), **or** (b) extend the MCP `get_signal_window` tool to return a CSV-formatted string the agent then writes to a file. Option (a) is simpler and avoids inflating MCP responses. |
| KB          | The `equipment_kb.failure_patterns[*].signal_signature` dict already keys by signal name — the agent reads geometry / thresholds / reference values directly from there. No schema change. For rotating kit you need n_balls / pitch_diameter / ball_diameter if FFT-to-BPFO is in scope; for thermal kit you need design temperature ranges; in all cases the agent fetches what it needs from the KB, we don't hardcode. |
| Tests       | Unit test: assert the prompt includes the diagnostic-computation guidance. Integration test: skip if `bash` tool not available in the test fake; the real check is the demo trace.                                                                                                         |

**Effort.** ~4 h — prompt update + environment dependencies + signal-CSV endpoint. The agent itself does the analysis — we don't write the analysis code.

**Risk.**

- The agent might fall back to *"I would compute a trend but I'm not sure how"* prose instead of actually running `bash`. Mitigation: explicit examples in the system prompt (at least two different techniques on two different signal types) and one test trace per asset class before the demo.
- `numpy`/`scipy` install latency on first container boot. Mitigation: declare in the environment config so it's pre-installed (per docs); measure cold-start (§7 item 4).
- The CSV-fetch endpoint is a new public surface. Reuse the same path-secret pattern as the MCP mount.

### Sequencing relative to §5

Both add-ons sit on top of the base migration:

1. Land the base migration (§5 sequence steps 1–6). Demo is now equivalent to M4.5 in capability but architecturally on Managed Agents.
2. **Add-on A first** — it reuses code already written (WS frame contract, session id persistence). 3 h, low risk.
3. **Add-on B second** — only if A landed cleanly and time permits. 4 h, demo-defining payoff.

If only one ships, ship **B**. The Python-in-container clip (on whatever diagnostic technique fits the demo cell) is the more memorable 30-second moment; A is more *"useful"* but less visually striking on stage.

---

## 7. Open questions / risks

1. ~~**Does `sessions.events.stream` expose `thinking_delta`?**~~ ✅ **Answered 2026-04-23 (docs).** No per-chunk thinking deltas on the sessions stream. Full event list: `agent.message`, `agent.thinking`, `agent.tool_use`, `agent.tool_result`, `agent.mcp_tool_use`, `agent.mcp_tool_result`, `agent.custom_tool_use`, plus thread-context events. `agent.thinking` is emitted per reasoning block — map each to one `thinking_delta` WS frame (see §4).
2. ~~**Does hosted MCP support per-request bearer auth headers?**~~ ❌ **Answered 2026-04-23 (docs).** Not supported. The `mcp_servers` config is `{"type": "url", "name": "...", "url": "..."}` only; the docs explicitly state *"No auth tokens are provided at this stage."* Auth is **OAuth-only via vaults** (`vault_ids=[...]` at session creation). Use path-secret URL (see §3) for the hackathon; revisit OAuth+vaults if the project continues post-hackathon.
3. **Cloud container usage (`bash`, `web_fetch`)** is in the value pitch but not in the migration scope above. **Treat as stretch goal**, not a blocker for the prize. Confirmed tool set: `bash`, `read`, `write`, `edit`, `glob`, `grep`, `web_search`, `web_fetch` (8 tools in `agent_toolset_20260401`, all on by default). **No separate `code_exec` tool — run Python via `bash`.** If we add it: see §6.5 add-on B — the capability is generic signal diagnostics (trend / SPC / FFT / correlation) on any signal the cell produces; `web_fetch` for manufacturer datasheets when the KB lookup is empty is a cheap complement.
4. **Bootstrap cost on cold start.** First Investigator run after a restart pays env + agent + session creation latency we don't pay today. Pre-warm in `lifespan` startup if measured >2 s. **Unverified — must measure empirically.**
5. **Cost.** ⚠️ **Not publicly documented.** The Managed Agents docs expose `session.usage.*` for token tracking but do **not** publish per-session / per-event / per-container-second pricing. The previous "negligible for demo volume" claim was unsourced. Treat as unknown; measure usage during the demo dry-run and budget accordingly. Check [anthropic.com/pricing](https://www.anthropic.com/pricing) or contact sales if the project continues post-hackathon.
6. **Session TTL — 30-day checkpoint window.** Per docs: *"Checkpoints are only preserved for 30 days after the session's last activity."* If the demo pitches "re-open the same investigation weeks later," either exercise it within 30 days or frame it as "we persist the session id — reopen works until the checkpoint TTL expires." Honesty in the pitch; don't claim indefinite persistence.

---

## 8. Action items (checklist)

- [x] ~~Probe `sessions.events.stream` for thinking-delta granularity~~ **answered by docs — no per-chunk deltas; use `agent.thinking`**
- [ ] Add `cloudflared` tunnel doc to README + `ARIA_MCP_PUBLIC_URL` and `ARIA_MCP_PATH_SECRET` to `.env.example`.
- [ ] ~~Add bearer-auth middleware on the `/mcp` mount.~~ **Replaced — mount MCP app at `/mcp/{settings.aria_mcp_path_secret}` in `main.py`.** Custom HTTP headers are not forwardable by the managed session per docs.
- [ ] Migration spike `agents.investigator.managed` behind `INVESTIGATOR_USE_MANAGED=False`.
- [ ] Map `agent.thinking` events to `EventBusMap.thinking_delta` frames (one frame per block). Keep extended thinking enabled on the agent definition.
- [ ] Add `work_order.investigator_session_id TEXT NULL` migration.
- [ ] End-to-end test on P-02 scenario, both flag positions.
- [ ] Measure cold-start bootstrap latency (env + agent + session creation) on first Investigator run. If >2 s, add a `lifespan` prewarm.
- [ ] Delete `agents.qa.managed` (**414 LOC**), `qa.schemas.build_custom_tools`, [test_qa_agent_managed.py](backend/tests/unit/agents/test_qa_agent_managed.py), `use_managed_agents` setting.
- [ ] Update demo script + README architecture diagram. Update pitch wording in §6 to acknowledge the 30-day checkpoint TTL if the "re-open" flow is demoed.
- [ ] Update [docs/planning/ROADMAP.md](docs/planning/ROADMAP.md) and create issue for the migration.

**§6.5 add-ons (in order — do A before B):**

- [ ] **Add-on A.** `POST /api/v1/work_order/{id}/continue_investigation` endpoint that resumes `sessions.events.stream(session_id)`.
- [ ] **Add-on A.** *"Continue investigation"* button on WO detail page, gated on `investigator_session_id IS NOT NULL` and within 30-day TTL.
- [ ] **Add-on A.** Test: second WS call to a known `session_id` hits the existing session instead of creating a new one (mirror `test_second_turn_reuses_cached_session`).
- [ ] **Add-on B.** Add `numpy`, `pandas`, `scipy` to the Managed Agents environment package list.
- [ ] **Add-on B.** Extend `INVESTIGATOR_SYSTEM` with signal-diagnostics-via-`bash` guidance + worked examples for at least two technique families (e.g. one time-series trend + one frequency / cross-signal example that matches the demo cell's signature signals).
- [ ] **Add-on B.** Expose `GET /api/v1/signal/{id}/csv?start=&end=` behind the same path-secret as `/mcp` for `bash curl` access.
- [ ] **Add-on B.** Ensure the demo cell's `equipment_kb.failure_patterns[*].signal_signature` carries the reference values the diagnostic technique needs (e.g. bearing geometry on rotating kit; design temperature band on thermal kit; control-limit history on any SPC-amenable signal).
- [ ] **Add-on B.** Dry-run the demo scenario once and confirm the agent actually invokes `bash` for the chosen diagnostic (not just describes it in prose).

---

## 9. References

- [Anthropic Managed Agents — Overview](https://platform.claude.com/docs/en/managed-agents/overview)
- Current implementation: [backend/agents/qa/managed.py](backend/agents/qa/managed.py)
- Current Investigator: [backend/agents/investigator/service.py](backend/agents/investigator/service.py)
- Hackathon rules + prize wording: [docs/hackathon/rules.md](docs/hackathon/rules.md)
- Earlier MCP audit (security gap on `/mcp`): [docs/audits/M2-mcp-server-audit.md](docs/audits/M2-mcp-server-audit.md)
- Earlier agent-chain audit: [docs/audits/M4-M5-sentinel-investigator-workorder-qa-audit.md](docs/audits/M4-M5-sentinel-investigator-workorder-qa-audit.md)

---

## 10. Revision log

### 2026-04-23 — cross-check against docs + current code

Open questions in §7 cross-checked against the [Managed Agents docs](https://platform.claude.com/docs/en/managed-agents/overview) and the post-M5.5-refactor codebase. Changes applied across the audit:

**Plan-changing corrections:**
- §4 (thinking deltas) — **three options collapsed to one.** The probe in option (1) is unnecessary: docs confirm `sessions.events.stream` emits whole `agent.thinking` events, not per-chunk deltas. Block-level re-broadcast is now the plan, not the fallback.
- §3 (hosted MCP auth) — **bearer-auth middleware dropped.** The `mcp_servers` config schema does not support custom HTTP headers (*"No auth tokens are provided at this stage."*). Auth is OAuth-only via vaults. Replaced with a path-secret URL mount (`/mcp/{secret}`) — simpler, hackathon-appropriate.

**Factual corrections (numbers / line refs):**
- §4 line ref `service.py:89-103` → `service.py:92-99` (actual broadcast range).
- §0 + §5 `agents.qa.managed` "~250 lines" → **414 lines** (strengthens the delete argument).
- §0 Investigator loop boilerplate "~250 lines" → **~140 lines** (`_run_investigator_body` is 74, `_dispatch_tool_uses` is 64).
- §3 `INVESTIGATOR_RENDER_TOOLS` count "4 generative-UI tools" → **3** (`RENDER_SIGNAL_CHART`, `RENDER_DIAGNOSTIC_CARD`, `RENDER_PATTERN_MATCH`).

**Added clarifications:**
- §1 — full event type enumeration from the docs; explicit `agent_toolset_20260401` list (8 tools, no `code_exec`); OAuth-only MCP auth model.
- §7 — open question on cost marked as **not publicly documented** (previous "negligible" claim was unsourced); added 30-day checkpoint TTL as a risk item for the "re-open investigation" pitch.
- §8 — action item list re-synced with the plan above.

### 2026-04-23 — Add-on B scope generalised from "pump bearing FFT" to "equipment-agnostic signal diagnostics"

The initial Add-on B framed the cloud-container capability as *"FFT on bearing vibration."* That is **too narrow**: ARIA's schema is equipment-agnostic (`equipment_type` is a free string, 13 signal types in the catalogue, thresholds keyed by signal name, not equipment class), and the only pump-specific thing is the current seed (P-02 Grundfos centrifugal pump). The pitch needs to read as *"Python signal diagnostics inside Anthropic's container"* — a generic industrial-maintenance capability — with P-02 vibration + FFT as one concrete demo instance, not the defining scope.

Rewrites applied:
- §6.5 Add-on B — retitled *"`bash` + Python for in-sandbox signal diagnostics"*. Added a framing callout noting ARIA's schema is equipment-agnostic. Added a menu table of diagnostic techniques covering trend fits, SPC, cross-correlation, FFT, bearing fault frequencies, and degradation regression — mapped to asset classes. Demo scenario still uses the P-02 FFT clip (because that's what's seeded) but explicitly framed as *"if the demo equipment changes, the script changes but the capability doesn't."*
- §0 table — "trend analysis + datasheet lookups" row expanded to *"Python signal diagnostics (trend / SPC / FFT / correlation) + datasheet lookups — equipment-type agnostic"*.
- §7 risk 3 — narrow "rolling-mean + datasheet" example replaced with a pointer to §6.5.
- §8 action items — prompt-update action no longer specifies "FFT guidance"; now requires worked examples across at least two technique families matched to the demo cell's signals. KB-seeding action no longer hardcodes bearing geometry; generalised to *"whatever the diagnostic technique needs (bearing geometry on rotating kit; design temperature band on thermal kit; control-limit history on any SPC-amenable signal)."* Environment dependency list adds `scipy`.
- §6.5 "if only one ships" line — retitled from "FFT-in-container clip" to "Python-in-container clip."
