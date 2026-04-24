/**
 * Work Orders list — M9.1.
 *
 * Plain `<table>` with client-side filters (priority / status / cell) and
 * sort. Live updates are driven by `useWorkOrdersStream` which invalidates
 * the `['work-orders']` query on `work_order_ready` / `rca_ready` bus
 * events — no polling. Clicking a row navigates to `/work-orders/:id`.
 */

import { useId, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Hairline, Icons, SectionHeader, StatusDot } from "../../components/ui";
import { formatHeaderDate } from "../../lib/date";
import { PRIORITY_RANK, type WorkOrder } from "./types";
import { useWorkOrders } from "./useWorkOrders";
import { useWorkOrdersStream } from "./useWorkOrdersStream";

type SortColumn = "priority" | "created_at" | "cell" | "status";
type SortDir = "asc" | "desc";

interface Filters {
    priority: string;
    status: string;
    cell: string;
}

const INITIAL_FILTERS: Filters = {
    priority: "",
    status: "",
    cell: "",
};

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

function priorityVariant(priority: string): "critical" | "warning" | "accent" | "default" {
    if (priority === "critical") return "critical";
    if (priority === "high") return "warning";
    if (priority === "medium") return "accent";
    return "default";
}

function statusTone(status: string): "nominal" | "warning" | "critical" | "info" {
    if (status === "completed") return "nominal";
    if (status === "in_progress" || status === "open") return "info";
    if (status === "cancelled") return "warning";
    return "critical";
}

function statusToDotStatus(status: string): "nominal" | "warning" | "critical" | "unknown" {
    const tone = statusTone(status);
    if (tone === "info") return "nominal";
    if (tone === "nominal") return "nominal";
    if (tone === "warning") return "warning";
    return "critical";
}

function applyFilters(list: WorkOrder[], filters: Filters): WorkOrder[] {
    const p = filters.priority.trim().toLowerCase();
    const s = filters.status.trim().toLowerCase();
    const c = filters.cell.trim().toLowerCase();
    return list.filter((wo) => {
        if (p && wo.priority.toLowerCase() !== p) return false;
        if (s && wo.status.toLowerCase() !== s) return false;
        if (c) {
            const hay = `${wo.cell_name ?? ""} ${wo.cell_id}`.toLowerCase();
            if (!hay.includes(c)) return false;
        }
        return true;
    });
}

function applySort(list: WorkOrder[], col: SortColumn, dir: SortDir): WorkOrder[] {
    const sign = dir === "asc" ? 1 : -1;
    const copy = [...list];
    copy.sort((a, b) => {
        let cmp = 0;
        if (col === "priority") {
            const ra = PRIORITY_RANK[a.priority] ?? 99;
            const rb = PRIORITY_RANK[b.priority] ?? 99;
            cmp = ra - rb;
        } else if (col === "created_at") {
            cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        } else if (col === "cell") {
            const la = (a.cell_name ?? `#${a.cell_id}`).toLowerCase();
            const lb = (b.cell_name ?? `#${b.cell_id}`).toLowerCase();
            cmp = la.localeCompare(lb);
        } else if (col === "status") {
            cmp = a.status.localeCompare(b.status);
        }
        return cmp * sign;
    });
    return copy;
}

