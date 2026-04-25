/**
 * DEV-only demo / scene-orchestration control strip (#54 / M9.4).
 *
 * One collapsed icon in the bottom-right by default — invisible-adjacent
 * on a recorded video, reachable in two clicks for the presenter. Click
 * the icon → slide-out pill with the six demo triggers. Click any
 * trigger → fires the backend endpoint, shows inline feedback, and
 * auto-collapses so the next demo beat has a clean screen.
 *
 * Six actions:
 *   1. Clear alerts           → POST /api/v1/demo/reset/light
 *   2. Predict failure        → POST /api/v1/demo/scene/seed-forecast
 *   3. Trigger breach         → POST /api/v1/demo/scene/trigger-breach
 *   4. Memory recall          → POST /api/v1/demo/trigger-memory-scene
 *   5. Run whole demo         → POST /api/v1/demo/scene/run-full
 *   6. Replay investigator    → POST /api/v1/debug/replay-investigator/{id}
 *                                (previously the standalone ``DemoReplayButton`` —
 *                                consolidated here so the presenter has one
 *                                mental "demo dock" to reach for)
 *
 * Gating:
 *   - Component only renders under ``import.meta.env.DEV`` (mount site
 *     wraps it). Vite tree-shakes the consumer in prod.
 *   - The backend endpoints it calls are themselves gated behind
 *     ``ARIA_DEMO_ENABLED=true`` — defence in depth if a DEV build ever
 *     leaks.
 *
 * Layout + UX rules (from demo-build-spec §2.3):
 *   - Collapsed: 32 px circle, low opacity when idle, full on hover.
 *   - Expanded: rounded pill extending leftward, six text-only buttons.
 *   - Auto-collapse on: (a) successful action, (b) click outside,
 *     (c) Escape key. Never collapses on hover loss alone.
 *   - Feedback inline next to the strip for ≤ 3 s after a click, then fades.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icons } from "../../components/ui";
import type { EquipmentSelection } from "../../lib/hierarchy";
import { useLocalStorage } from "../../lib/useLocalStorage";
import { EQUIPMENT_KEY, validateEquipmentSelection } from "../control-room/equipmentSelection";

interface Action {
    key: string;
    label: string;
    /** Async runner; returns a short success message for the inline toast. */
    run: () => Promise<string>;
    /** If true, confirm before firing — prevents a mis-click during a live demo. */
    confirm?: string;
}

