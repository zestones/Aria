import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AriaMark, Badge, Card, Icons, SectionHeader, ThemeToggle } from "../../components/ui";
import { apiFetch } from "../../lib/api";
import { getUser, logout } from "../../services/auth";

interface CellStatus {
    cell_id: number;
    cell_name: string;
    line_name?: string;
    status_name?: string;
    status_category?: string;
    is_productive?: boolean;
    last_status_change?: string;
}

interface CurrentSignal {
    cell_id: number;
    cell_name: string;
    signal_def_id: number;
    signal_name: string;
    display_name?: string;
    unit_name?: string;
    raw_value: number;
    time: string;
}

interface OeeRow {
    cell_id: number;
    cell_name?: string;
    oee: number;
    availability: number;
    performance: number;
    quality: number;
    good_pieces?: number;
    total_pieces?: number;
}

interface WorkOrder {
    id: number;
    title: string;
    priority: string;
    status: string;
    cell_id: number;
    created_at: string;
}

interface LogbookEntry {
    id: number;
    cell_id: number;
    cell_name?: string;
    category: string;
    severity: string;
    title: string;
    body?: string;
    created_at: string;
    author_username?: string;
}

interface TreeNode {
    id: number;
    name: string;
    children?: TreeNode[];
}

const NOW = () => new Date().toISOString();
const MINUTES_AGO = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function Pre({ value }: { value: unknown }) {
    return (
        <pre className="max-h-64 overflow-auto rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] p-2 font-mono text-[var(--ds-text-xs)] text-[var(--ds-fg-primary)]">
            {JSON.stringify(value, null, 2)}
        </pre>
    );
}

function Loading() {
    return <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">Loading…</p>;
}

function ErrorLine({ error }: { error: unknown }) {
    return (
        <p className="text-[var(--ds-text-sm)] text-[var(--ds-status-critical)]">
            {error instanceof Error ? error.message : "Request failed."}
        </p>
    );
}

function Empty({ label }: { label: string }) {
    return <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">{label}</p>;
}

