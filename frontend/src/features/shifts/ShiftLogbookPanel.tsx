/**
 * Shift logbook panel — the last 48 h of operator shift-notes, with the
 * entries from "this shift" visually separated at the top.
 *
 * Deliberately not a full CRUD surface — a separate `/logbook` page
 * handles authoring. This panel is a *reading* surface aligned to the
 * shift-window story the rest of the page tells.
 */

import { Badge, Card, Hairline, Icons } from "../../components/ui";
import type { LogbookEntry } from "../../services/logbook";
import { formatLogbookTime } from "./utils";

interface ShiftLogbookPanelProps {
    shiftStart: Date | null;
    entries: LogbookEntry[] | undefined;
    isLoading: boolean;
    isError: boolean;
}

function severityVariant(severity: string): "critical" | "warning" | "default" {
    if (severity === "critical") return "critical";
    if (severity === "warning") return "warning";
    return "default";
}

function categoryLabel(category: string): string {
    if (!category) return "Note";
    return category.charAt(0).toUpperCase() + category.slice(1);
}

interface EntryRowProps {
    entry: LogbookEntry;
}

function EntryRow({ entry }: EntryRowProps) {
    const time = formatLogbookTime(entry.entry_time ?? entry.created_at);
    const author = entry.author_username ?? "system";
    const cell = entry.cell_name ?? `Cell ${entry.cell_id}`;
    return (
        <li className="flex gap-3 border-t border-border-muted py-3 first:border-t-0">
            <div className="flex min-w-[80px] flex-none flex-col gap-1 font-mono text-[11px] leading-tight">
                <span className="text-foreground">{time}</span>
                <span className="text-muted-foreground">{cell}</span>
            </div>
            <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant={severityVariant(entry.severity)}>
                        {categoryLabel(entry.category)}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                        — {entry.author_username ? `@${author}` : author}
                    </span>
                </div>
                <p className="whitespace-pre-line text-sm text-foreground">{entry.content}</p>
            </div>
        </li>
    );
}

export function ShiftLogbookPanel({
    shiftStart,
    entries,
    isLoading,
    isError,
}: ShiftLogbookPanelProps) {
    const list = entries ?? [];
    const startMs = shiftStart ? shiftStart.getTime() : null;

    const sorted = [...list].sort((a, b) => {
        const ta = new Date(a.entry_time ?? a.created_at).getTime();
        const tb = new Date(b.entry_time ?? b.created_at).getTime();
        return tb - ta;
    });
    const inShift =
        startMs === null
            ? []
            : sorted.filter((e) => new Date(e.entry_time ?? e.created_at).getTime() >= startMs);
    const earlier =
        startMs === null
            ? sorted
            : sorted.filter((e) => new Date(e.entry_time ?? e.created_at).getTime() < startMs);

    return (
        <Card padding="lg">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Shift logbook
                    </div>
                    <h3 className="text-base font-medium tracking-[-0.01em] text-foreground">
                        What the operators noted
                    </h3>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icons.BookOpen className="size-3.5" aria-hidden /> Last 48 h
                </span>
            </div>
            <Hairline />

            {isLoading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <Icons.Loader2 className="size-4 animate-spin" aria-hidden /> Loading logbook…
                </div>
            ) : isError ? (
                <div className="py-6 text-sm text-destructive">Could not load logbook entries.</div>
            ) : sorted.length === 0 ? (
                <div className="py-6 text-sm text-muted-foreground">
                    No logbook entries in the last 48 hours.
                </div>
            ) : (
                <div className="mt-3 flex flex-col gap-5">
                    {inShift.length > 0 && (
                        <section aria-label="This shift">
                            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-foreground">
                                This shift ({inShift.length})
                            </div>
                            <ul className="flex flex-col">
                                {inShift.map((entry) => (
                                    <EntryRow key={entry.id} entry={entry} />
                                ))}
                            </ul>
                        </section>
                    )}
                    {earlier.length > 0 && (
                        <section aria-label="Earlier">
                            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                                Earlier ({earlier.length})
                            </div>
                            <ul className="flex flex-col">
                                {earlier.map((entry) => (
                                    <EntryRow key={entry.id} entry={entry} />
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            )}
        </Card>
    );
}