export default function WorkOrderList() {
    useWorkOrdersStream();
    const navigate = useNavigate();
    const query = useWorkOrders();
    const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
    const [sortCol, setSortCol] = useState<SortColumn>("priority");
    // Priority ascending = critical first (rank 0).
    const [sortDir, setSortDir] = useState<SortDir>("asc");

    const rows = useMemo(() => {
        const raw = query.data ?? [];
        return applySort(applyFilters(raw, filters), sortCol, sortDir);
    }, [query.data, filters, sortCol, sortDir]);

    const today = useMemo(() => formatHeaderDate(), []);

    const toggleSort = (col: SortColumn) => {
        if (col === sortCol) {
            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortCol(col);
            setSortDir(col === "priority" ? "asc" : "desc");
        }
    };

    return (
        <section className="flex h-full flex-col gap-6 p-6">
            <SectionHeader
                label="Work orders"
                size="lg"
                meta={
                    <span>
                        {rows.length} shown · {today}
                    </span>
                }
            />
            <Hairline />
            <FilterBar
                filters={filters}
                onChange={setFilters}
                onReset={() => setFilters(INITIAL_FILTERS)}
            />
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-ds-md border border-ds-border bg-ds-bg-surface">
                <div className="h-full overflow-auto">
                    {query.isPending ? (
                        <EmptyState>Loading work orders…</EmptyState>
                    ) : query.isError ? (
                        <EmptyState tone="critical">
                            Failed to load work orders. {query.error?.message ?? ""}
                        </EmptyState>
                    ) : rows.length === 0 ? (
                        <EmptyState>No work orders match the current filters.</EmptyState>
                    ) : (
                        <table className="w-full border-separate border-spacing-0 text-ds-sm">
                            <thead className="sticky top-0 z-10 bg-ds-bg-surface">
                                <tr className="text-left text-ds-xs font-medium text-ds-fg-muted">
                                    <HeaderCell
                                        label="Priority"
                                        col="priority"
                                        active={sortCol}
                                        dir={sortDir}
                                        onToggle={toggleSort}
                                    />
                                    <th
                                        className="border-b border-ds-border px-4 py-2.5 font-medium"
                                        scope="col"
                                    >
                                        Title
                                    </th>
                                    <HeaderCell
                                        label="Cell"
                                        col="cell"
                                        active={sortCol}
                                        dir={sortDir}
                                        onToggle={toggleSort}
                                    />
                                    <HeaderCell
                                        label="Status"
                                        col="status"
                                        active={sortCol}
                                        dir={sortDir}
                                        onToggle={toggleSort}
                                    />
                                    <HeaderCell
                                        label="Created"
                                        col="created_at"
                                        active={sortCol}
                                        dir={sortDir}
                                        onToggle={toggleSort}
                                    />
                                    <th
                                        className="border-b border-ds-border px-4 py-2.5 font-medium"
                                        scope="col"
                                    >
                                        RCA
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((wo) => (
                                    <Row
                                        key={wo.id}
                                        wo={wo}
                                        onOpen={() => navigate(`/work-orders/${wo.id}`)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </section>
    );
}

interface FilterBarProps {
    filters: Filters;
    onChange: (next: Filters) => void;
    onReset: () => void;
}

function FilterBar({ filters, onChange, onReset }: FilterBarProps) {
    const priorityId = useId();
    const statusId = useId();
    const cellId = useId();
    const inputClass =
        "h-8 rounded-ds-sm border border-ds-border bg-ds-bg-surface px-2 text-ds-sm text-ds-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-ring";
    const fieldClass = "flex flex-col gap-1 text-ds-xs text-ds-fg-muted";
    return (
        <div className="flex flex-wrap items-end gap-3">
            <div className={fieldClass}>
                <label className="font-medium" htmlFor={priorityId}>
                    Priority
                </label>
                <select
                    id={priorityId}
                    className={inputClass}
                    value={filters.priority}
                    onChange={(e) => onChange({ ...filters, priority: e.target.value })}
                >
                    <option value="">All</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                </select>
            </div>
            <div className={fieldClass}>
                <label className="font-medium" htmlFor={statusId}>
                    Status
                </label>
                <select
                    id={statusId}
                    className={inputClass}
                    value={filters.status}
                    onChange={(e) => onChange({ ...filters, status: e.target.value })}
                >
                    <option value="">All</option>
                    <option value="detected">Detected</option>
                    <option value="analyzed">Analyzed</option>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
            </div>
            <div className={fieldClass}>
                <label className="font-medium" htmlFor={cellId}>
                    Cell
                </label>
                <input
                    id={cellId}
                    type="text"
                    placeholder="Name or id"
                    className={`${inputClass} min-w-[180px]`}
                    value={filters.cell}
                    onChange={(e) => onChange({ ...filters, cell: e.target.value })}
                />
            </div>
            <button
                type="button"
                onClick={onReset}
                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-ds-sm border border-ds-border bg-ds-bg-surface px-2.5 text-ds-sm text-ds-fg-muted transition-colors duration-ds-fast hover:border-ds-border-strong hover:bg-ds-bg-hover hover:text-ds-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-ring"
            >
                <Icons.RefreshCw className="size-3.5" aria-hidden />
                Reset
            </button>
        </div>
    );
}

interface HeaderCellProps {
    label: string;
    col: SortColumn;
    active: SortColumn;
    dir: SortDir;
    onToggle: (col: SortColumn) => void;
}

function HeaderCell({ label, col, active, dir, onToggle }: HeaderCellProps) {
    const isActive = active === col;
    const Arrow = dir === "asc" ? Icons.ChevronUp : Icons.ChevronDown;
    const sort: "ascending" | "descending" | "none" = isActive
        ? dir === "asc"
            ? "ascending"
            : "descending"
        : "none";
    return (
        <th className="border-b border-ds-border font-medium" scope="col" aria-sort={sort}>
            <button
                type="button"
                onClick={() => onToggle(col)}
                className="inline-flex h-full w-full items-center gap-1 px-4 py-2.5 text-left font-medium text-ds-fg-muted transition-colors hover:text-ds-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-ring"
            >
                <span>{label}</span>
                {isActive && <Arrow className="size-3" aria-hidden />}
            </button>
        </th>
    );
}

function Row({ wo, onOpen }: { wo: WorkOrder; onOpen: () => void }) {
    const hasRca = Boolean(wo.rca_summary);
    return (
        <tr
            tabIndex={0}
            aria-label={`Open work order ${wo.id}: ${wo.title}`}
            onClick={onOpen}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen();
                }
            }}
            className="cursor-pointer border-b border-ds-border transition-colors hover:bg-ds-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-ring"
        >
            <td className="px-4 py-3 align-middle">
                <Badge variant={priorityVariant(wo.priority)}>{wo.priority}</Badge>
            </td>
            <td className="px-4 py-3 align-middle">
                <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium text-ds-fg-primary">{wo.title}</span>
                    <span className="text-ds-xs text-ds-fg-subtle">
                        WO #{wo.id}
                        {wo.generated_by_agent ? " · Generated by agent" : ""}
                    </span>
                </div>
            </td>
            <td className="px-4 py-3 align-middle text-ds-fg-muted">
                {wo.cell_name ?? `#${wo.cell_id}`}
            </td>
            <td className="px-4 py-3 align-middle">
                <span className="inline-flex items-center gap-2 text-ds-fg-muted">
                    <StatusDot status={statusToDotStatus(wo.status)} />
                    <span className="text-ds-fg-primary">{wo.status.replace(/_/g, " ")}</span>
                </span>
            </td>
            <td className="px-4 py-3 align-middle text-ds-fg-muted">
                {formatDateTime(wo.created_at)}
            </td>
            <td className="px-4 py-3 align-middle">
                {hasRca ? (
                    <Badge variant="accent">RCA ready</Badge>
                ) : (
                    <span className="text-ds-fg-subtle">—</span>
                )}
            </td>
        </tr>
    );
}

function EmptyState({ children, tone }: { children: React.ReactNode; tone?: "critical" }) {
    return (
        <div
            className={`flex h-full min-h-[180px] items-center justify-center px-6 py-10 text-ds-sm ${
                tone === "critical" ? "text-ds-critical" : "text-ds-fg-subtle"
            }`}
        >
            {children}
        </div>
    );
}
