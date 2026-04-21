import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { getUser, logout } from "../lib/auth";

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="bg-white rounded-lg shadow p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                {title}
            </h2>
            {children}
        </section>
    );
}

function Pre({ value }: { value: unknown }) {
    return (
        <pre className="text-xs bg-slate-50 border border-slate-200 rounded p-2 overflow-auto max-h-64">
            {JSON.stringify(value, null, 2)}
        </pre>
    );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
    return (
        <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                ok ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"
            }`}
        >
            {label}
        </span>
    );
}

export default function DataPage() {
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
        <div className="min-h-full bg-slate-100">
            <header className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold">ARIA — Data Explorer</h1>
                    <p className="text-xs text-slate-400">Last 60 min window · auto-refresh 5s</p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                    <span className="text-slate-300">
                        {user?.username} <span className="text-slate-500">({user?.role})</span>
                    </span>
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1 text-xs"
                    >
                        Logout
                    </button>
                </div>
            </header>

            <main className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Section title="Current cell status">
                    {status.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
                    {status.error && (
                        <p className="text-sm text-red-600">{(status.error as Error).message}</p>
                    )}
                    {status.data && (
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs text-slate-500 uppercase">
                                <tr>
                                    <th className="py-1 pr-2">Cell</th>
                                    <th className="py-1 pr-2">Line</th>
                                    <th className="py-1 pr-2">Status</th>
                                    <th className="py-1">Since</th>
                                </tr>
                            </thead>
                            <tbody>
                                {status.data.map((c) => (
                                    <tr key={c.cell_id} className="border-t border-slate-100">
                                        <td className="py-1.5 pr-2 font-medium">{c.cell_name}</td>
                                        <td className="py-1.5 pr-2 text-slate-500">
                                            {c.line_name ?? "—"}
                                        </td>
                                        <td className="py-1.5 pr-2">
                                            <StatusBadge
                                                ok={!!c.is_productive}
                                                label={c.status_name ?? "?"}
                                            />
                                        </td>
                                        <td className="py-1.5 text-xs text-slate-500">
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
                </Section>

                <Section title="Current process signals">
                    {signals.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
                    {signals.data && (
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs text-slate-500 uppercase">
                                <tr>
                                    <th className="py-1 pr-2">Signal</th>
                                    <th className="py-1 pr-2 text-right">Value</th>
                                    <th className="py-1 pr-2">Unit</th>
                                    <th className="py-1">At</th>
                                </tr>
                            </thead>
                            <tbody>
                                {signals.data.map((s) => (
                                    <tr key={s.signal_def_id} className="border-t border-slate-100">
                                        <td className="py-1.5 pr-2">
                                            {s.display_name ?? s.signal_name}
                                        </td>
                                        <td className="py-1.5 pr-2 text-right font-mono">
                                            {s.raw_value.toFixed(2)}
                                        </td>
                                        <td className="py-1.5 pr-2 text-slate-500">
                                            {s.unit_name ?? "—"}
                                        </td>
                                        <td className="py-1.5 text-xs text-slate-500">
                                            {new Date(s.time).toLocaleTimeString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </Section>

                <Section title="OEE (last 60 min)">
                    {oee.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
                    {oee.data && oee.data.length === 0 && (
                        <p className="text-sm text-slate-500">No data.</p>
                    )}
                    {oee.data && oee.data.length > 0 && (
                        <div className="grid grid-cols-4 gap-3 text-center">
                            {(["oee", "availability", "performance", "quality"] as const).map(
                                (k) => (
                                    <div key={k} className="bg-slate-50 rounded p-3">
                                        <div className="text-xs text-slate-500 uppercase">{k}</div>
                                        <div className="text-2xl font-bold text-slate-900">
                                            {(Number(oee.data[0][k] ?? 0) * 100).toFixed(1)}%
                                        </div>
                                    </div>
                                ),
                            )}
                        </div>
                    )}
                </Section>

                <Section title="Current shift">
                    {currentShift.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
                    {currentShift.data ? <Pre value={currentShift.data} /> : null}
                </Section>

                <Section title="Hierarchy tree">
                    {tree.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
                    {tree.data && <Pre value={tree.data} />}
                </Section>

                <Section title="Work orders">
                    {workOrders.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
                    {workOrders.data && workOrders.data.length === 0 && (
                        <p className="text-sm text-slate-500">No work orders yet.</p>
                    )}
                    {workOrders.data && workOrders.data.length > 0 && (
                        <ul className="space-y-2 text-sm">
                            {workOrders.data.map((w) => (
                                <li key={w.id} className="border border-slate-200 rounded p-2">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{w.title}</span>
                                        <span className="text-xs text-slate-500">
                                            {w.priority} · {w.status}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>

                <Section title="Logbook (last 60 min)">
                    {logbook.isLoading && <p className="text-sm text-slate-500">Loading…</p>}
                    {logbook.data && logbook.data.length === 0 && (
                        <p className="text-sm text-slate-500">No entries.</p>
                    )}
                    {logbook.data && logbook.data.length > 0 && (
                        <ul className="space-y-2 text-sm">
                            {logbook.data.map((l) => (
                                <li key={l.id} className="border-l-2 border-slate-300 pl-3">
                                    <div className="flex justify-between">
                                        <span className="font-medium">{l.title}</span>
                                        <span className="text-xs text-slate-500">
                                            {l.category} · {l.severity}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500">
                                        {l.cell_name ?? `cell #${l.cell_id}`} ·{" "}
                                        {new Date(l.created_at).toLocaleString()} ·{" "}
                                        {l.author_username ?? "—"}
                                    </p>
                                    {l.body && (
                                        <p className="text-xs mt-1 text-slate-700">{l.body}</p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>
            </main>
        </div>
    );
}
