/**
 * Logbook page — operator shift journal.
 *
 * Layout
 *   ┌─────────────────────────────────────────────────────────┐
 *   │ Section header · counts · today                         │
 *   │ ─────────────────────────────────────────────────────── │
 *   │ ┌─────────────────────┐  ┌────────────────────────────┐ │
 *   │ │ New entry composer  │  │ Filter bar                 │ │
 *   │ │ (operator+ only)    │  │ ─────────────────────────  │ │
 *   │ │                     │  │ Entry · Entry · Entry      │ │
 *   │ │                     │  │ Entry · Entry · …          │ │
 *   │ └─────────────────────┘  └────────────────────────────┘ │
 *   └─────────────────────────────────────────────────────────┘
 *
 * The composer + list share the `["logbook", "list"]` query key so a
 * successful POST refetches the visible feed.
 */

import { useId, useMemo, useState } from "react";
import { Badge, Card, Hairline, Icons, SectionHeader } from "../../components/ui";
import { formatHeaderDate } from "../../lib/date";
import { getUser } from "../../services/auth";
import type { LogbookCategory, LogbookEntry, LogbookSeverity } from "../../services/logbook";
import { LogbookEntryForm } from "./LogbookEntryForm";
import { useLogbookEntries } from "./useLogbook";
import {
    CATEGORY_OPTIONS,
    categoryVariant,
    formatEntryTime,
    SEVERITY_OPTIONS,
    severityVariant,
} from "./utils";

interface Filters {
    category: "" | LogbookCategory;
    severity: "" | LogbookSeverity;
    cell: string;
}

const INITIAL_FILTERS: Filters = { category: "", severity: "", cell: "" };

function applyFilters(list: LogbookEntry[], filters: Filters): LogbookEntry[] {
    const c = filters.cell.trim().toLowerCase();
    return list.filter((entry) => {
        if (filters.category && entry.category !== filters.category) return false;
        if (filters.severity && entry.severity !== filters.severity) return false;
        if (c) {
            const hay = `${entry.cell_name ?? ""} ${entry.cell_id}`.toLowerCase();
            if (!hay.includes(c)) return false;
        }
        return true;
    });
}

