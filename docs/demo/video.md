# Transcript of the demo video

## ACT I — The problem

In every factory, every plant, every water station in the world — there's one person who knows.
He knows when a machine sounds different. He knows it's going to break — two days before it does. He just knows. And when he retires, that knowledge disappears. Forever.

Companies have tried to fix this for ten years. Setting it up costs half a million dollars and takes six months of specialists. So ninety-five percent of industrial sites just... don't. They wait for machines to break. We built ARIA to change that. Five agents, each with a single job passing the problem between them. Exctly like a real maintenance team passes a ticket.

## ACT II — ARIA at work

### Scene 1 — Onboarding Bottle Labeler

Take a water-bottling factory. One line, four machines. Today a fifth one comes online — the Bottle Labeler. Normally, configuring its monitoring takes a specialist two days. Drop in the manual. ARIA reads it. Asks three questions. Two minutes later, it's live.

### Scene 2 — Forecast a breakdown

Meanwhile, on the Bottle Capper — ARIA flags a potential breach. But look at what happens next. Vibration is falling, not rising. ARIA reads the context, checks the knowledge base, and concludes: no action required.

It didn't just detect — it judged.

### Scene 3 — Investigating an Anomaly

#### 3a · Sentinel breach + thinking

Now let's see what happens when a real breach hits.

The operator sees an alert — and that's where most systems stop: alert sent, problem yours.

ARIA doesn't.

It fires the Investigator agent — and like a detective, it starts gathering clues: operator logbook, sensor trends, equipment knowledge base.

### 3b · Sandbox Python

And here's the part that cannot happen without Managed Agents.

The agent wrote Python, ran it live inside Anthropic's cloud sandbox, and computed the degradation rate directly from the raw signal data.

Slope: zero point three two millimeters per second per hour. R-squared: one point zero zero zero. Time to trip threshold: four point five hours.

That's not a language model guessing — that's a regression that actually ran.

### 3c · RCA

And those exact numbers land in the work order.

Discharge bearing wear — progressing thirteen point seven times faster than the January 2026 baseline. Twelve steps. The exact part number.

A four-hour maintenance window, starting midnight. The technician walks out with a printed sheet.

### Scene 5 — But How?


