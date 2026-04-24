/**
 * Control room — operator landing dashboard.
 *
 * Composes the most actionable reads from across the platform:
 *   - Hero strip: current shift card + site status pill
 *   - KPI tiles row (OEE / MTBF / MTTR / Anomalies 24h, scoped to selection)
 *   - Open anomalies (top 5)
 *   - Active work orders (top 5)
 *   - Recent logbook (last 3)
 *   - Quick actions
 *
 * Equipment grid was extracted to `/equipment`. This page is the operator's
 * "first look" when they sign in.
 */

import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Card, Hairline, Icons, SectionHeader, StatusDot } from "../components/ui";
import {
    EQUIPMENT_KEY,
    Sparkline,
    useKpiData,
    validateEquipmentSelection,
} from "../features/control-room";
import { useLogbookEntries } from "../features/logbook";
import { useCurrentShift } from "../features/shifts";
import { formatShiftRange, formatTimeRemaining, operatorDisplay } from "../features/shifts/utils";
import { PRIORITY_RANK, useWorkOrders } from "../features/work-orders";
import { formatHeaderDate } from "../lib/date";
import type { EquipmentSelection } from "../lib/hierarchy";
import { useLocalStorage } from "../lib/useLocalStorage";

export default function DashboardPage() {
    const [selection] = useLocalStorage<EquipmentSelection | null>(EQUIPMENT_KEY, null, {
        validator: validateEquipmentSelection,
    });

    const today = useMemo(() => formatHeaderDate(), []);
    const scopeLabel = selection ? selection.cellName : "Select a cell to scope";

    return (
        <section className="flex h-full flex-col gap-6 p-6">
            <SectionHeader
                label="Dashboard"
                size="lg"
                meta={
                    <span>
                        {scopeLabel} · {today}
                    </span>
                }
            />
            <Hairline />

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto pb-4">
                <HeroStrip selection={selection} />
                <KpiCard selection={selection} />

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <AnomaliesCard />
                    <ActiveWorkOrdersCard />
                </div>

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_1fr]">
                    <RecentLogbookCard selection={selection} />
                    <QuickActionsCard />
                </div>
            </div>
        </section>
    );
}

// ─── Hero strip ─────────────────────────────────────────────────────────────

function HeroStrip({ selection }: { selection: EquipmentSelection | null }) {
    const shift = useCurrentShift();
    const wos = useWorkOrders();

    const openCritical = useMemo(() => {
        const list = wos.data ?? [];
        return list.filter(
            (w) =>
                w.priority === "critical" && w.status !== "completed" && w.status !== "cancelled",
        ).length;
    }, [wos.data]);

    const status: "nominal" | "warning" | "critical" =
        openCritical > 0
            ? "critical"
            : (wos.data ?? []).some((w) => w.status === "detected")
              ? "warning"
              : "nominal";

    const statusLabel =
        status === "critical"
            ? `${openCritical} critical open`
            : status === "warning"
              ? "Anomalies detected"
              : "All systems nominal";

    const data = shift.data;
    const operatorName = data ? operatorDisplay(data.assignments) : "—";
    const remaining = data ? formatTimeRemaining(data, Date.now()) : "—";
    const range = data?.shift ? formatShiftRange(data.shift) : "—";
    const shiftName = data?.shift?.name ?? "Off-shift";

    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
            <Card padding="lg" className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    <StatusDot status="nominal" /> Current shift
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                    <h2 className="text-2xl font-medium tracking-[-0.02em] text-foreground">
                        {shiftName}
                    </h2>
                    <span className="font-mono text-xs text-muted-foreground">
                        {range} · {remaining}
                    </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    <Icons.User className="size-3.5 text-text-tertiary" aria-hidden />
                    <span className="text-foreground">{operatorName}</span>
                    {selection && (
                        <span className="ml-auto text-xs text-text-tertiary">
                            {selection.siteName} · {selection.areaName} · {selection.lineName}
                        </span>
                    )}
                </div>
            </Card>

            <Card padding="lg" className="flex flex-col gap-2">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Site status
                </div>
                <div className="flex items-center gap-3">
                    <StatusDot status={status} size={10} />
                    <span className="text-lg font-medium tracking-[-0.01em] text-foreground">
                        {statusLabel}
                    </span>
                </div>
                <div className="mt-auto text-xs text-text-tertiary">
                    Live status derived from open work orders
                </div>
            </Card>
        </div>
    );
}

// ─── KPI card ───────────────────────────────────────────────────────────────