export function LogbookList() {
    const user = getUser();
    const canCreate = user?.role === "admin" || user?.role === "operator";
    const query = useLogbookEntries({ limit: 200 });
    const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);

    const allEntries = useMemo(() => {
        const list = [...(query.data ?? [])];
        list.sort(
            (a, b) =>
                new Date(b.entry_time ?? b.created_at).getTime() -
                new Date(a.entry_time ?? a.created_at).getTime(),
        );
        return list;
    }, [query.data]);

    const rows = useMemo(() => applyFilters(allEntries, filters), [allEntries, filters]);

    const counts = useMemo(() => {
        const out = { total: allEntries.length, critical: 0, warning: 0, today: 0 };
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const dayMs = dayStart.getTime();
        for (const entry of allEntries) {
            if (entry.severity === "critical") out.critical++;
            else if (entry.severity === "warning") out.warning++;
            const t = new Date(entry.entry_time ?? entry.created_at).getTime();
            if (t >= dayMs) out.today++;
        }
        return out;
    }, [allEntries]);

    const today = useMemo(() => formatHeaderDate(), []);

    return (
        <section className="flex h-full flex-col gap-6 p-6">
            <SectionHeader
                label="Logbook"
                size="lg"
                meta={
                    <span>
                        {counts.total} entries · {counts.today} today · {today}
                    </span>
                }
            />
            <Hairline />

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                <div className="flex flex-col gap-4">
                    <LogbookEntryForm canCreate={canCreate} />
                    <SummaryCard counts={counts} />
                </div>

                <div className="flex min-h-0 flex-col gap-4">
                    <FilterBar
                        filters={filters}
                        onChange={setFilters}
                        onReset={() => setFilters(INITIAL_FILTERS)}
                    />
                    <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card">
                        <div className="h-full overflow-auto">
                            {query.isPending ? (
                                <EmptyState>Loading entries…</EmptyState>
                            ) : query.isError ? (
                                <EmptyState tone="critical">
                                    Failed to load logbook. {query.error?.message ?? ""}
                                </EmptyState>
                            ) : rows.length === 0 ? (
                                <EmptyState>
                                    {allEntries.length === 0
                                        ? "No entries yet — be the first to log one."
                                        : "No entries match the current filters."}
                                </EmptyState>
                            ) : (
                                <ul className="divide-y divide-border">
                                    {rows.map((entry) => (
                                        <EntryItem key={entry.id} entry={entry} />
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

interface SummaryCardProps {
    counts: { total: number; critical: number; warning: number; today: number };
}

function SummaryCard({ counts }: SummaryCardProps) {
    return (
        <Card padding="md" className="flex flex-col gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                · This shift at a glance
            </span>
            <dl className="grid grid-cols-3 gap-3 text-sm">
                <Stat label="Today" value={counts.today} />
                <Stat label="Warnings" value={counts.warning} tone="warning" />
                <Stat label="Critical" value={counts.critical} tone="critical" />
            </dl>
        </Card>
    );
}

function Stat({
    label,
    value,
    tone,
}: {
    label: string;
    value: number;
    tone?: "warning" | "critical";
}) {
    const color =
        tone === "critical"
            ? "text-destructive"
            : tone === "warning"
              ? "text-warning"
              : "text-foreground";
    return (
        <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-text-tertiary">{label}</dt>
            <dd className={`text-2xl font-semibold tracking-[-0.02em] ${color}`}>{value}</dd>
        </div>
    );
}

interface FilterBarProps {
    filters: Filters;
    onChange: (next: Filters) => void;
    onReset: () => void;
}

function FilterBar({ filters, onChange, onReset }: FilterBarProps) {
    const categoryId = useId();
    const severityId = useId();
    const cellId = useId();
    const inputClass =
        "h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
    const fieldClass = "flex flex-col gap-1 text-xs text-muted-foreground";

    return (
        <div className="flex flex-wrap items-end gap-3">
            <div className={fieldClass}>
                <label className="font-medium" htmlFor={categoryId}>
                    Category
                </label>
                <select
                    id={categoryId}
                    className={inputClass}
                    value={filters.category}
                    onChange={(e) =>
                        onChange({ ...filters, category: e.target.value as Filters["category"] })
                    }
                >
                    <option value="">All</option>
                    {CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </div>
            <div className={fieldClass}>
                <label className="font-medium" htmlFor={severityId}>
                    Severity
                </label>
                <select
                    id={severityId}
                    className={inputClass}
                    value={filters.severity}
                    onChange={(e) =>
                        onChange({ ...filters, severity: e.target.value as Filters["severity"] })
                    }
                >
                    <option value="">All</option>
                    {SEVERITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
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
                className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm text-muted-foreground transition-colors duration-150 hover:border-input hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
                <Icons.RefreshCw className="size-3.5" aria-hidden />
                Reset
            </button>
        </div>
    );
}

function EntryItem({ entry }: { entry: LogbookEntry }) {
    return (
        <li className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-accent/40">
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant={severityVariant(entry.severity)}>{entry.severity}</Badge>
                <Badge variant={categoryVariant(entry.category)}>{entry.category}</Badge>
                <span className="text-xs text-text-tertiary">
                    {entry.cell_name ?? `Cell #${entry.cell_id}`}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                    {formatEntryTime(entry.entry_time ?? entry.created_at)}
                    {entry.author_username ? ` · ${entry.author_username}` : ""}
                </span>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {entry.content}
            </p>
        </li>
    );
}

function EmptyState({ children, tone }: { children: React.ReactNode; tone?: "critical" }) {
    return (
        <div
            className={`flex h-full min-h-[180px] items-center justify-center px-6 py-10 text-sm ${
                tone === "critical" ? "text-destructive" : "text-text-tertiary"
            }`}
        >
            {children}
        </div>
    );
}

export default LogbookList;
