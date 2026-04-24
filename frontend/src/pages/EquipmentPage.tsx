/**
 * Equipment page — engineer's deep-dive view of one cell.
 *
 * Distinct from the operator-led Dashboard (which lists what to act on
 * across the site), Equipment focuses on **time-series, root cause and
 * reliability physics for a single machine**:
 *
 *   1. Live status header — small, compact.
 *   2. OEE breakdown trend (Availability / Performance / Quality / OEE
 *      lines over the selected window).
 *   3. Signal trend chart — pick any of the cell's signal definitions and
 *      see its raw value over the window. Threshold band overlays the KB
 *      alert range when one is defined.
 *   4. Downtime Pareto — total unplanned-stop seconds grouped by status
 *      reason (the classic 80/20 reliability view).
 *   5. Quality Pareto — non-conformant piece count grouped by quality_name.
 *   6. Compact "recent activity" strip — last 3 work orders + last 3
 *      logbook entries for context, demoted from prime real estate.
 *   7. KB summary footer.
 *
 * Layout: 320 px master rail (cells in scope) + scroll container.
 * No new backend endpoints — everything is derived from existing routes.
 */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
    Badge,
    Card,
    Hairline,
    Icons,
    LineChart,
    type LineChartPoint,
    NativeSelect,
    ParetoChart,
    SectionHeader,
    StatusDot,
} from "../components/ui";
import {
    EQUIPMENT_KEY,
    useEquipmentList,
    validateEquipmentSelection,
} from "../features/control-room";
import {
    type CellStatusMap,
    statusFromCategory,
    type TrendWindow,
    useCellStatuses,
    useDowntimePareto,
    useEquipmentKb,
    useOeeTrend,
    useQualityPareto,
    useSignalDefList,
    useSignalTrend,
} from "../features/equipment";
import { useLogbookEntries } from "../features/logbook";
import { useWorkOrders } from "../features/work-orders";
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
    const [window, setWindow] = useState<TrendWindow>("24h");

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
                    window={window}
                    onWindowChange={setWindow}
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
    window: TrendWindow;
    onWindowChange: (w: TrendWindow) => void;
}

function DetailPanel({
    cellId,
    cellName,
    sublabel,
    statusMap,
    window,
    onWindowChange,
}: DetailPanelProps) {
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
                window={window}
                onWindowChange={onWindowChange}
            />
            <OeeTrendCard cellId={cellId} window={window} />
            <SignalTrendCard cellId={cellId} window={window} />

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <DowntimeParetoCard cellId={cellId} window={window} />
                <QualityParetoCard cellId={cellId} window={window} />
            </div>

            <RecentActivityCard cellId={cellId} />
            <KbCard cellId={cellId} />
        </div>
    );
}

function DetailHeader({
    cellId,
    cellName,
    sublabel,
    statusMap,
    window,
    onWindowChange,
}: {
    cellId: number;
    cellName: string;
    sublabel: string | null;
    statusMap: CellStatusMap;
    window: TrendWindow;
    onWindowChange: (w: TrendWindow) => void;
}) {
    const live = statusMap.get(cellId);
    const tone = statusFromCategory(live?.status_category);
    const ago = formatRelative(live?.last_status_change);

    return (
        <Card padding="md" className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex min-w-0 items-center gap-3">
                <StatusDot status={tone} size={10} />
                <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                        <h2 className="truncate text-lg font-medium tracking-[-0.01em] text-foreground">
                            {cellName}
                        </h2>
                        <span className="font-mono text-[11px] text-text-tertiary">
                            cell #{cellId}
                        </span>
                    </div>
                    {sublabel && (
                        <div className="truncate text-xs text-text-tertiary">{sublabel}</div>
                    )}
                </div>
            </div>
            <div className="ml-auto flex items-center gap-3">
                <Badge variant={badgeVariant(tone)} size="sm">
                    {live?.status_name ?? "Unknown"}
                </Badge>
                <span className="font-mono text-[11px] text-text-tertiary">
                    {ago === "—" ? "—" : `since ${ago}`}
                </span>
                <WindowToggle value={window} onChange={onWindowChange} />
            </div>
        </Card>
    );
}

