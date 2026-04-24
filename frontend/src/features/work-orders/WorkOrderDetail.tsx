/**
 * Work Order detail — M9.1.
 *
 * Fetches a single WO by route param, renders every field in sober DS
 * signatures (no ad-hoc markup), offers `Print` which triggers
 * `window.print()`. The on-screen layout is suppressed under `@media print`
 * (see `PrintableWorkOrder`) so the printed page uses the dedicated layout.
 */

import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { Badge, Hairline, Icons, MetaStrip, SectionHeader, StatusDot } from "../../components/ui";
import { PrintableWorkOrder } from "./PrintableWorkOrder";
import type { WorkOrder } from "./types";
import { useWorkOrder } from "./useWorkOrders";
import { useWorkOrdersStream } from "./useWorkOrdersStream";
import { parseList } from "./utils";

function formatDateTime(ts: string | null | undefined): string {
    if (!ts) return "—";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
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

function statusToDotStatus(status: string): "nominal" | "warning" | "critical" | "unknown" {
    if (status === "completed") return "nominal";
    if (status === "in_progress" || status === "open") return "nominal";
    if (status === "cancelled") return "warning";
    return "critical";
}

export default function WorkOrderDetail() {
    useWorkOrdersStream();
    const params = useParams<{ id: string }>();
    const idNum = params.id ? Number(params.id) : null;
    const query = useWorkOrder(idNum);

    if (!idNum || Number.isNaN(idNum)) {
        return (
            <section className="flex h-full flex-col gap-4 p-6 print:hidden">
                <BackLink />
                <p className="text-[var(--ds-text-sm)] text-[var(--ds-status-critical)]">
                    Invalid work order id.
                </p>
            </section>
        );
    }

    if (query.isPending) {
        return (
            <section className="flex h-full flex-col gap-4 p-6 print:hidden">
                <BackLink />
                <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-subtle)]">Loading…</p>
            </section>
        );
    }

    if (query.isError || !query.data) {
        return (
            <section className="flex h-full flex-col gap-4 p-6 print:hidden">
                <BackLink />
                <p className="text-[var(--ds-text-sm)] text-[var(--ds-status-critical)]">
                    Failed to load work order. {query.error?.message ?? ""}
                </p>
            </section>
        );
    }

    const wo = query.data;
    return (
        <>
            <ScreenView wo={wo} />
            {/* Portal the printable sheet as a direct child of <body> so the
                AppShell layout chain (grid, flex, overflow-hidden, fixed
                viewport height) cannot constrain the printed pagination —
                see issue #51 follow-up v4. */}
            {typeof document !== "undefined"
                ? createPortal(<PrintableWorkOrder wo={wo} />, document.body)
                : null}
        </>
    );
}

