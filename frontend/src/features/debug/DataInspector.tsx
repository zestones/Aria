import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { AriaMark, Badge, Card, Icons, SectionHeader, ThemeToggle } from "../../components/ui";
import { getUser, logout } from "../../services/auth";
import { getHierarchyTree } from "../../services/hierarchy";
import { getOee } from "../../services/kpi";
import { listLogbookEntries } from "../../services/logbook";
import { getCurrentStatus } from "../../services/monitoring";
import { getCurrentShift } from "../../services/shift";
import { getCurrentSignals } from "../../services/signals";
import { listWorkOrders } from "../../services/work-orders";

const NOW = () => new Date().toISOString();
const MINUTES_AGO = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function Pre({ value }: { value: unknown }) {
    return (
        <pre className="max-h-64 overflow-auto rounded-md border border-border bg-muted p-2 font-mono text-xs text-foreground">
            {JSON.stringify(value, null, 2)}
        </pre>
    );
}

function Loading() {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
}

function ErrorLine({ error }: { error: unknown }) {
    return (
        <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Request failed."}
        </p>
    );
}

function Empty({ label }: { label: string }) {
    return <p className="text-sm text-muted-foreground">{label}</p>;
}

export default function DataInspector() {
    const navigate = useNavigate();
    const user = getUser();

    const window_start = MINUTES_AGO(60);
    const window_end = NOW();

    const tree = useQuery({
        queryKey: ["hierarchy", "tree"],
        queryFn: () => getHierarchyTree(),
    });

    const status = useQuery({
        queryKey: ["monitoring", "current"],
        queryFn: () => getCurrentStatus(),
        refetchInterval: 5_000,
    });

    const cellIds = (status.data ?? []).map((c) => c.cell_id);

    const signals = useQuery({
        queryKey: ["signals", "current", cellIds],
        enabled: cellIds.length > 0,
        queryFn: () => getCurrentSignals(cellIds),
        refetchInterval: 5_000,
    });

    const oee = useQuery({
        queryKey: ["kpi", "oee", cellIds],
        enabled: cellIds.length > 0,
        queryFn: () => getOee({ cell_ids: cellIds, window_start, window_end }),
        refetchInterval: 15_000,
    });

    const workOrders = useQuery({
        queryKey: ["work-orders"],
        queryFn: () => listWorkOrders(),
    });

    const logbook = useQuery({
        queryKey: ["logbook", cellIds],
        enabled: cellIds.length > 0,
        queryFn: () => listLogbookEntries({ window_start, window_end, limit: 20 }),
    });

    const currentShift = useQuery({
        queryKey: ["shifts", "current"],
        queryFn: () => getCurrentShift(),
    });

    async function handleLogout() {
        await logout();
        navigate("/", { replace: true });
    }

    return (
        <div className="min-h-full bg-background">
            <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border bg-background px-6">
                <div className="flex items-center gap-2.5">
                    <AriaMark size={20} />
                    <span className="text-base font-semibold tracking-[-0.01em] text-foreground">
                        ARIA
                    </span>
                </div>
                <span className="h-5 w-px flex-none bg-border" aria-hidden />
                <span className="text-sm text-muted-foreground">Data explorer</span>

                <div className="ml-auto flex items-center gap-3 text-sm">
                    {user && (
                        <span className="hidden items-baseline gap-1.5 sm:inline-flex">
                            <span className="font-medium text-foreground">{user.username}</span>
                            <span className="text-text-tertiary">·</span>
                            <span className="text-muted-foreground">{user.role}</span>
                        </span>
                    )}
                    <ThemeToggle />
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:border-input hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs font-medium text-muted-foreground">
                                        <th className="py-1 pr-2">Cell</th>
                                        <th className="py-1 pr-2">Line</th>
                                        <th className="py-1 pr-2">Status</th>
                                        <th className="py-1">Since</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {status.data.map((c) => (
                                        <tr key={c.cell_id} className="border-t border-border">
                                            <td className="py-1.5 pr-2 font-medium text-foreground">
                                                {c.cell_name}
                                            </td>
                                            <td className="py-1.5 pr-2 text-muted-foreground">
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
                                            <td className="py-1.5 text-xs text-muted-foreground">
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
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-xs font-medium text-muted-foreground">
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
                                            className="border-t border-border"
                                        >
                                            <td className="py-1.5 pr-2 text-foreground">
                                                {s.display_name ?? s.signal_name}
                                            </td>
                                            <td className="py-1.5 pr-2 text-right font-mono tabular-nums text-foreground">
                                                {s.raw_value.toFixed(2)}
                                            </td>
                                            <td className="py-1.5 pr-2 text-muted-foreground">
                                                {s.unit_name ?? "—"}
                                            </td>
                                            <td className="py-1.5 text-xs text-muted-foreground">
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
                                            className="rounded-md border border-border bg-muted p-3 text-center"
                                        >
                                            <div className="text-xs font-medium text-muted-foreground">
                                                {labelFor(k)}
                                            </div>
                                            <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
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
                            <ul className="space-y-2 text-sm">
                                {workOrders.data.map((w) => (
                                    <li
                                        key={w.id}
                                        className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted p-2.5"
                                    >
                                        <span className="font-medium text-foreground">
                                            {w.title}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
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
                            <ul className="space-y-3 text-sm">
                                {logbook.data.map((l) => (
                                    <li key={l.id} className="border-l-2 border-input pl-3">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <span className="font-medium text-foreground">
                                                {l.category}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {l.category} · {l.severity}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {l.cell_name ?? `cell #${l.cell_id}`} ·{" "}
                                            {new Date(l.created_at).toLocaleString()} ·{" "}
                                            {l.author_username ?? "—"}
                                        </p>
                                        {l.content && (
                                            <p className="mt-1 text-xs text-foreground">
                                                {l.content}
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
