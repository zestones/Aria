/**
 * DEV-only demo trigger (hackathon J-2).
 *
 * Calls the backend debug endpoint `/api/v1/debug/replay-full-flow/{id}`
 * to replay the full multi-agent choreography on an existing work order:
 *
 * 1. Sentinel broadcasts `anomaly_detected` + `ui_render(alert_banner)` —
 *    the operator console lights up with the red banner.
 * 2. Investigator spawns (Opus 4.7 extended thinking) — streaming
 *    `thinking_delta` + tool calls + render artifacts + `submit_rca`.
 * 3. Work Order Generator auto-chains post-RCA — enriches the WO with
 *    recommended actions, required parts, skills, scheduling hints.
 * 4. Optional handoff to KB Builder if the Investigator needs a threshold
 *    lookup.
 *
 * Gated on `import.meta.env.DEV` so production builds strip the button
 * entirely (Vite tree-shakes the consumer when the gate is false). The
 * backend endpoint itself is gated server-side behind `ARIA_DEMO_ENABLED`.
 *
 * Mounted as a fixed floating control in the bottom-left of the viewport
 * so it is reachable from any page without collision with TopBar / Chat
 * drawer / Agent Inspector.
 */

import { useState } from "react";
import { Icons } from "../../design-system";

interface RecentWorkOrder {
    id: number;
    cell_id: number;
    status: string;
    title: string;
}

interface FullFlowResponse {
    work_order_id: number;
    cell_id: number;
    cell_name: string;
    previous_status: string;
    title: string;
    spawned: boolean;
}

export function DemoReplayButton() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSpawned, setLastSpawned] = useState<FullFlowResponse | null>(null);

    async function replay() {
        setBusy(true);
        setError(null);
        try {
            const listResp = await fetch("/api/v1/debug/recent-work-orders?limit=1", {
                credentials: "include",
            });
            if (!listResp.ok) {
                throw new Error(`recent-work-orders ${listResp.status}`);
            }
            const wos = (await listResp.json()) as RecentWorkOrder[];
            if (wos.length === 0) {
                throw new Error("no work orders available");
            }
            const wo = wos[0];

            const replayResp = await fetch(`/api/v1/debug/replay-full-flow/${wo.id}`, {
                method: "POST",
                credentials: "include",
            });
            if (!replayResp.ok) {
                throw new Error(`replay ${replayResp.status}`);
            }
            const spawned = (await replayResp.json()) as FullFlowResponse;
            setLastSpawned(spawned);
        } catch (e) {
            setError(e instanceof Error ? e.message : "replay failed");
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="pointer-events-none fixed bottom-4 left-4 z-40 flex items-end gap-2">
            <div className="pointer-events-auto flex items-center gap-2 rounded-[var(--ds-radius-md)] border border-dashed border-[var(--ds-border-strong)] bg-[var(--ds-bg-surface)] px-2 py-1.5 shadow-sm">
                <button
                    type="button"
                    onClick={replay}
                    disabled={busy}
                    aria-label="Replay the full multi-agent flow on the most recent work order (demo trigger)"
                    className="inline-flex h-7 items-center gap-1.5 rounded-[var(--ds-radius-sm)] bg-transparent px-2 text-[var(--ds-text-xs)] font-medium text-[var(--ds-fg-muted)] transition-colors duration-[var(--ds-motion-fast)] hover:bg-[var(--ds-accent-soft)] hover:text-[var(--ds-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)] disabled:opacity-60"
                >
                    <Icons.Play className="size-3" aria-hidden />
                    {busy ? "Replaying full flow…" : "Replay full agent flow"}
                    <span className="text-[var(--ds-fg-subtle)]">· dev</span>
                </button>
                {lastSpawned != null && !error && (
                    <span className="text-[var(--ds-text-xs)] text-[var(--ds-fg-subtle)]">
                        → WO #{lastSpawned.work_order_id} ({lastSpawned.cell_name})
                    </span>
                )}
                {error && (
                    <span className="text-[var(--ds-text-xs)] text-[var(--ds-status-critical)]">
                        {error}
                    </span>
                )}
            </div>
        </div>
    );
}