async function postJson(url: string, body: object = {}): Promise<Response> {
    return fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

async function postAndSummarise(url: string, body: object, key: string): Promise<string> {
    const resp = await postJson(url, body);
    if (!resp.ok) {
        throw new Error(`${key}: HTTP ${resp.status}`);
    }
    const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
    // Extract a short, meaningful value the presenter can glance at.
    if (typeof data.expect_anomaly_within_seconds === "number") {
        return `${key} → anomaly in ~${data.expect_anomaly_within_seconds}s`;
    }
    if (typeof data.expected_forecast_within_seconds === "number") {
        return `${key} → forecast in ~${data.expected_forecast_within_seconds}s`;
    }
    if (typeof data.expected_total_duration_seconds === "number") {
        const min = Math.round(Number(data.expected_total_duration_seconds) / 60);
        return `${key} → chain running ~${min} min`;
    }
    if (typeof data.cancelled_work_orders === "number") {
        return `${key} → cancelled ${data.cancelled_work_orders} WOs · cleared ${String(
            data.cleared_readings ?? 0,
        )} readings`;
    }
    if (typeof data.spawned === "boolean" || typeof data.work_order_id === "number") {
        const woId = data.work_order_id;
        return `${key} → WO ${woId ?? "?"} replayed`;
    }
    return `${key} → ok`;
}

async function replayLastInvestigator(): Promise<string> {
    const listResp = await fetch("/api/v1/debug/recent-work-orders?limit=1", {
        credentials: "include",
    });
    if (!listResp.ok) throw new Error(`recent-wo: HTTP ${listResp.status}`);
    const rows = (await listResp.json()) as Array<{ id: number; cell_id: number }>;
    if (rows.length === 0) throw new Error("no recent work orders");
    const wo = rows[0];
    const replayResp = await postJson(`/api/v1/debug/replay-investigator/${wo.id}`);
    if (!replayResp.ok) throw new Error(`replay: HTTP ${replayResp.status}`);
    return `replay → WO ${wo.id} (cell ${wo.cell_id})`;
}

/** Build the action list for a given cell target. When `cellName` is null
 *  the backend falls back to its own defaults ("Bottle Filler" / "Bottle
 *  Capper"). Pass the selected cell name from the TopBar to aim at the
 *  currently-scoped cell. */
function buildActions(cellName: string | null): Action[] {
    // target is the cell the scene endpoints aim at. Memory always targets
    // a "sibling" cell; when the user only has one cell, we use the same one.
    const target = cellName ?? "Bottle Filler";
    const memoryTarget = cellName ?? "Bottle Capper";

    return [
        {
            key: "Clear alerts",
            label: "Clear",
            run: () => postAndSummarise("/api/v1/demo/reset/light", {}, "Clear"),
        },
        {
            key: "Predict failure",
            label: "Forecast",
            run: () => postAndSummarise("/api/v1/demo/scene/seed-forecast", { target }, "Forecast"),
        },
        {
            key: "Trigger breach",
            label: "Breach",
            run: () => postAndSummarise("/api/v1/demo/scene/trigger-breach", { target }, "Breach"),
        },
        {
            key: "Memory recall",
            label: "Memory",
            run: () =>
                postAndSummarise(
                    "/api/v1/demo/trigger-memory-scene",
                    { cell_name: memoryTarget },
                    "Memory",
                ),
        },
        {
            key: "Run whole demo",
            label: "Run all",
            confirm:
                "Fire the full demo chain? Takes ~6 minutes end-to-end and will cancel open WOs + trigger multiple investigations.",
            run: () =>
                postAndSummarise(
                    "/api/v1/demo/scene/run-full",
                    {
                        forecast_target: target,
                        breach_target: target,
                        memory_target: memoryTarget,
                    },
                    "Run all",
                ),
        },
        {
            key: "Replay investigator",
            label: "Replay",
            run: replayLastInvestigator,
        },
    ];
}

const FEEDBACK_TIMEOUT_MS = 3200;

export function DemoControlStrip() {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<{ text: string; tone: "ok" | "err" } | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Read the TopBar cell selection so demo triggers aim at the right cell.
    const [selection] = useLocalStorage<EquipmentSelection | null>(EQUIPMENT_KEY, null, {
        validator: validateEquipmentSelection,
    });
    const cellName = selection?.cellName ?? null;
    const actions = buildActions(cellName);

    // Clear inline message after a short window so the UI returns to a
    // neutral state before the next take.
    useEffect(() => {
        if (!message) return;
        const id = window.setTimeout(() => setMessage(null), FEEDBACK_TIMEOUT_MS);
        return () => window.clearTimeout(id);
    }, [message]);

    // Esc collapses — do not hijack when the presenter is typing in chat.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            const target = e.target;
            if (target instanceof HTMLElement) {
                const tag = target.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
            }
            setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    // Click outside collapses. Uses capture so a click on any child inside
    // the strip does NOT bubble to this handler.
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            const el = containerRef.current;
            if (el && e.target instanceof Node && el.contains(e.target)) return;
            setOpen(false);
        };
        window.addEventListener("mousedown", onDown);
        return () => window.removeEventListener("mousedown", onDown);
    }, [open]);

    const fire = useCallback(async (action: Action) => {
        if (action.confirm && !window.confirm(action.confirm)) return;
        setBusy(action.key);
        try {
            const text = await action.run();
            setMessage({ text, tone: "ok" });
            // Auto-collapse so the next demo beat has a clean screen.
            setOpen(false);
        } catch (err) {
            setMessage({
                text: err instanceof Error ? err.message : "action failed",
                tone: "err",
            });
        } finally {
            setBusy(null);
        }
    }, []);

    return (
        <div
            ref={containerRef}
            className="pointer-events-none fixed bottom-4 right-4 z-40 flex items-center justify-end gap-2"
        >
            {/* Inline feedback — persists even when the strip is collapsed so
                the presenter can glance at the last result before firing the
                next scene. */}
            <AnimatePresence>
                {message && (
                    <motion.div
                        key={message.text}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 8 }}
                        transition={{ duration: 0.15 }}
                        role="status"
                        className="pointer-events-auto max-w-[260px] rounded-md border border-border bg-card px-2.5 py-1 font-mono text-[11px] shadow-card"
                        style={{
                            color:
                                message.tone === "err"
                                    ? "var(--destructive)"
                                    : "var(--text-tertiary)",
                        }}
                    >
                        {message.text}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Expanded strip — appears to the left of the collapsed icon. */}
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        key="strip"
                        role="toolbar"
                        aria-label="Demo scene triggers"
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                        className="pointer-events-auto flex items-center gap-1 rounded-lg border border-dashed border-input bg-card px-1.5 py-1 shadow-card"
                    >
                        <span className="px-1 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
                            Demo
                        </span>
                        {cellName && (
                            <span
                                className="rounded px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary"
                                style={{ background: "var(--accent)" }}
                                title={`Targeting: ${cellName}`}
                            >
                                {cellName}
                            </span>
                        )}
                        <span
                            aria-hidden
                            className="mx-0.5 h-4 w-px"
                            style={{ background: "var(--border)" }}
                        />
                        {actions.map((action) => {
                            const isBusy = busy === action.key;
                            return (
                                <button
                                    key={action.key}
                                    type="button"
                                    onClick={() => fire(action)}
                                    disabled={busy !== null}
                                    title={action.key}
                                    aria-label={action.key}
                                    className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isBusy && (
                                        <Icons.Loader2
                                            className="size-3 animate-spin"
                                            aria-hidden
                                        />
                                    )}
                                    {action.label}
                                </button>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Collapsed toggle — the only always-visible affordance. */}
            <button
                type="button"
                onClick={() => setOpen((p) => !p)}
                aria-expanded={open}
                aria-controls="demo-control-strip"
                aria-label={open ? "Close demo controls" : "Open demo controls"}
                title={open ? "Close demo controls" : "Open demo controls"}
                className={[
                    "pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-input bg-card transition-all duration-150",
                    open
                        ? "text-foreground opacity-100"
                        : "text-muted-foreground opacity-50 hover:opacity-100 hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                ].join(" ")}
            >
                <Icons.Command className="size-3.5" aria-hidden />
            </button>
        </div>
    );
}