function WindowToggle({
    value,
    onChange,
}: {
    value: TrendWindow;
    onChange: (w: TrendWindow) => void;
}) {
    return (
        <div className="inline-flex overflow-hidden rounded-md border border-border">
            {(["1h", "24h"] as const).map((w) => {
                const active = value === w;
                return (
                    <button
                        key={w}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(w)}
                        className={`px-2.5 py-1 text-xs transition-colors ${
                            active
                                ? "bg-foreground text-background"
                                : "bg-background text-text-tertiary hover:bg-accent"
                        }`}
                    >
                        Last {w}
                    </button>
                );
            })}
        </div>
    );
}

// ─── OEE trend ─────────────────────────────────────────────────────────────

const OEE_LINES: Array<{
    key: "availability" | "performance" | "quality" | "oee";
    label: string;
    color: string;
}> = [
    { key: "availability", label: "Availability", color: "var(--text-tertiary)" },
    { key: "performance", label: "Performance", color: "var(--muted-foreground)" },
    { key: "quality", label: "Quality", color: "var(--foreground)" },
    { key: "oee", label: "OEE", color: "var(--primary)" },
];

function OeeTrendCard({ cellId, window }: { cellId: number; window: TrendWindow }) {
    const { points, isLoading } = useOeeTrend(cellId, window);
    const [active, setActive] = useState<(typeof OEE_LINES)[number]["key"]>("oee");

    const chartData = useMemo<LineChartPoint[]>(
        () =>
            points
                .filter((p) => p[active] != null)
                .map((p) => ({
                    x: new Date(p.bucket).getTime(),
                    y: ((p[active] as number) ?? 0) * 100,
                })),
        [points, active],
    );

    return (
        <Card padding="md" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">OEE breakdown</span>
                <div className="inline-flex flex-wrap gap-1">
                    {OEE_LINES.map((l) => {
                        const sel = l.key === active;
                        return (
                            <button
                                key={l.key}
                                type="button"
                                aria-pressed={sel}
                                onClick={() => setActive(l.key)}
                                className={`rounded-md border px-2 py-0.5 text-[11px] transition-colors ${
                                    sel
                                        ? "border-foreground bg-foreground text-background"
                                        : "border-border bg-background text-text-tertiary hover:bg-accent"
                                }`}
                            >
                                {l.label}
                            </button>
                        );
                    })}
                </div>
            </div>
            {isLoading ? (
                <p className="px-2 py-6 text-sm text-text-tertiary">Loading trend…</p>
            ) : (
                <LineChart
                    data={chartData}
                    height={180}
                    color={OEE_LINES.find((l) => l.key === active)?.color ?? "var(--primary)"}
                    aria-label={`${active} over last ${window}`}
                />
            )}
        </Card>
    );
}

// ─── Signal trend ──────────────────────────────────────────────────────────

