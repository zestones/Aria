# Transcript of the demo video

## ACT I — The problem

In every factory, every plant, every water station in the world — there's one person who knows.
He knows when a machine sounds different. He knows it's going to break — two days before it does. He just knows. And when he retires, that knowledge disappears. Forever.

Companies have tried to fix this for years. Setting it up costs half a million dollars and takes six months of specialists. So more than half of industrial sites just... don't. They wait for machines to break. We built ARIA to change that. Five agents, each with a single job passing the problem between them. Exactly like a real maintenance team passes a ticket.

## ACT II — ARIA at work

### Scene 1 — Onboarding Bottle Labeler

Take a water-bottling factory. One line, five machines. Drop in the manual. ARIA reads it with Opus 4.7 vision. Asks three questions. and then, it's live.

### Scene 2 — Forecast a breakdown

Meanwhile, on the Bottle Capper — ARIA flags a potential breach. But look at what happens next. Vibration is falling, not rising. ARIA reads the context, checks the knowledge base, and concludes: no action required.

It didn't just detect — it judged.

### Scene 3 — Investigating an Anomaly

#### 3a · Sentinel breach + thinking

Now let's see what happens when a real breach hits.

The operator sees an alert — and that's where most systems stop: alert sent, problem yours.

ARIA doesn't.

It fires the Investigator agent — and like a detective, it starts gathering clues, with Opus 4.7 extended thinking.

### 3b · Sandbox Python

And here's the part that cannot happen without Managed Agents.

The agent wrote Python, ran it inside Anthropic's cloud sandbox, and computed the degradation rate from the raw signal.

That's not guessing — that's a regression that actually ran.

### 3c · RCA

And those exact numbers land in the work order.

Discharge bearing wear — progressing thirteen point seven times faster than the January 2026 baseline. Twelve steps. The exact part number.

A four-hour maintenance window, starting midnight. The technician walks out with a printed sheet.

## Act III — Explaining the magic

### Memory Recall

Another alert — this time on the Bottle Filler. And ARIA remembers. Same vibration pattern as January. Tom Anderson closed that incident. ARIA pulls his fix, matches the part number, and tells the operator exactly what worked three months ago. It doesn't start from zero — it compounds.

ARIA's memory is the history of the plant, the machines, the people. Every incident, every fix, every note — all feeding into a system that learns and adapts.

---

### System Montage

Behind the scenes, seventeen tools are available to the agents. Logbook entries. Shift notes from the operators. Signal trends. Computed KPIs and Past failures are all gathered and scored in a knowledge base behind each machine — built from the manual and the operator's own experience.

Everything cross-referenced with Claude Opus 4.7, extended thinking, and one million tokens of context.

---

### Closing

Five agents share seventeen tools through MCP. The Investigator runs as a Managed Agent with Claude Opus 4.7 extended thinking.

From shop floor knowledge to diagnosis — so the one who knows is never the last