function ScreenView({ wo }: { wo: WorkOrder }) {
    const actions = parseList(wo.recommended_actions);
    const parts = parseList(wo.required_parts);
    const skills = parseList(wo.required_skills);

    return (
        <section className="flex h-full flex-col gap-6 overflow-auto p-6 print:hidden">
            <div className="flex items-start justify-between gap-4">
                <BackLink />
                <button
                    type="button"
                    onClick={() => window.print()}
                    aria-label="Print this work order"
                    className="inline-flex h-9 items-center gap-1.5 rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-surface)] px-3 text-[var(--ds-text-sm)] font-medium text-[var(--ds-fg-primary)] transition-colors duration-[var(--ds-motion-fast)] hover:border-[var(--ds-border-strong)] hover:bg-[var(--ds-bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)]"
                >
                    <Icons.Printer className="size-4" aria-hidden />
                    Print
                </button>
            </div>
            <SectionHeader
                label={wo.title}
                size="lg"
                meta={
                    <span className="flex items-center gap-2">
                        <Badge variant={priorityVariant(wo.priority)}>{wo.priority}</Badge>
                        <span className="inline-flex items-center gap-1.5 text-[var(--ds-fg-muted)]">
                            <StatusDot status={statusToDotStatus(wo.status)} />
                            <span className="text-[var(--ds-fg-primary)]">
                                {wo.status.replace(/_/g, " ")}
                            </span>
                        </span>
                    </span>
                }
            />
            <MetaStrip
                items={[
                    { label: "WO", value: `#${wo.id}` },
                    { label: "Cell", value: wo.cell_name ?? `#${wo.cell_id}` },
                    { label: "Created", value: formatDateTime(wo.created_at) },
                    ...(wo.generated_by_agent
                        ? [{ label: "Source", value: "Generated by agent" }]
                        : []),
                    ...(wo.assigned_to_username
                        ? [{ label: "Assigned to", value: wo.assigned_to_username }]
                        : []),
                ]}
            />
            <Hairline />
            {wo.description && (
                <Panel title="Description">
                    <p className="whitespace-pre-wrap text-[var(--ds-text-sm)] leading-[1.55] text-[var(--ds-fg-primary)]">
                        {wo.description}
                    </p>
                </Panel>
            )}
            {wo.rca_summary && (
                <Panel title="Root cause analysis" meta={<Badge variant="accent">RCA ready</Badge>}>
                    <p className="whitespace-pre-wrap text-[var(--ds-text-sm)] leading-[1.55] text-[var(--ds-fg-primary)]">
                        {wo.rca_summary}
                    </p>
                </Panel>
            )}
            {actions.length > 0 && (
                <Panel title="Recommended actions">
                    <ol className="list-decimal space-y-1.5 pl-5 text-[var(--ds-text-sm)] leading-[1.55] text-[var(--ds-fg-primary)]">
                        {actions.map((a) => (
                            <li key={a}>{a}</li>
                        ))}
                    </ol>
                </Panel>
            )}
            {parts.length > 0 && (
                <Panel title="Required parts">
                    <ul className="flex flex-wrap gap-2">
                        {parts.map((p) => (
                            <li key={p}>
                                <Badge variant="default">{p}</Badge>
                            </li>
                        ))}
                    </ul>
                </Panel>
            )}
            {skills.length > 0 && (
                <Panel title="Required skills">
                    <ul className="flex flex-wrap gap-2">
                        {skills.map((s) => (
                            <li key={s}>
                                <Badge variant="default">{s}</Badge>
                            </li>
                        ))}
                    </ul>
                </Panel>
            )}
            {(wo.suggested_window_start || wo.estimated_duration_min != null) && (
                <Panel title="Scheduling">
                    <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-[var(--ds-text-sm)]">
                        {wo.suggested_window_start && (
                            <Field
                                label="Suggested start"
                                value={formatDateTime(wo.suggested_window_start)}
                            />
                        )}
                        {wo.suggested_window_end && (
                            <Field
                                label="Suggested end"
                                value={formatDateTime(wo.suggested_window_end)}
                            />
                        )}
                        {wo.estimated_duration_min != null && (
                            <Field
                                label="Estimated duration"
                                value={`${wo.estimated_duration_min} min`}
                            />
                        )}
                    </dl>
                </Panel>
            )}
        </section>
    );
}

function BackLink() {
    return (
        <Link
            to="/work-orders"
            className="inline-flex h-8 items-center gap-1.5 rounded-[var(--ds-radius-sm)] px-2 text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)] transition-colors hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-fg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)]"
        >
            <Icons.ChevronLeft className="size-4" aria-hidden />
            Back to list
        </Link>
    );
}

function Panel({
    title,
    meta,
    children,
}: {
    title: string;
    meta?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="flex flex-col gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-surface)] p-5">
            <header className="flex items-center justify-between gap-3">
                <h3 className="text-[var(--ds-text-md)] font-semibold text-[var(--ds-fg-primary)]">
                    {title}
                </h3>
                {meta}
            </header>
            {children}
        </section>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-0.5">
            <dt className="text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">{label}</dt>
            <dd className="text-[var(--ds-fg-primary)]">{value}</dd>
        </div>
    );
}