function SignalTrendCard({ cellId, window }: { cellId: number; window: TrendWindow }) {
    const { definitions, isLoading: defsLoading } = useSignalDefList(cellId);
    const [signalDefId, setSignalDefId] = useState<number | null>(null);

    // Auto-select the first signal whenever the cell changes.
    useEffect(() => {
        if (definitions.length === 0) {
            if (signalDefId !== null) setSignalDefId(null);
            return;
        }
        if (signalDefId == null || !definitions.some((d) => d.id === signalDefId)) {
            setSignalDefId(definitions[0]?.id ?? null);
        }
    }, [definitions, signalDefId]);

    const { points, isLoading: trendLoading } = useSignalTrend(signalDefId, window);
    const { kb } = useEquipmentKb(cellId);

    const activeDef = definitions.find((d) => d.id === signalDefId) ?? null;

    // Pull the threshold band from the KB if a matching key exists. KB
    // thresholds are keyed by `kb_threshold_key` strings (e.g.
    // "bearing_temperature_high"); we do a soft lookup by display-name
    // similarity since signal_def doesn't carry the KB key directly.
    const thresholdBand = useMemo<[number, number] | null>(() => {
        if (!activeDef || !kb?.structured_data?.thresholds) return null;
        const target = activeDef.display_name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
        for (const [key, t] of Object.entries(kb.structured_data.thresholds)) {
            if (key.toLowerCase().includes(target) || target.includes(key.toLowerCase())) {
                const lo = t.low_alert ?? t.nominal ?? null;
                const hi = t.high_alert ?? t.alert ?? t.trip ?? null;
                if (typeof lo === "number" && typeof hi === "number" && hi > lo) {
                    return [lo, hi];
                }
            }
        }
        return null;
    }, [activeDef, kb]);

    return (
        <Card padding="md" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">Signal trend</span>
                {definitions.length > 0 && (
                    <NativeSelect
                        value={signalDefId ?? ""}
                        onChange={(e) => setSignalDefId(Number(e.target.value))}
                        aria-label="Signal"
                        className="h-7 min-w-[180px] text-xs"
                    >
                        {definitions.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.display_name}
                                {d.unit_name ? ` (${d.unit_name})` : ""}
                            </option>
                        ))}
                    </NativeSelect>
                )}
            </div>
            {defsLoading ? (
                <p className="px-2 py-6 text-sm text-text-tertiary">Loading signals…</p>
            ) : definitions.length === 0 ? (
                <p className="px-2 py-6 text-sm text-text-tertiary">
                    No signal definitions for this cell.
                </p>
            ) : trendLoading ? (
                <p className="px-2 py-6 text-sm text-text-tertiary">Loading trend…</p>
            ) : (
                <>
                    <LineChart
                        data={points}
                        height={200}
                        thresholdBand={thresholdBand}
                        aria-label={`${activeDef?.display_name ?? "signal"} over last ${window}`}
                    />
                    {thresholdBand && (
                        <p className="text-[11px] text-text-tertiary">
                            Shaded band = KB alert range [{thresholdBand[0]} – {thresholdBand[1]}
                            {activeDef?.unit_name ? ` ${activeDef.unit_name}` : ""}]
                        </p>
                    )}
                </>
            )}
        </Card>
    );
}

// ─── Pareto cards ──────────────────────────────────────────────────────────

function DowntimeParetoCard({ cellId, window }: { cellId: number; window: TrendWindow }) {
    const { entries, isLoading } = useDowntimePareto(cellId, window);

    return (
        <Card padding="md" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                    Downtime Pareto · last {window}
                </span>
                <span className="text-[11px] text-text-tertiary">unplanned stops</span>
            </div>
            {isLoading ? (
                <p className="px-2 py-3 text-sm text-text-tertiary">Loading…</p>
            ) : (
                <ParetoChart
                    data={entries.map((e) => ({
                        label: e.label,
                        value: e.seconds,
                        display: formatDuration(e.seconds),
                    }))}
                    color="var(--critical, #dc2626)"
                    emptyText="No unplanned stops in this window."
                    aria-label="Downtime Pareto"
                />
            )}
        </Card>
    );
}

function QualityParetoCard({ cellId, window }: { cellId: number; window: TrendWindow }) {
    const { entries, isLoading } = useQualityPareto(cellId, window);

    return (
        <Card padding="md" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                    Quality Pareto · last {window}
                </span>
                <span className="text-[11px] text-text-tertiary">non-conformant pieces</span>
            </div>
            {isLoading ? (
                <p className="px-2 py-3 text-sm text-text-tertiary">Loading…</p>
            ) : (
                <ParetoChart
                    data={entries.map((e) => ({
                        label: e.label,
                        value: e.count,
                        display: `${e.count}`,
                    }))}
                    color="var(--warning, #f59e0b)"
                    emptyText="No defects in this window."
                    aria-label="Quality Pareto"
                />
            )}
        </Card>
    );
}

// ─── Recent activity strip ────────────────────────────────────────────────

