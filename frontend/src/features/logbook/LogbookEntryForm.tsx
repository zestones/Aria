/**
 * Logbook entry composer.
 *
 * Editorial "paper card" form — sits on the cream canvas with a soft
 * border, generous breathing room (`p-6`/`p-7`), and an Ink-pill primary
 * CTA. Mirrors DESIGN.md §4 (Buttons / Cards) while staying in the
 * existing `Card` + `Button` primitive vocabulary so the surface feels
 * native to the rest of the dashboard.
 *
 * Auth: backend `POST /logbook` requires admin or operator. Viewers see
 * a disabled CTA + helper text instead of a 401.
 */

import { useId, useMemo, useState } from "react";
import { Button, Card, Hairline, Icons, NativeSelect, SectionHeader } from "../../components/ui";
import { type FlatCell, useFlatHierarchy } from "../../lib/hierarchy";
import type { LogbookCategory, LogbookSeverity } from "../../services/logbook";
import { useCreateLogbookEntry } from "./useLogbook";
import { CATEGORY_OPTIONS, SEVERITY_OPTIONS } from "./utils";

const MAX_CONTENT = 1000;

export interface LogbookEntryFormProps {
    /** Pre-selected cell id (e.g. when opened from a cell context). */
    defaultCellId?: number;
    /** Shown disabled when the current user lacks operator/admin role. */
    canCreate: boolean;
    onCreated?: () => void;
}

interface FormState {
    cellId: number | null;
    category: LogbookCategory;
    severity: LogbookSeverity;
    content: string;
}

const INITIAL: FormState = {
    cellId: null,
    category: "observation",
    severity: "info",
    content: "",
};

export function LogbookEntryForm({ defaultCellId, canCreate, onCreated }: LogbookEntryFormProps) {
    const { all: cells } = useFlatHierarchy("");
    const create = useCreateLogbookEntry();
    const [form, setForm] = useState<FormState>({
        ...INITIAL,
        cellId: defaultCellId ?? INITIAL.cellId,
    });

    const cellId = useId();
    const categoryId = useId();
    const severityId = useId();
    const contentId = useId();

    const sortedCells = useMemo<FlatCell[]>(() => {
        const list = [...cells].filter((c) => !c.cellDisabled);
        list.sort((a, b) => a.path.localeCompare(b.path));
        return list;
    }, [cells]);

    const canSubmit =
        canCreate && form.cellId != null && form.content.trim().length > 0 && !create.isPending;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit || form.cellId == null) return;
        create.mutate(
            {
                cell_id: form.cellId,
                category: form.category,
                severity: form.severity,
                content: form.content.trim(),
            },
            {
                onSuccess: () => {
                    setForm({
                        ...INITIAL,
                        cellId: defaultCellId ?? form.cellId,
                    });
                    onCreated?.();
                },
            },
        );
    };

    const inputClass =
        "h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground transition-colors " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
        "disabled:cursor-not-allowed disabled:opacity-60";
    const labelClass = "text-xs font-medium text-muted-foreground";

    return (
        <Card padding="lg" elevated className="flex flex-col gap-5">
            <SectionHeader
                size="sm"
                label="New entry"
                meta={
                    <span className="text-xs text-text-tertiary">
                        Logged as the operator on shift
                    </span>
                }
            />
            <Hairline />
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="flex flex-col gap-1.5 md:col-span-1">
                        <label className={labelClass} htmlFor={cellId}>
                            Cell
                        </label>
                        <NativeSelect
                            id={cellId}
                            className={inputClass}
                            value={form.cellId ?? ""}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    cellId: e.target.value ? Number(e.target.value) : null,
                                }))
                            }
                            disabled={!canCreate}
                            required
                        >
                            <option value="">Select cell</option>
                            {sortedCells.map((c) => (
                                <option key={c.cellId} value={c.cellId}>
                                    {c.cellName}
                                </option>
                            ))}
                        </NativeSelect>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className={labelClass} htmlFor={categoryId}>
                            Category
                        </label>
                        <NativeSelect
                            id={categoryId}
                            className={inputClass}
                            value={form.category}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    category: e.target.value as LogbookCategory,
                                }))
                            }
                            disabled={!canCreate}
                        >
                            {CATEGORY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </NativeSelect>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className={labelClass} htmlFor={severityId}>
                            Severity
                        </label>
                        <NativeSelect
                            id={severityId}
                            className={inputClass}
                            value={form.severity}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    severity: e.target.value as LogbookSeverity,
                                }))
                            }
                            disabled={!canCreate}
                        >
                            {SEVERITY_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </NativeSelect>
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelClass} htmlFor={contentId}>
                        What happened
                    </label>
                    <textarea
                        id={contentId}
                        className={`${inputClass} min-h-[120px] py-2 leading-relaxed`}
                        rows={5}
                        maxLength={MAX_CONTENT}
                        placeholder="Describe what was observed, the action taken, and anything the next shift should know."
                        value={form.content}
                        onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                        disabled={!canCreate}
                        required
                    />
                    <span className="ml-auto text-[11px] text-text-tertiary">
                        {form.content.length} / {MAX_CONTENT}
                    </span>
                </div>

                {create.isError && (
                    <p className="text-sm text-destructive">
                        Could not save the entry.{" "}
                        {create.error instanceof Error ? create.error.message : ""}
                    </p>
                )}
                {!canCreate && (
                    <p className="text-xs text-text-tertiary">
                        Your role is read-only. Ask an operator or admin to add entries.
                    </p>
                )}

                <div className="flex items-center justify-end gap-3">
                    <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        onClick={() =>
                            setForm({ ...INITIAL, cellId: defaultCellId ?? form.cellId })
                        }
                        disabled={!canCreate || create.isPending}
                    >
                        Clear
                    </Button>
                    <Button type="submit" variant="default" size="md" disabled={!canSubmit}>
                        {create.isPending ? (
                            <>
                                <Icons.Loader2 className="size-4 animate-spin" aria-hidden />
                                Saving…
                            </>
                        ) : (
                            <>
                                <Icons.Plus className="size-4" aria-hidden />
                                Add entry
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </Card>
    );
}
