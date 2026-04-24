/**
 * Anomalies log — operator-facing list of every detection event Sentinel
 * has raised, regardless of whether the Investigator has already worked
 * on it.
 *
 * Backend mapping: each Sentinel breach opens a ``work_order`` row with
 * ``triggered_by_signal_def_id`` set and ``generated_by_agent = true``.
 * We treat that subset as the anomaly log so we never need a dedicated
 * `/anomalies` REST endpoint — same query as the Work Orders list, just
 * filtered + reframed.
 *
 * "Investigated" is derived from status:
 *   - ``detected``                                  → not investigated
 *   - ``analyzed`` / ``open`` / ``in_progress``     → investigated
 *   - ``completed``                                 → resolved
 *   - ``cancelled``                                 → dismissed
 *
 * Per-row CTAs:
 *   - **Investigate** (only when not yet investigated) — opens the chat
 *     drawer (via ``useChatDrawerOpener``) and sends a prefilled prompt
 *     so QA / Investigator pick up where Sentinel stopped.
 *   - **Open** — navigate to the underlying work order detail.
 *
 * Live updates: reuses ``useWorkOrdersStream`` so newly-detected anomalies
 * appear without a refresh.
 */

import { useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Hairline, Icons, SectionHeader } from "../../components/ui";
import { useChatDrawerOpener } from "../chat/chatDrawerStore";
import { useChatStore } from "../chat/chatStore";
import { useSignalDefinitions } from "../control-room/useSignalDefinitions";
import type { WorkOrder } from "../work-orders/types";
import { useWorkOrders } from "../work-orders/useWorkOrders";
import { useWorkOrdersStream } from "../work-orders/useWorkOrdersStream";

type InvestigationState = "open" | "in-progress" | "resolved" | "dismissed";

interface AnomalyRow extends WorkOrder {
    investigationState: InvestigationState;
}

const FILTER_OPTIONS: Array<{ value: "" | InvestigationState; label: string }> = [
    { value: "", label: "All anomalies" },
    { value: "open", label: "Not investigated" },
    { value: "in-progress", label: "Under investigation" },
    { value: "resolved", label: "Resolved" },
    { value: "dismissed", label: "Dismissed" },
];

function deriveState(status: string): InvestigationState {
    if (status === "detected") return "open";
    if (status === "completed") return "resolved";
    if (status === "cancelled") return "dismissed";
    return "in-progress";
}

function stateLabel(state: InvestigationState): string {
    if (state === "open") return "Not investigated";
    if (state === "in-progress") return "Under investigation";
    if (state === "resolved") return "Resolved";
    return "Dismissed";
}

function stateVariant(state: InvestigationState): "critical" | "warning" | "nominal" | "default" {
    if (state === "open") return "critical";
    if (state === "in-progress") return "warning";
    if (state === "resolved") return "nominal";
    return "default";
}

