# Hackathon Submission — Built with Opus 4.7

---

## **Team Name**

ARIA Team

---

## **Team Members**

zestones, vgtray

---

## **Project Name**

ARIA — Adaptive Reasoning for Industrial Awareness

---

## **Selected Hackathon Problem Statement**

1. Build for what you know

In every factory there's one person who knows when a machine is about to fail — they hear it. They wrote it in the shift log. They told the next operator at handover. When they retire, that knowledge disappears forever. Setting up a system to capture it costs €50k–€500k and takes six months of specialists. So most plants don't bother — they wait for machines to break. ARIA was built to change that.

---

## **Project Description**

ARIA captures the floor operator's knowledge and puts it to work. Drop in the manufacturer's PDF, answer some calibration questions, and you're live in ten minutes. After that, ARIA continuously ingests everything that already exists — live signal trends, operator logbook entries, shift notes, machine failure history, and computed KPIs (OEE, MTBF, MTTR) — building a knowledge base that grows with every incident. When something goes wrong, five agents pass the problem like a real maintenance team passes a ticket: detection → diagnosis → work order → memory.

Five Agents :

- **KB Builder** — reads the manufacturer PDF with Opus 4.7 vision and captures the operator's floor knowledge through a short calibration dialogue. Live before they leave the terminal.
- **Sentinel** — watches live signals against the KB; detects breaches, forecasts signal tails, and judges whether a drift warning is worth surfacing.
- **Investigator** — the centrepiece. Diagnoses anomalies with Opus 4.7 extended thinking; writes and executes Python in Anthropic's sandboxed container to compute exact degradation rates from raw signal data; recalls and builds on every past failure.
- **Work Order Generator** — turns the RCA into a printed sheet: root cause, remediation steps, exact part number, intervention window.
- **Q&A** — natural-language operator chat; hands off to the Investigator when a deep diagnosis is needed.

All five agents share 17 MCP tools as their only path to the database. Generative-UI artifacts — charts, diagnostic cards, work orders — stream into the operator's chat as the agents work.

---

## **Public GitHub Repository**

[https://github.com/zestones/Aria](https://github.com/zestones/Aria)

---

## **Demo Video**

[https://youtu.be/Hen24w2Jyz4](https://youtu.be/Hen24w2Jyz4)

---

## **Thoughts and feedback on building with Opus 4.7**

Extended thinking was the feature that made the Investigator possible. Industrial root-cause analysis requires holding a lot of context simultaneously — signal history, failure patterns, the operator's calibration notes, computed KPIs — and reasoning across all of it before arriving at a conclusion. With previous models we would have had to chain that manually.

Opus 4.7 vision on PDF ingestion was the other unlock. Manufacturer manuals are dense, structured documents — tables of thresholds, diagrams, tolerance windows. The model extracted them accurately enough to seed a real knowledge base directly.

---

## **Did you use Claude Managed Agents? If so, how?**

Yes — the Investigator runs on Claude Managed Agents with a hosted MCP server and Anthropic's sandboxed Python container.

When the Sentinel Agent detects a breach, it fires the Investigator as a Managed Agent. The agent is given access to ARIA's 17-tool MCP surface (exposed via Cloudflare Tunnel with a path secret as bearer token) and Anthropic's code execution sandbox. It:

1. Pulls signal history, logbook entries, shift notes, failure history, and computed KPIs through the MCP tools.
2. Uses extended thinking to reason across all of it.
3. Writes Python to compute degradation rates and trend projections — and actually runs it in the sandbox.
4. Cross-references the current pattern against past failures stored in the KB, surfacing prior fixes and technician names when they match.

The architecture also supports a fallback to the Messages API path — both share the same external contract, so the rest of the system is unaffected either way.

The sandboxed code execution was the critical piece. Without it, degradation rate calculations would have been estimates from the model's reasoning. With it, they are actual computed numbers from actual signal data — which is what makes the work order's intervention window and part number credible rather than approximate.