function KpiCard({ selection }: { selection: EquipmentSelection | null }) {
    const data = useKpiData(selection?.cellId ?? null);

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
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Live KPIs · last 24h
                </span>
                {!selection && (
                    <span className="text-xs text-text-tertiary">
                        Pick a cell in the topbar to enable
                    </span>
                )}
            </div>
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

// ─── Anomalies card ─────────────────────────────────────────────────────────

function AnomaliesCard() {
    const navigate = useNavigate();
    const wos = useWorkOrders();
    const rows = useMemo(() => {
        const list = wos.data ?? [];
        return list
            .filter(
                (w) => w.generated_by_agent && w.status !== "completed" && w.status !== "cancelled",
            )
            .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99))
            .slice(0, 5);
    }, [wos.data]);

    return (
        <Card padding="md" className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">Open anomalies</span>
                <Link
                    to="/anomalies"
                    className="text-xs text-text-tertiary transition-colors hover:text-foreground"
                >
                    View all →
                </Link>
            </div>
            {wos.isPending ? (
                <EmptyRow text="Loading…" />
            ) : rows.length === 0 ? (
                <EmptyRow text="No open anomalies. All clear." />
            ) : (
                <ul className="flex flex-col">
                    {rows.map((w) => (
                        <li key={w.id}>
                            <button
                                type="button"
                                onClick={() => navigate(`/work-orders/${w.id}`)}
                                className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <PriorityDot priority={w.priority} />
                                <span className="line-clamp-1 flex-1 text-sm text-foreground">
                                    {w.title}
                                </span>
                                <span className="hidden text-xs text-text-tertiary md:inline">
                                    {w.cell_name ?? `#${w.cell_id}`}
                                </span>
                                <Badge variant={statusVariant(w.status)} size="sm">
                                    {w.status.replace(/_/g, " ")}
                                </Badge>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

// ─── Active work orders card ────────────────────────────────────────────────

function ActiveWorkOrdersCard() {
    const navigate = useNavigate();
    const wos = useWorkOrders();
    const rows = useMemo(() => {
        const list = wos.data ?? [];
        return list
            .filter((w) => w.status !== "completed" && w.status !== "cancelled")
            .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99))
            .slice(0, 5);
    }, [wos.data]);

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
                <EmptyRow text="Loading…" />
            ) : rows.length === 0 ? (
                <EmptyRow text="No active work orders." />
            ) : (
                <ul className="flex flex-col">
                    {rows.map((w) => (
                        <li key={w.id}>
                            <button
                                type="button"
                                onClick={() => navigate(`/work-orders/${w.id}`)}
                                className="group flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <PriorityDot priority={w.priority} />
                                <span className="line-clamp-1 flex-1 text-sm text-foreground">
                                    {w.title}
                                </span>
                                <span className="hidden font-mono text-[11px] text-text-tertiary md:inline">
                                    {formatRelative(w.created_at)}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

// ─── Recent logbook ─────────────────────────────────────────────────────────

function RecentLogbookCard({ selection }: { selection: EquipmentSelection | null }) {
    const entries = useLogbookEntries({ limit: 3, cell_id: selection?.cellId });

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
                <EmptyRow text="Loading…" />
            ) : (entries.data ?? []).length === 0 ? (
                <EmptyRow text="No entries yet." />
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

// ─── Quick actions ──────────────────────────────────────────────────────────

function QuickActionsCard() {
    return (
        <Card padding="md" className="flex flex-col gap-3">
            <span className="text-sm font-medium text-foreground">Quick actions</span>
            <div className="flex flex-col gap-2">
                <ActionLink to="/workspace" icon={Icons.Sparkles} label="Open agent workspace" />
                <ActionLink to="/equipment" icon={Icons.CircleDot} label="Browse equipment" />
                <ActionLink to="/logbook" icon={Icons.BookOpen} label="Add logbook entry" />
                <ActionLink to="/work-orders" icon={Icons.Wrench} label="Review work orders" />
            </div>
        </Card>
    );
}

function ActionLink({
    to,
    icon: Icon,
    label,
}: {
    to: string;
    icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
    label: string;
}) {
    return (
        <Link
            to={to}
            className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:border-input hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            <span className="flex-1">{label}</span>
            <Icons.ArrowRight className="size-3.5 text-text-tertiary" aria-hidden />
        </Link>
    );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function EmptyRow({ text }: { text: string }) {
    return <p className="px-2 py-3 text-sm text-text-tertiary">{text}</p>;
}

function PriorityDot({ priority }: { priority: string }) {
    const status: "critical" | "warning" | "nominal" | "unknown" =
        priority === "critical"
            ? "critical"
            : priority === "high"
              ? "warning"
              : priority === "medium"
                ? "unknown"
                : "nominal";
    return <StatusDot status={status} size={6} aria-label={`priority: ${priority}`} />;
}

function statusVariant(status: string): "critical" | "warning" | "nominal" | "default" {
    if (status === "detected") return "critical";
    if (status === "in_progress" || status === "analyzed" || status === "open") return "warning";
    if (status === "completed") return "nominal";
    return "default";
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