function formatDateTime(ts: string | null | undefined): string {
    if (!ts) return "—";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function buildInvestigatePrompt(args: {
    cellName: string;
    signalLabel: string;
    triggeredAt: string | null | undefined;
    woId: number;
}): string {
    const when = args.triggeredAt ? formatDateTime(args.triggeredAt) : "recently";
    return (
        `Investigate anomaly on ${args.cellName}: ${args.signalLabel} breached its KB threshold ` +
        `at ${when} (work order #${args.woId}). What is the most likely root cause and what action should we take?`
    );
}

export function AnomaliesList() {
    useWorkOrdersStream();
    const navigate = useNavigate();
    const query = useWorkOrders();
    const sendMessage = useChatStore((s) => s.sendMessage);
    const requestFocus = useChatStore((s) => s.requestFocus);
    const requestDrawerOpen = useChatDrawerOpener((s) => s.requestOpen);

    const [stateFilter, setStateFilter] = useState<"" | InvestigationState>("");
    const [cellFilter, setCellFilter] = useState("");

    // Anomaly subset: any work order Sentinel raised (i.e. has a triggering
    // signal). Sort newest-first.
    const allAnomalies = useMemo<AnomalyRow[]>(() => {
        const list = query.data ?? [];
        const filtered = list
            .filter((wo) => wo.triggered_by_signal_def_id != null)
            .map<AnomalyRow>((wo) => ({ ...wo, investigationState: deriveState(wo.status) }));
        filtered.sort((a, b) => {
            const ta = new Date(a.trigger_anomaly_time ?? a.created_at).getTime();
            const tb = new Date(b.trigger_anomaly_time ?? b.created_at).getTime();
            return tb - ta;
        });
        return filtered;
    }, [query.data]);

    // Resolve signal labels for the currently-shown rows. We grab the first
    // cell_id we see to scope the lookup; multi-cell sites would need a
    // per-cell index but the demo runs a single cell so this stays simple.
    const primaryCellId = allAnomalies[0]?.cell_id ?? null;
    const signalDefs = useSignalDefinitions(primaryCellId);

    const rows = useMemo(() => {
        const c = cellFilter.trim().toLowerCase();
        return allAnomalies.filter((row) => {
            if (stateFilter && row.investigationState !== stateFilter) return false;
            if (c) {
                const hay = `${row.cell_name ?? ""} ${row.cell_id}`.toLowerCase();
                if (!hay.includes(c)) return false;
            }
            return true;
        });
    }, [allAnomalies, stateFilter, cellFilter]);

    const counts = useMemo(() => {
        const out = { total: allAnomalies.length, open: 0, inProgress: 0, resolved: 0 };
        for (const row of allAnomalies) {
            if (row.investigationState === "open") out.open++;
            else if (row.investigationState === "in-progress") out.inProgress++;
            else if (row.investigationState === "resolved") out.resolved++;
        }
        return out;
    }, [allAnomalies]);

    const handleInvestigate = (row: AnomalyRow) => {
        const signalLabel =
            (row.triggered_by_signal_def_id != null
                ? signalDefs.resolve(row.triggered_by_signal_def_id)
                : null) ?? `Signal #${row.triggered_by_signal_def_id ?? "?"}`;
        const cellName = row.cell_name ?? `Cell ${row.cell_id}`;
        const prompt = buildInvestigatePrompt({
            cellName,
            signalLabel,
            triggeredAt: row.trigger_anomaly_time ?? row.created_at,
            woId: row.id,
        });
        requestDrawerOpen();
        sendMessage(prompt);
        requestFocus();
    };

    const filterId = useId();
    const cellId = useId();

    return (
        <section className="flex h-full flex-col gap-6 p-6">
            <SectionHeader
                label="Anomalies log"
                size="lg"
                meta={
                    <span>
                        {counts.total} total · {counts.open} open · {counts.inProgress} in progress
                        · {counts.resolved} resolved
                    </span>
                }
            />
            <Hairline />

            <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <label className="font-medium" htmlFor={filterId}>
                        Investigation status
                    </label>
                    <select
                        id={filterId}
                        className="h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={stateFilter}
                        onChange={(e) => setStateFilter(e.target.value as "" | InvestigationState)}
                    >
                        {FILTER_OPTIONS.map((opt) => (
                            <option key={opt.value || "all"} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                    <label className="font-medium" htmlFor={cellId}>
                        Cell
                    </label>
                    <input
                        id={cellId}
                        type="text"
                        placeholder="Name or id"
                        className="h-8 min-w-[180px] rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={cellFilter}
                        onChange={(e) => setCellFilter(e.target.value)}
                    />
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setStateFilter("");
                        setCellFilter("");
                    }}
                    className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:border-input hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Icons.RefreshCw className="size-3.5" aria-hidden />
                    Reset
                </button>
            </div>

            <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
                <div className="h-full overflow-auto">
                    {query.isPending ? (
                        <EmptyState>Loading anomalies…</EmptyState>
                    ) : query.isError ? (
                        <EmptyState tone="critical">
                            Failed to load anomalies. {query.error?.message ?? ""}
                        </EmptyState>
                    ) : rows.length === 0 ? (
                        <EmptyState>
                            {allAnomalies.length === 0
                                ? "No anomalies have been raised yet. Sentinel will log every threshold breach here as soon as one fires."
                                : "No anomalies match the current filters."}
                        </EmptyState>
                    ) : (
                        <table className="w-full border-separate border-spacing-0 text-sm">
                            <thead className="sticky top-0 z-10 bg-card">
                                <tr className="text-left text-xs font-medium text-muted-foreground">
                                    <th
                                        className="border-b border-border px-4 py-2.5 font-medium"
                                        scope="col"
                                    >
                                        Detected
                                    </th>
                                    <th
                                        className="border-b border-border px-4 py-2.5 font-medium"
                                        scope="col"
                                    >
                                        Cell
                                    </th>
                                    <th
                                        className="border-b border-border px-4 py-2.5 font-medium"
                                        scope="col"
                                    >
                                        Signal
                                    </th>
                                    <th
                                        className="border-b border-border px-4 py-2.5 font-medium"
                                        scope="col"
                                    >
                                        Status
                                    </th>
                                    <th
                                        className="border-b border-border px-4 py-2.5 font-medium"
                                        scope="col"
                                    >
                                        RCA
                                    </th>
                                    <th
                                        className="border-b border-border px-4 py-2.5 text-right font-medium"
                                        scope="col"
                                    >
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => {
                                    const signalLabel =
                                        (row.triggered_by_signal_def_id != null
                                            ? signalDefs.resolve(row.triggered_by_signal_def_id)
                                            : null) ??
                                        `Signal #${row.triggered_by_signal_def_id ?? "?"}`;
                                    return (
                                        <Row
                                            key={row.id}
                                            row={row}
                                            signalLabel={signalLabel}
                                            onOpen={() => navigate(`/work-orders/${row.id}`)}
                                            onInvestigate={() => handleInvestigate(row)}
                                        />
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </section>
    );
}

interface RowProps {
    row: AnomalyRow;
    signalLabel: string;
    onOpen: () => void;
    onInvestigate: () => void;
}

function Row({ row, signalLabel, onOpen, onInvestigate }: RowProps) {
    const detectedAt = row.trigger_anomaly_time ?? row.created_at;
    const isOpen = row.investigationState === "open";

    return (
        <tr className="border-b border-border transition-colors hover:bg-accent">
            <td className="px-4 py-3 align-middle">
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-foreground">
                        {formatDateTime(detectedAt)}
                    </span>
                    <span className="text-xs text-text-tertiary">WO #{row.id}</span>
                </div>
            </td>
            <td className="px-4 py-3 align-middle">
                <span className="font-medium text-foreground">
                    {row.cell_name ?? `Cell ${row.cell_id}`}
                </span>
            </td>
            <td className="px-4 py-3 align-middle">
                <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                    {signalLabel}
                </code>
            </td>
            <td className="px-4 py-3 align-middle">
                <Badge variant={stateVariant(row.investigationState)}>
                    {stateLabel(row.investigationState)}
                </Badge>
            </td>
            <td className="px-4 py-3 align-middle">
                {row.rca_summary ? (
                    <span className="line-clamp-2 text-xs text-muted-foreground">
                        {row.rca_summary}
                    </span>
                ) : (
                    <span className="text-xs text-text-tertiary">—</span>
                )}
            </td>
            <td className="px-4 py-3 align-middle">
                <div className="flex items-center justify-end gap-2">
                    {isOpen && (
                        <Button
                            size="sm"
                            variant="default"
                            onClick={onInvestigate}
                            data-testid={`anomaly-row-investigate-${row.id}`}
                        >
                            Investigate
                        </Button>
                    )}
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={onOpen}
                        aria-label={`Open work order ${row.id}`}
                    >
                        Open
                        <Icons.ChevronRight className="ml-1 size-3.5" aria-hidden />
                    </Button>
                </div>
            </td>
        </tr>
    );
}

function EmptyState({ children, tone }: { children: React.ReactNode; tone?: "critical" }) {
    return (
        <div
            className={`flex h-full min-h-[180px] items-center justify-center px-6 py-12 text-center text-sm ${
                tone === "critical" ? "text-destructive" : "text-muted-foreground"
            }`}
        >
            {children}
        </div>
    );
}
