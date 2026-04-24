/**
 * DEV-only demo trigger (hackathon J-2).
 *
 * Calls the backend debug endpoint `/api/v1/debug/replay-investigator/{id}`
 * to re-spawn the Investigator agent on an existing work order — unblocks
 * the demo pitch by firing Opus 4.7 extended thinking + Agent Inspector +
 * Activity Feed on cue, instead of waiting for a natural Sentinel
 * detection.
 *
 * Gated on `import.meta.env.DEV` so production builds strip the button
 * entirely (Vite tree-shakes the consumer when the gate is false). The
 * backend endpoint itself is gated server-side behind `ARIA_DEMO_ENABLED`,
 * so even a leaked bundle can't trigger it in prod.
 *
 * Mounted as a fixed floating control in the bottom-right of the viewport
 * so it is reachable from any page (Control Room, Work Orders, etc.)
 * without collision with TopBar / Chat drawer / Agent Inspector.
 *
 * Remove post-demo along with `backend/modules/debug/`.
 */

import { useState } from "react";
import { Icons } from "../../components/ui";

interface RecentWorkOrder {
    id: number;
    cell_id: number;
    status: string;
    title: string;
}

export function DemoReplayButton() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastSpawned, setLastSpawned] = useState<RecentWorkOrder | null>(null);

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

            const replayResp = await fetch(`/api/v1/debug/replay-investigator/${wo.id}`, {
                method: "POST",
                credentials: "include",
            });
            if (!replayResp.ok) {
                throw new Error(`replay ${replayResp.status}`);
            }
            setLastSpawned(wo);
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
                    aria-label="Replay Investigator on the most recent work order (demo trigger)"
                    className="inline-flex h-7 items-center gap-1.5 rounded-[var(--ds-radius-sm)] bg-transparent px-2 text-[var(--ds-text-xs)] font-medium text-[var(--ds-fg-muted)] transition-colors duration-[var(--ds-motion-fast)] hover:bg-[var(--ds-accent-soft)] hover:text-[var(--ds-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)] disabled:opacity-60"
                >
                    <Icons.Play className="size-3" aria-hidden />
                    {busy ? "Replaying…" : "Replay last investigation"}
                    <span className="text-[var(--ds-fg-subtle)]">· dev</span>
                </button>
                {lastSpawned != null && !error && (
                    <span className="text-[var(--ds-text-xs)] text-[var(--ds-fg-subtle)]">
                        → WO #{lastSpawned.id} (cell {lastSpawned.cell_id})
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
