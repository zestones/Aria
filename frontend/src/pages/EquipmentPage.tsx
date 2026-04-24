/**
 * Equipment page — operator's drill-down view of every cell in scope.
 *
 * Layout: master-detail.
 *  - Left rail (320px): searchable cell list with live status pill per row.
 *  - Right pane: rich detail of the selected cell — current status header,
 *    KPI tiles (OEE / MTBF / MTTR / anomalies 24h), live signal table,
 *    active work orders, recent logbook entries, knowledge-base summary.
 *
 * Live data is read from existing endpoints:
 *  - `/hierarchy/tree`              — cell catalog (via `useEquipmentList`)
 *  - `/monitoring/status/current`   — per-cell status category (15 s poll)
 *  - `/signals/current?cell_ids=N`  — live signal values (5 s poll)
 *  - `/kpi/*`                       — KPI snapshot via `useKpiData` (15 s)
 *  - `/work-orders`                 — filtered to selected cell
 *  - `/logbook?cell_id=N`           — last 5 entries
 *  - `/kb/equipment/{cell_id}`      — KB metadata
 *
 * Selection state is persisted via the same `aria.selectedEquipment`
 * localStorage slot the topbar EquipmentPicker writes to, so picking a
 * cell here keeps the dashboard scope in sync (and vice versa).
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Card, Hairline, Icons, SectionHeader, StatusDot } from "../components/ui";
import {
    EQUIPMENT_KEY,
    Sparkline,
    useEquipmentList,
    useKpiData,
    validateEquipmentSelection,
} from "../features/control-room";
import {
    type CellStatusMap,
    statusFromCategory,
    useCellStatuses,
    useCurrentSignals,
    useEquipmentKb,
} from "../features/equipment";
import { useLogbookEntries } from "../features/logbook";
import { PRIORITY_RANK, useWorkOrders } from "../features/work-orders";
import { formatHeaderDate } from "../lib/date";
import type { EquipmentSelection } from "../lib/hierarchy";
import { useLocalStorage } from "../lib/useLocalStorage";

type StatusTone = "nominal" | "warning" | "critical" | "unknown";

export default function EquipmentPage() {
    const [selection] = useLocalStorage<EquipmentSelection | null>(EQUIPMENT_KEY, null, {
        validator: validateEquipmentSelection,
    });
    const { entries, isLoading: entriesLoading } = useEquipmentList(selection);
    const { map: statusMap } = useCellStatuses();

    const [selectedCellId, setSelectedCellId] = useState<number | null>(selection?.cellId ?? null);
    const [search, setSearch] = useState("");

    // Auto-pick the first entry when the previous selection falls out of scope.
    useEffect(() => {
        if (entries.length === 0) {
            if (selectedCellId !== null) setSelectedCellId(null);
            return;
        }
        if (selectedCellId == null || !entries.some((e) => e.cellId === selectedCellId)) {
            setSelectedCellId(entries[0]?.cellId ?? null);
        }
    }, [entries, selectedCellId]);

    const filtered = useMemo(() => {
        if (!search.trim()) return entries;
        const needle = search.trim().toLowerCase();
        return entries.filter(
            (e) =>
                e.label.toLowerCase().includes(needle) || e.sublabel.toLowerCase().includes(needle),
        );
    }, [entries, search]);

    const selectedEntry = useMemo(
        () => entries.find((e) => e.cellId === selectedCellId) ?? null,
        [entries, selectedCellId],
    );

    const today = useMemo(() => formatHeaderDate(), []);
    const scopeLabel = selection?.lineName ?? "All lines";

    return (
        <section className="flex h-full flex-col gap-6 p-6">
            <SectionHeader
                label="Equipment"
                size="lg"
                meta={
                    <span>
                        {scopeLabel} · {today}
                    </span>
                }
            />
            <Hairline />

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
                <CellListPanel
                    entries={filtered}
                    statusMap={statusMap}
                    selectedCellId={selectedCellId}
                    onSelect={setSelectedCellId}
                    search={search}
                    onSearchChange={setSearch}
                    isLoading={entriesLoading}
                    totalCount={entries.length}
                />
                <DetailPanel
                    cellId={selectedEntry?.cellId ?? null}
                    cellName={selectedEntry?.label ?? null}
                    sublabel={selectedEntry?.sublabel ?? null}
                    statusMap={statusMap}
                />
            </div>
        </section>
    );
}

// ─── Master list ────────────────────────────────────────────────────────────

interface CellListPanelProps {
    entries: ReturnType<typeof useEquipmentList>["entries"];
    statusMap: CellStatusMap;
    selectedCellId: number | null;
    onSelect: (cellId: number) => void;
    search: string;
    onSearchChange: (value: string) => void;
    isLoading: boolean;
    totalCount: number;
}

function CellListPanel({
    entries,
    statusMap,
    selectedCellId,
    onSelect,
    search,
    onSearchChange,
    isLoading,
    totalCount,
}: CellListPanelProps) {
    return (
        <Card padding="none" className="flex min-h-0 flex-col overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-border px-3 py-3">
                <label className="relative">
                    <Icons.Search
                        className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-text-tertiary"
                        aria-hidden
                    />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder="Search cells…"
                        className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-sm text-foreground placeholder:text-text-tertiary focus:border-input focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label="Search equipment"
                    />
                </label>
                <span className="text-[11px] text-text-tertiary">
                    {entries.length} of {totalCount} cells
                </span>
            </div>
            <ul className="flex-1 overflow-auto" aria-label="Equipment cells">
                {isLoading ? (
                    <li className="px-3 py-4 text-sm text-text-tertiary">Loading…</li>
                ) : entries.length === 0 ? (
                    <li className="px-3 py-4 text-sm text-text-tertiary">No cells in scope.</li>
                ) : (
                    entries.map((entry) => {
                        const live = statusMap.get(entry.cellId);
                        const tone = statusFromCategory(live?.status_category);
                        const selected = entry.cellId === selectedCellId;
                        return (
                            <li key={entry.id}>
                                <button
                                    type="button"
                                    onClick={() => onSelect(entry.cellId)}
                                    aria-pressed={selected}
                                    className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                                        selected ? "bg-accent" : "hover:bg-accent/50"
                                    }`}
                                >
                                    <StatusDot status={tone} size={8} />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm text-foreground">
                                            {entry.label}
                                        </div>
                                        <div className="truncate text-[11px] text-text-tertiary">
                                            {entry.sublabel}
                                        </div>
                                    </div>
                                    {live?.status_name && (
                                        <span className="hidden font-mono text-[10px] uppercase text-text-tertiary md:inline">
                                            {live.status_name}
                                        </span>
                                    )}
                                </button>
                            </li>
                        );
                    })
                )}
            </ul>
        </Card>
    );
}

// ─── Detail pane ────────────────────────────────────────────────────────────

interface DetailPanelProps {
    cellId: number | null;
    cellName: string | null;
    sublabel: string | null;
    statusMap: CellStatusMap;
}

function DetailPanel({ cellId, cellName, sublabel, statusMap }: DetailPanelProps) {
    if (cellId == null || cellName == null) {
        return (
            <Card padding="lg" className="flex items-center justify-center">
                <p className="text-sm text-text-tertiary">Select a cell to inspect.</p>
            </Card>
        );
    }

    return (
        <div className="flex min-h-0 flex-col gap-5 overflow-auto pb-4 pr-1">
            <DetailHeader
                cellId={cellId}
                cellName={cellName}
                sublabel={sublabel}
                statusMap={statusMap}
            />
            <KpiCard cellId={cellId} />
            <SignalsCard cellId={cellId} />

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <WorkOrdersCard cellId={cellId} />
                <LogbookCard cellId={cellId} />
            </div>

            <KbCard cellId={cellId} />
        </div>
    );
}

function DetailHeader({
    cellId,
    cellName,
    sublabel,
    statusMap,
}: {
    cellId: number;
    cellName: string;
    sublabel: string | null;
    statusMap: CellStatusMap;
}) {
    const live = statusMap.get(cellId);
    const tone = statusFromCategory(live?.status_category);
    const ago = formatRelative(live?.last_status_change);

    return (
        <Card padding="lg" className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <StatusDot status={tone} /> Live status
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h2 className="text-2xl font-medium tracking-[-0.02em] text-foreground">
                    {cellName}
                </h2>
                <span className="font-mono text-xs text-muted-foreground">cell #{cellId}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
                {sublabel && <span className="text-text-tertiary">{sublabel}</span>}
                <span className="ml-auto flex items-center gap-2">
                    <Badge variant={badgeVariant(tone)} size="sm">
                        {live?.status_name ?? "Unknown"}
                    </Badge>
                    <span className="font-mono text-[11px] text-text-tertiary">
                        {ago === "—" ? "—" : `since ${ago}`}
                    </span>
                </span>
            </div>
        </Card>
    );
}

function KpiCard({ cellId }: { cellId: number }) {
    const data = useKpiData(cellId);
    const tiles = [
        {
            label: "OEE",
            value: data.oee.value != null ? `${data.oee.value.toFixed(1)}%` : "—",
            spark: data.oee.trend ?? undefined,
        },
        {
            label: "MTBF",
            value: data.mtbf.value != null ? formatHours(data.mtbf.value) : "—",
        },
        {
            label: "MTTR",
            value: data.mttr.value != null ? formatMinutes(data.mttr.value) : "—",
        },
        {
            label: "Anomalies 24h",
            value: data.anomalies.value != null ? String(data.anomalies.value) : "—",
        },
    ];

    return (
        <Card padding="lg" className="flex flex-col gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Live KPIs · last 24h
            </span>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {tiles.map((t) => (
                    <div key={t.label} className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">{t.label}</span>
                        <div className="flex items-baseline gap-3">
                            <span
                                className="font-mono text-2xl font-medium tabular-nums text-foreground"
                                style={{ lineHeight: 1 }}
                            >
                                {t.value}
                            </span>
                            {t.spark && t.spark.length > 1 && (
                                <Sparkline values={t.spark} aria-label={`${t.label} trend`} />
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

function SignalsCard({ cellId }: { cellId: number }) {
    const { signals, isLoading } = useCurrentSignals(cellId);

    return (
        <Card padding="md" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Live signals</span>
                <span className="text-[11px] text-text-tertiary">
                    {signals.length > 0 ? `${signals.length} signals · auto-refresh 5s` : ""}
                </span>
            </div>
            {isLoading ? (
                <p className="px-2 py-3 text-sm text-text-tertiary">Loading…</p>
            ) : signals.length === 0 ? (
                <p className="px-2 py-3 text-sm text-text-tertiary">
                    No signal definitions for this cell yet.
                </p>
            ) : (
                <div className="overflow-hidden rounded-md border border-border">
                    <table className="w-full text-sm">
                        <thead className="bg-accent/30 text-[11px] uppercase tracking-wider text-text-tertiary">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">Signal</th>
                                <th className="px-3 py-2 text-right font-medium">Value</th>
                                <th className="px-3 py-2 text-left font-medium">Unit</th>
                                <th className="px-3 py-2 text-right font-medium">Updated</th>
                            </tr>
                        </thead>
                        <tbody>
                            {signals.map((s) => (
                                <tr
                                    key={s.signal_def_id}
                                    className="border-t border-border first:border-t-0"
                                >
                                    <td className="px-3 py-1.5 text-foreground">
                                        {s.display_name ?? s.signal_name}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-foreground">
                                        {formatSignalValue(s.raw_value)}
                                    </td>
                                    <td className="px-3 py-1.5 text-text-tertiary">
                                        {s.unit_name ?? "—"}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-mono text-[11px] text-text-tertiary">
                                        {formatRelative(s.time)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
}

function WorkOrdersCard({ cellId }: { cellId: number }) {
    const wos = useWorkOrders();
    const rows = useMemo(() => {
        const list = wos.data ?? [];
        return list
            .filter(
                (w) => w.cell_id === cellId && w.status !== "completed" && w.status !== "cancelled",
            )
            .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99))
            .slice(0, 5);
    }, [wos.data, cellId]);

    return (
        <Card padding="md" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Active work orders</span>
                <Link
                    to="/work-orders"
                    className="text-xs text-text-tertiary transition-colors hover:text-foreground"
                >
                    View all →
                </Link>
            </div>
            {wos.isPending ? (
                <p className="px-2 py-3 text-sm text-text-tertiary">Loading…</p>
            ) : rows.length === 0 ? (
                <p className="px-2 py-3 text-sm text-text-tertiary">
                    No active work orders for this cell.
                </p>
            ) : (
                <ul className="flex flex-col">
                    {rows.map((w) => (
                        <li key={w.id}>
                            <Link
                                to={`/work-orders/${w.id}`}
                                className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <PriorityDot priority={w.priority} />
                                <span className="line-clamp-1 flex-1 text-sm text-foreground">
                                    {w.title}
                                </span>
                                <Badge variant={woStatusVariant(w.status)} size="sm">
                                    {w.status.replace(/_/g, " ")}
                                </Badge>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

function LogbookCard({ cellId }: { cellId: number }) {
    const entries = useLogbookEntries({ cell_id: cellId, limit: 5 });

    return (
        <Card padding="md" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Recent logbook</span>
                <Link
                    to="/logbook"
                    className="text-xs text-text-tertiary transition-colors hover:text-foreground"
                >
                    Open logbook →
                </Link>
            </div>
            {entries.isPending ? (
                <p className="px-2 py-3 text-sm text-text-tertiary">Loading…</p>
            ) : (entries.data ?? []).length === 0 ? (
                <p className="px-2 py-3 text-sm text-text-tertiary">
                    No entries for this cell yet.
                </p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {(entries.data ?? []).map((e) => (
                        <li
                            key={e.id}
                            className="flex flex-col gap-1 rounded-md border border-border bg-background px-3 py-2"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <Badge
                                    variant={
                                        e.severity === "critical"
                                            ? "critical"
                                            : e.severity === "warning"
                                              ? "warning"
                                              : "default"
                                    }
                                    size="sm"
                                >
                                    {String(e.category)}
                                </Badge>
                                <span className="font-mono text-[11px] text-text-tertiary">
                                    {e.author_username ?? "—"} ·{" "}
                                    {formatRelative(e.entry_time ?? e.created_at)}
                                </span>
                            </div>
                            <p className="line-clamp-2 text-sm text-foreground">{e.content}</p>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

function KbCard({ cellId }: { cellId: number }) {
    const { kb, isLoading } = useEquipmentKb(cellId);

    if (isLoading) {
        return (
            <Card padding="md">
                <p className="text-sm text-text-tertiary">Loading knowledge base…</p>
            </Card>
        );
    }

    if (!kb) {
        return (
            <Card padding="md" className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-foreground">Knowledge base</span>
                    <span className="text-xs text-text-tertiary">
                        No KB extracted yet — onboard this equipment to enable agentic analysis.
                    </span>
                </div>
                <Link
                    to="/onboarding"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground transition-colors hover:border-input hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Icons.Upload className="size-3.5" aria-hidden />
                    Start onboarding
                </Link>
            </Card>
        );
    }

    const thresholds = Object.keys(kb.structured_data?.thresholds ?? {}).length;
    const failures = (kb.structured_data?.failure_patterns ?? []).length;
    const procedures = (kb.structured_data?.maintenance_procedures ?? []).length;
    const completeness = Math.round((kb.confidence_score ?? 0) * 100);

    return (
        <Card padding="md" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Knowledge base</span>
                <Badge variant={kb.onboarding_complete ? "nominal" : "warning"} size="sm">
                    {kb.onboarding_complete ? "Onboarded" : "Incomplete"}
                </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <KbMeta label="Equipment" value={kb.equipment_type ?? "—"} />
                <KbMeta label="Manufacturer" value={kb.manufacturer ?? "—"} />
                <KbMeta label="Model" value={kb.model ?? "—"} />
                <KbMeta label="Confidence" value={`${completeness}%`} />
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs text-text-tertiary">
                <span>{thresholds} thresholds</span>
                <span>{failures} failure patterns</span>
                <span>{procedures} procedures</span>
            </div>
        </Card>
    );
}

function KbMeta({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</span>
            <span className="truncate text-sm text-foreground" title={value}>
                {value}
            </span>
        </div>
    );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function PriorityDot({ priority }: { priority: string }) {
    const status: StatusTone =
        priority === "critical"
            ? "critical"
            : priority === "high"
              ? "warning"
              : priority === "medium"
                ? "unknown"
                : "nominal";
    return <StatusDot status={status} size={6} aria-label={`priority: ${priority}`} />;
}

function badgeVariant(tone: StatusTone): "critical" | "warning" | "nominal" | "default" {
    if (tone === "critical") return "critical";
    if (tone === "warning") return "warning";
    if (tone === "nominal") return "nominal";
    return "default";
}

function woStatusVariant(status: string): "critical" | "warning" | "nominal" | "default" {
    if (status === "detected") return "critical";
    if (status === "in_progress" || status === "analyzed" || status === "open") return "warning";
    if (status === "completed") return "nominal";
    return "default";
}

function formatHours(seconds: number): string {
    const h = seconds / 3600;
    if (h >= 100) return `${Math.round(h)}h`;
    return `${h.toFixed(1)}h`;
}

function formatMinutes(seconds: number): string {
    const m = seconds / 60;
    if (m >= 100) return `${Math.round(m)}min`;
    return `${m.toFixed(1)}min`;
}

function formatSignalValue(v: number | null | undefined): string {
    if (v == null || Number.isNaN(v)) return "—";
    if (Number.isInteger(v)) return String(v);
    const abs = Math.abs(v);
    if (abs >= 1000) return v.toFixed(0);
    if (abs >= 1) return v.toFixed(2);
    return v.toFixed(3);
}

function formatRelative(iso: string | null | undefined): string {
    if (!iso) return "—";
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return "—";
    const diffMs = Date.now() - t;
    const min = Math.floor(diffMs / 60_000);
    if (min < 1) return "now";
    if (min < 60) return `${min}m`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
}