function RecentActivityCard({ cellId }: { cellId: number }) {
    const wos = useWorkOrders();
    const logbook = useLogbookEntries({ cell_id: cellId, limit: 3 });

    const cellWos = useMemo(
        () =>
            (wos.data ?? [])
                .filter(
                    (w) =>
                        w.cell_id === cellId &&
                        w.status !== "completed" &&
                        w.status !== "cancelled",
                )
                .slice(0, 3),
        [wos.data, cellId],
    );

    return (
        <Card padding="md" className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Recent work orders
                    </span>
                    <Link
                        to="/work-orders"
                        className="text-xs text-text-tertiary hover:text-foreground"
                    >
                        All →
                    </Link>
                </div>
                {cellWos.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-text-tertiary">No active orders.</p>
                ) : (
                    cellWos.map((w) => (
                        <Link
                            key={w.id}
                            to={`/work-orders/${w.id}`}
                            className="flex items-center gap-2 truncate rounded px-1 py-1 text-sm text-foreground hover:bg-accent"
                        >
                            <StatusDot status={priorityTone(w.priority)} size={6} />
                            <span className="truncate">{w.title}</span>
                        </Link>
                    ))
                )}
            </div>
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Recent logbook
                    </span>
                    <Link
                        to="/logbook"
                        className="text-xs text-text-tertiary hover:text-foreground"
                    >
                        All →
                    </Link>
                </div>
                {(logbook.data ?? []).length === 0 ? (
                    <p className="px-1 py-2 text-xs text-text-tertiary">No entries.</p>
                ) : (
                    (logbook.data ?? []).map((e) => (
                        <div key={e.id} className="flex flex-col gap-0.5 rounded px-1 py-1 text-sm">
                            <span className="line-clamp-1 text-foreground">{e.content}</span>
                            <span className="font-mono text-[10px] text-text-tertiary">
                                {e.author_username ?? "—"} ·{" "}
                                {formatRelative(e.entry_time ?? e.created_at)}
                            </span>
                        </div>
                    ))
                )}
            </div>
        </Card>
    );
}

// ─── KB summary ────────────────────────────────────────────────────────────

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

    const failures = kb.structured_data?.failure_patterns ?? [];
    const procedures = kb.structured_data?.maintenance_procedures ?? [];
    const thresholds = Object.keys(kb.structured_data?.thresholds ?? {}).length;

    return (
        <Card padding="md" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                    Failure patterns &amp; procedures
                </span>
                <Badge variant={kb.onboarding_complete ? "nominal" : "warning"} size="sm">
                    {kb.onboarding_complete ? "Onboarded" : "Incomplete"}
                </Badge>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
                        Known failure modes ({failures.length})
                    </span>
                    {failures.length === 0 ? (
                        <p className="text-xs text-text-tertiary">None recorded.</p>
                    ) : (
                        <ul className="flex flex-col gap-1 text-xs">
                            {failures.slice(0, 5).map((f, idx) => (
                                <li
                                    // biome-ignore lint/suspicious/noArrayIndexKey: KB failure entries lack stable IDs; index disambiguates duplicate modes
                                    key={`${f.mode}-${idx}`}
                                    className="rounded border border-border bg-background px-2 py-1.5"
                                >
                                    <div className="text-foreground">{f.mode}</div>
                                    {f.symptoms && (
                                        <div className="text-text-tertiary">{f.symptoms}</div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-text-tertiary">
                        Maintenance procedures ({procedures.length})
                    </span>
                    {procedures.length === 0 ? (
                        <p className="text-xs text-text-tertiary">None recorded.</p>
                    ) : (
                        <ul className="flex flex-col gap-1 text-xs">
                            {procedures.slice(0, 5).map((p, idx) => (
                                <li
                                    // biome-ignore lint/suspicious/noArrayIndexKey: KB procedure entries lack stable IDs; index disambiguates duplicate actions
                                    key={`${p.action}-${idx}`}
                                    className="flex items-baseline justify-between gap-2 rounded border border-border bg-background px-2 py-1.5"
                                >
                                    <span className="truncate text-foreground">{p.action}</span>
                                    {p.interval_months != null && (
                                        <span className="font-mono text-[10px] text-text-tertiary">
                                            {p.interval_months} mo
                                        </span>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
            <div className="text-[11px] text-text-tertiary">
                {thresholds} thresholds · confidence {Math.round((kb.confidence_score ?? 0) * 100)}%
            </div>
        </Card>
    );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function priorityTone(priority: string): StatusTone {
    if (priority === "critical") return "critical";
    if (priority === "high") return "warning";
    if (priority === "medium") return "unknown";
    return "nominal";
}

function badgeVariant(tone: StatusTone): "critical" | "warning" | "nominal" | "default" {
    if (tone === "critical") return "critical";
    if (tone === "warning") return "warning";
    if (tone === "nominal") return "nominal";
    return "default";
}

function formatDuration(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const min = seconds / 60;
    if (min < 60) return `${min.toFixed(1)}min`;
    const h = min / 60;
    if (h < 24) return `${h.toFixed(1)}h`;
    const d = h / 24;
    return `${d.toFixed(1)}d`;
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