export default function DataInspector() {
    const navigate = useNavigate();
    const user = getUser();

    const window_start = MINUTES_AGO(60);
    const window_end = NOW();

    const tree = useQuery({
        queryKey: ["hierarchy", "tree"],
        queryFn: () => apiFetch<TreeNode[]>("/hierarchy/tree"),
    });

    const status = useQuery({
        queryKey: ["monitoring", "current"],
        queryFn: () => apiFetch<CellStatus[]>("/monitoring/status/current"),
        refetchInterval: 5_000,
    });

    const cellIds = (status.data ?? []).map((c) => c.cell_id);

    const signals = useQuery({
        queryKey: ["signals", "current", cellIds],
        enabled: cellIds.length > 0,
        queryFn: () =>
            apiFetch<CurrentSignal[]>("/signals/current", { params: { cell_ids: cellIds } }),
        refetchInterval: 5_000,
    });

    const oee = useQuery({
        queryKey: ["kpi", "oee", cellIds],
        enabled: cellIds.length > 0,
        queryFn: () =>
            apiFetch<OeeRow[]>("/kpi/oee", {
                params: { cell_ids: cellIds, window_start, window_end },
            }),
        refetchInterval: 15_000,
    });

    const workOrders = useQuery({
        queryKey: ["work-orders"],
        queryFn: () => apiFetch<WorkOrder[]>("/work-orders"),
    });

    const logbook = useQuery({
        queryKey: ["logbook", cellIds],
        enabled: cellIds.length > 0,
        queryFn: () =>
            apiFetch<LogbookEntry[]>("/logbook", {
                params: { window_start, window_end, limit: 20 },
            }),
    });

    const currentShift = useQuery({
        queryKey: ["shifts", "current"],
        queryFn: () => apiFetch<unknown>("/shifts/current"),
    });

    async function handleLogout() {
        await logout();
        navigate("/login", { replace: true });
    }

    return (
        <div className="min-h-full bg-[var(--ds-bg-base)]">
            <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-[var(--ds-border)] bg-[var(--ds-bg-base)] px-6">
                <div className="flex items-center gap-2.5">
                    <AriaMark size={20} />
                    <span className="text-[var(--ds-text-md)] font-semibold tracking-[-0.01em] text-[var(--ds-fg-primary)]">
                        ARIA
                    </span>
                </div>
                <span className="h-5 w-px flex-none bg-[var(--ds-border)]" aria-hidden />
                <span className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                    Data explorer
                </span>

                <div className="ml-auto flex items-center gap-3 text-[var(--ds-text-sm)]">
                    {user && (
                        <span className="hidden items-baseline gap-1.5 sm:inline-flex">
                            <span className="font-medium text-[var(--ds-fg-primary)]">
                                {user.username}
                            </span>
                            <span className="text-[var(--ds-fg-subtle)]">·</span>
                            <span className="text-[var(--ds-fg-muted)]">{user.role}</span>
                        </span>
                    )}
                    <ThemeToggle />
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-surface)] px-2.5 text-[var(--ds-text-sm)] font-medium text-[var(--ds-fg-muted)] transition-colors duration-[var(--ds-motion-fast)] hover:border-[var(--ds-border-strong)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-fg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)]"
                    >
                        <Icons.LogOut className="size-3.5" />
                        Logout
                    </button>
                </div>
            </header>

            <main className="px-6 pt-8 pb-10">
                <SectionHeader
                    label="Data explorer"
                    size="lg"
                    meta={<span>Last 60 min · auto-refresh 5s</span>}
                />

                <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <Card>
                        <SectionHeader label="Current cell status" size="sm" className="mb-3" />
                        {status.isLoading && <Loading />}
                        {status.error && <ErrorLine error={status.error} />}
                        {status.data && (
                            <table className="w-full text-[var(--ds-text-sm)]">
                                <thead>
                                    <tr className="text-left text-[var(--ds-text-xs)] font-medium text-[var(--ds-fg-muted)]">
                                        <th className="py-1 pr-2">Cell</th>
                                        <th className="py-1 pr-2">Line</th>
                                        <th className="py-1 pr-2">Status</th>
                                        <th className="py-1">Since</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {status.data.map((c) => (
                                        <tr
                                            key={c.cell_id}
                                            className="border-t border-[var(--ds-border)]"
                                        >
                                            <td className="py-1.5 pr-2 font-medium text-[var(--ds-fg-primary)]">
                                                {c.cell_name}
                                            </td>
                                            <td className="py-1.5 pr-2 text-[var(--ds-fg-muted)]">
                                                {c.line_name ?? "—"}
                                            </td>
                                            <td className="py-1.5 pr-2">
                                                <Badge
                                                    variant={
                                                        c.is_productive ? "nominal" : "default"
                                                    }
                                                >
                                                    {c.status_name ?? "?"}
                                                </Badge>
                                            </td>
                                            <td className="py-1.5 text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
                                                {c.last_status_change
                                                    ? new Date(
                                                          c.last_status_change,
                                                      ).toLocaleTimeString()
                                                    : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </Card>

                    <Card>
                        <SectionHeader label="Current process signals" size="sm" className="mb-3" />
                        {signals.isLoading && <Loading />}
                        {signals.error && <ErrorLine error={signals.error} />}
                        {signals.data && (
                            <table className="w-full text-[var(--ds-text-sm)]">
                                <thead>
                                    <tr className="text-left text-[var(--ds-text-xs)] font-medium text-[var(--ds-fg-muted)]">
                                        <th className="py-1 pr-2">Signal</th>
                                        <th className="py-1 pr-2 text-right">Value</th>
                                        <th className="py-1 pr-2">Unit</th>
                                        <th className="py-1">At</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {signals.data.map((s) => (
                                        <tr
                                            key={s.signal_def_id}
                                            className="border-t border-[var(--ds-border)]"
                                        >
                                            <td className="py-1.5 pr-2 text-[var(--ds-fg-primary)]">
                                                {s.display_name ?? s.signal_name}
                                            </td>
                                            <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-[var(--ds-fg-primary)]">
                                                {s.raw_value.toFixed(2)}
                                            </td>
                                            <td className="py-1.5 pr-2 text-[var(--ds-fg-muted)]">
                                                {s.unit_name ?? "—"}
                                            </td>
                                            <td className="py-1.5 text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
                                                {new Date(s.time).toLocaleTimeString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </Card>

                    <Card>
                        <SectionHeader
                            label="OEE"
                            size="sm"
                            meta={<span>Last 60 min</span>}
                            className="mb-3"
                        />
                        {oee.isLoading && <Loading />}
                        {oee.error && <ErrorLine error={oee.error} />}
                        {oee.data && oee.data.length === 0 && <Empty label="No data." />}
                        {oee.data && oee.data.length > 0 && (
                            <div className="grid grid-cols-4 gap-3">
                                {(["oee", "availability", "performance", "quality"] as const).map(
                                    (k) => (
                                        <div
                                            key={k}
                                            className="rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] p-3 text-center"
                                        >
                                            <div className="text-[var(--ds-text-xs)] font-medium text-[var(--ds-fg-muted)]">
                                                {labelFor(k)}
                                            </div>
                                            <div className="mt-1 font-mono text-[var(--ds-text-2xl)] font-semibold tabular-nums text-[var(--ds-fg-primary)]">
                                                {(Number(oee.data[0][k] ?? 0) * 100).toFixed(1)}%
                                            </div>
                                        </div>
                                    ),
                                )}
                            </div>
                        )}
                    </Card>

                    <Card>
                        <SectionHeader label="Current shift" size="sm" className="mb-3" />
                        {currentShift.isLoading && <Loading />}
                        {currentShift.error && <ErrorLine error={currentShift.error} />}
                        {currentShift.data ? <Pre value={currentShift.data} /> : null}
                    </Card>

                    <Card>
                        <SectionHeader label="Hierarchy tree" size="sm" className="mb-3" />
                        {tree.isLoading && <Loading />}
                        {tree.error && <ErrorLine error={tree.error} />}
                        {tree.data && <Pre value={tree.data} />}
                    </Card>

                    <Card>
                        <SectionHeader label="Work orders" size="sm" className="mb-3" />
                        {workOrders.isLoading && <Loading />}
                        {workOrders.error && <ErrorLine error={workOrders.error} />}
                        {workOrders.data && workOrders.data.length === 0 && (
                            <Empty label="No work orders yet." />
                        )}
                        {workOrders.data && workOrders.data.length > 0 && (
                            <ul className="space-y-2 text-[var(--ds-text-sm)]">
                                {workOrders.data.map((w) => (
                                    <li
                                        key={w.id}
                                        className="flex items-center justify-between gap-3 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] p-2.5"
                                    >
                                        <span className="font-medium text-[var(--ds-fg-primary)]">
                                            {w.title}
                                        </span>
                                        <span className="text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
                                            {w.priority} · {w.status}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    <Card className="lg:col-span-2">
                        <SectionHeader
                            label="Logbook"
                            size="sm"
                            meta={<span>Last 60 min</span>}
                            className="mb-3"
                        />
                        {logbook.isLoading && <Loading />}
                        {logbook.error && <ErrorLine error={logbook.error} />}
                        {logbook.data && logbook.data.length === 0 && <Empty label="No entries." />}
                        {logbook.data && logbook.data.length > 0 && (
                            <ul className="space-y-3 text-[var(--ds-text-sm)]">
                                {logbook.data.map((l) => (
                                    <li
                                        key={l.id}
                                        className="border-l-2 border-[var(--ds-border-strong)] pl-3"
                                    >
                                        <div className="flex items-baseline justify-between gap-3">
                                            <span className="font-medium text-[var(--ds-fg-primary)]">
                                                {l.title}
                                            </span>
                                            <span className="text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
                                                {l.category} · {l.severity}
                                            </span>
                                        </div>
                                        <p className="text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
                                            {l.cell_name ?? `cell #${l.cell_id}`} ·{" "}
                                            {new Date(l.created_at).toLocaleString()} ·{" "}
                                            {l.author_username ?? "—"}
                                        </p>
                                        {l.body && (
                                            <p className="mt-1 text-[var(--ds-text-xs)] text-[var(--ds-fg-primary)]">
                                                {l.body}
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>
                </div>
            </main>
        </div>
    );
}

function labelFor(key: "oee" | "availability" | "performance" | "quality"): string {
    switch (key) {
        case "oee":
            return "OEE";
        case "availability":
            return "Availability";
        case "performance":
            return "Performance";
        case "quality":
            return "Quality";
    }
}
