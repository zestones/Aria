/**
 * Inline editor for a Work Order — replaces `ScreenView` while in edit
 * mode. Mirrors the editable subset of `WorkOrderUpdate` (backend) and
 * sends only the fields that actually changed via PATCH-like semantics
 * (PUT with `exclude_unset` server-side).
 *
 * List fields (`recommended_actions`, `required_parts`, `required_skills`)
 * are edited as one-per-line textareas and serialized to `string[]` on
 * submit.
 */

import { useId, useMemo, useState } from "react";
import { Badge, Button, Card, Hairline, Icons, SectionHeader } from "../../components/ui";
import type { WorkOrderUpdatePayload } from "../../services/work-orders";
import type { WorkOrder } from "./types";
import { useUpdateWorkOrder } from "./useWorkOrders";
import { parseList } from "./utils";

const PRIORITIES: WorkOrder["priority"][] = ["low", "medium", "high", "critical"];
const STATUSES: WorkOrder["status"][] = [
    "detected",
    "analyzed",
    "open",
    "in_progress",
    "completed",
    "cancelled",
];

interface FormState {
    title: string;
    description: string;
    priority: string;
    status: string;
    estimatedDuration: string;
    actions: string;
    parts: string;
    skills: string;
    suggestedStart: string;
    suggestedEnd: string;
    rcaSummary: string;
}

function toLocalInput(ts: string | null | undefined): string {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    // <input type="datetime-local"> wants `YYYY-MM-DDTHH:mm` in local time.
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

function fromTextarea(value: string): string[] {
    return value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
}

function buildInitial(wo: WorkOrder): FormState {
    return {
        title: wo.title,
        description: wo.description ?? "",
        priority: wo.priority,
        status: wo.status,
        estimatedDuration:
            wo.estimated_duration_min != null ? String(wo.estimated_duration_min) : "",
        actions: parseList(wo.recommended_actions).join("\n"),
        parts: parseList(wo.required_parts).join("\n"),
        skills: parseList(wo.required_skills).join("\n"),
        suggestedStart: toLocalInput(wo.suggested_window_start),
        suggestedEnd: toLocalInput(wo.suggested_window_end),
        rcaSummary: wo.rca_summary ?? "",
    };
}

function buildPayload(wo: WorkOrder, form: FormState): WorkOrderUpdatePayload {
    const out: WorkOrderUpdatePayload = {};
    const trimmedTitle = form.title.trim();
    if (trimmedTitle && trimmedTitle !== wo.title) out.title = trimmedTitle;

    const desc = form.description.trim();
    if (desc !== (wo.description ?? "")) out.description = desc || null;

    if (form.priority !== wo.priority) {
        out.priority = form.priority as WorkOrderUpdatePayload["priority"];
    }
    if (form.status !== wo.status) {
        out.status = form.status as WorkOrderUpdatePayload["status"];
    }

    const dur = form.estimatedDuration.trim();
    const durNum = dur ? Number(dur) : null;
    const currentDur = wo.estimated_duration_min ?? null;
    if (durNum !== currentDur) out.estimated_duration_min = durNum;

    const actions = fromTextarea(form.actions);
    if (JSON.stringify(actions) !== JSON.stringify(parseList(wo.recommended_actions))) {
        out.recommended_actions = actions;
    }

    const parts = fromTextarea(form.parts);
    if (JSON.stringify(parts) !== JSON.stringify(parseList(wo.required_parts))) {
        out.required_parts = parts;
    }

    const skills = fromTextarea(form.skills);
    if (JSON.stringify(skills) !== JSON.stringify(parseList(wo.required_skills))) {
        out.required_skills = skills;
    }

    const startIso = fromLocalInput(form.suggestedStart);
    if (startIso !== (wo.suggested_window_start ?? null)) {
        out.suggested_window_start = startIso;
    }

    const endIso = fromLocalInput(form.suggestedEnd);
    if (endIso !== (wo.suggested_window_end ?? null)) {
        out.suggested_window_end = endIso;
    }

    const rca = form.rcaSummary.trim();
    if (rca !== (wo.rca_summary ?? "")) out.rca_summary = rca || null;

    return out;
}

export interface WorkOrderEditFormProps {
    wo: WorkOrder;
    onCancel: () => void;
    onSaved: () => void;
}

export function WorkOrderEditForm({ wo, onCancel, onSaved }: WorkOrderEditFormProps) {
    const [form, setForm] = useState<FormState>(() => buildInitial(wo));
    const update = useUpdateWorkOrder(wo.id);

    const ids = {
        title: useId(),
        description: useId(),
        priority: useId(),
        status: useId(),
        duration: useId(),
        actions: useId(),
        parts: useId(),
        skills: useId(),
        start: useId(),
        end: useId(),
        rca: useId(),
    };

    const inputClass =
        "h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground transition-colors " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
    const textareaClass =
        "w-full rounded-md border border-border bg-card px-3 py-2 text-sm leading-relaxed text-foreground transition-colors " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
    const labelClass = "text-xs font-medium text-muted-foreground";

    const payload = useMemo(() => buildPayload(wo, form), [wo, form]);
    const dirty = Object.keys(payload).length > 0;
    const titleValid = form.title.trim().length > 0;
    const canSubmit = dirty && titleValid && !update.isPending;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        update.mutate(payload, { onSuccess: () => onSaved() });
    };

    return (
        <Card padding="lg" elevated className="flex flex-col gap-5">
            <SectionHeader
                size="sm"
                label={`Edit work order #${wo.id}`}
                meta={
                    <span className="text-xs text-text-tertiary">
                        Only changed fields are sent to the server
                    </span>
                }
            />
            <Hairline />
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                    <label className={labelClass} htmlFor={ids.title}>
                        Title
                    </label>
                    <input
                        id={ids.title}
                        type="text"
                        className={inputClass}
                        value={form.title}
                        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                        maxLength={200}
                        required
                    />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                        <label className={labelClass} htmlFor={ids.priority}>
                            Priority
                        </label>
                        <select
                            id={ids.priority}
                            className={inputClass}
                            value={form.priority}
                            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                        >
                            {PRIORITIES.map((p) => (
                                <option key={p} value={p}>
                                    {p}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className={labelClass} htmlFor={ids.status}>
                            Status
                        </label>
                        <select
                            id={ids.status}
                            className={inputClass}
                            value={form.status}
                            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                        >
                            {STATUSES.map((s) => (
                                <option key={s} value={s}>
                                    {s.replace(/_/g, " ")}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className={labelClass} htmlFor={ids.duration}>
                            Estimated duration (min)
                        </label>
                        <input
                            id={ids.duration}
                            type="number"
                            min={0}
                            step={5}
                            className={inputClass}
                            value={form.estimatedDuration}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, estimatedDuration: e.target.value }))
                            }
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelClass} htmlFor={ids.description}>
                        Description
                    </label>
                    <textarea
                        id={ids.description}
                        className={`${textareaClass} min-h-[100px]`}
                        rows={4}
                        value={form.description}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="flex flex-col gap-1.5 md:col-span-1">
                        <label className={labelClass} htmlFor={ids.actions}>
                            Recommended actions{" "}
                            <span className="text-text-tertiary">(one per line)</span>
                        </label>
                        <textarea
                            id={ids.actions}
                            className={`${textareaClass} min-h-[120px]`}
                            rows={5}
                            value={form.actions}
                            onChange={(e) => setForm((f) => ({ ...f, actions: e.target.value }))}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className={labelClass} htmlFor={ids.parts}>
                            Required parts{" "}
                            <span className="text-text-tertiary">(one per line)</span>
                        </label>
                        <textarea
                            id={ids.parts}
                            className={`${textareaClass} min-h-[120px]`}
                            rows={5}
                            value={form.parts}
                            onChange={(e) => setForm((f) => ({ ...f, parts: e.target.value }))}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className={labelClass} htmlFor={ids.skills}>
                            Required skills{" "}
                            <span className="text-text-tertiary">(one per line)</span>
                        </label>
                        <textarea
                            id={ids.skills}
                            className={`${textareaClass} min-h-[120px]`}
                            rows={5}
                            value={form.skills}
                            onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                        <label className={labelClass} htmlFor={ids.start}>
                            Suggested start
                        </label>
                        <input
                            id={ids.start}
                            type="datetime-local"
                            className={inputClass}
                            value={form.suggestedStart}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, suggestedStart: e.target.value }))
                            }
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className={labelClass} htmlFor={ids.end}>
                            Suggested end
                        </label>
                        <input
                            id={ids.end}
                            type="datetime-local"
                            className={inputClass}
                            value={form.suggestedEnd}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, suggestedEnd: e.target.value }))
                            }
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelClass} htmlFor={ids.rca}>
                        Root cause analysis
                    </label>
                    <textarea
                        id={ids.rca}
                        className={`${textareaClass} min-h-[100px]`}
                        rows={4}
                        value={form.rcaSummary}
                        onChange={(e) => setForm((f) => ({ ...f, rcaSummary: e.target.value }))}
                    />
                </div>

                {update.isError && (
                    <p className="text-sm text-destructive">
                        Could not save changes.{" "}
                        {update.error instanceof Error ? update.error.message : ""}
                    </p>
                )}

                <div className="flex items-center justify-end gap-3">
                    {!dirty && (
                        <Badge variant="default" className="mr-auto">
                            No changes
                        </Badge>
                    )}
                    <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        onClick={onCancel}
                        disabled={update.isPending}
                    >
                        Cancel
                    </Button>
                    <Button type="submit" variant="default" size="md" disabled={!canSubmit}>
                        {update.isPending ? (
                            <>
                                <Icons.Loader2 className="size-4 animate-spin" aria-hidden />
                                Saving…
                            </>
                        ) : (
                            <>
                                <Icons.Check className="size-4" aria-hidden />
                                Save changes
                            </>
                        )}
                    </Button>
                </div>
            </form>
        </Card>
    );
}
