/**
 * Work Order detail — M9.1.
 *
 * Fetches a single WO by route param, renders every field in sober DS
 * signatures (no ad-hoc markup), offers `Print` which triggers
 * `window.print()`. The on-screen layout is suppressed under `@media print`
 * (see `PrintableWorkOrder`) so the printed page uses the dedicated layout.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Icons, StatusDot } from "../../components/ui";
import { fadeInUp } from "../../components/ui/motion";
import { getUser } from "../../services/auth";
import { PrintableWorkOrder } from "./PrintableWorkOrder";
import type { WorkOrder } from "./types";
import { useDeleteWorkOrder, useWorkOrder } from "./useWorkOrders";
import { useWorkOrdersStream } from "./useWorkOrdersStream";
import { parseList } from "./utils";
import { WorkOrderEditForm } from "./WorkOrderEditForm";

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

/** Left-bar accent color for the hero card, keyed by priority. */
function priorityBarColor(priority: string): string {
    if (priority === "critical") return "var(--destructive)";
    if (priority === "high") return "var(--warning)";
    if (priority === "medium") return "var(--accent-arc, var(--primary))";
    return "var(--border)";
}

function statusToDotStatus(status: string): "nominal" | "warning" | "critical" | "unknown" {
    if (status === "completed") return "nominal";
    if (status === "in_progress" || status === "open") return "nominal";
    if (status === "cancelled") return "warning";
    return "critical";
}

/**
 * Full-screen centered animation shown while ARIA agents are processing.
 * Replaces the content area (no other panels show during detected/analyzed).
 *
 * Phase colors:
 *   detected  → agent-investigator (blue-purple arc)
 *   analyzed  → agent-work-order   (signal orange)
 */
function AgentWorkingBanner({ status }: { status: string }) {
    const isDetected = status === "detected";
    const isAnalyzed = status === "analyzed";
    const active = isDetected || isAnalyzed;

    const label = isDetected ? "Investigating anomaly" : "Building work order";
    const sub = isDetected
        ? "Root-cause analysis in progress — may take up to 2 min"
        : "Generating recommended actions and parts list";
    const phase: "investigate" | "generate" = isDetected ? "investigate" : "generate";

    return (
        <AnimatePresence initial={false}>
            {active && (
                <motion.div
                    key="agent-working"
                    variants={fadeInUp}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className="flex flex-1 flex-col items-center justify-center gap-8 py-16"
                    role="status"
                    aria-live="polite"
                    aria-label={label}
                    data-testid="wo-agent-working-banner"
                >
                    <RadarScanSVG phase={phase} />
                    <div className="flex flex-col items-center gap-1.5 text-center">
                        <span className="text-base font-semibold tracking-tight text-foreground">
                            {label}
                        </span>
                        <span className="max-w-xs text-sm text-muted-foreground">{sub}</span>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/**
 * Radar-sweep SVG — a rotating scan line with a 60° trail and staggered
 * "blip" dots that pulse as if being discovered. Communicates "scanning /
 * analyzing" without shimmer, glow, or decorative loops.
 *
 * The outer ring radius is 70 px; center at (80, 80) in a 160×160 viewBox.
 * Arc math: scan line points to (80, 10) = 270°; trail end at 210°
 * → path `M80,80 L80,10 A70,70 0 0,0 19.4,45 Z` (60° counterclockwise wedge).
 */
function RadarScanSVG({ phase }: { phase: "investigate" | "generate" }) {
    const accent =
        phase === "investigate"
            ? "var(--agent-investigator, var(--accent-arc))"
            : "var(--agent-work-order, var(--warning))";

    const blips: { cx: number; cy: number; delay: number }[] = [
        { cx: 48, cy: 38, delay: 0.3 },
        { cx: 112, cy: 55, delay: 1.2 },
        { cx: 42, cy: 100, delay: 2.6 },
        { cx: 108, cy: 108, delay: 0.9 },
        { cx: 122, cy: 78, delay: 3.1 },
        { cx: 65, cy: 125, delay: 1.8 },
    ];

    return (
        <svg
            viewBox="0 0 160 160"
            width="160"
            height="160"
            aria-hidden="true"
            style={{ overflow: "visible" }}
        >
            {/* Concentric guide rings */}
            <circle
                cx="80"
                cy="80"
                r="70"
                fill="none"
                stroke="var(--border)"
                strokeWidth="1"
                opacity="0.5"
            />
            <circle
                cx="80"
                cy="80"
                r="50"
                fill="none"
                stroke="var(--border)"
                strokeWidth="0.75"
                opacity="0.4"
            />
            <circle
                cx="80"
                cy="80"
                r="30"
                fill="none"
                stroke="var(--border)"
                strokeWidth="0.5"
                opacity="0.3"
            />

            {/* Rotating scanner: 60° sweep wedge + scan line.
                Uses SVG-native SMIL <animateTransform> for bulletproof rotation
                (immune to CSS transform-origin quirks, framer-motion config, and
                OS prefers-reduced-motion). Pivot is (80,80) via `from`/`to`. */}
            <g>
                <animateTransform
                    attributeName="transform"
                    attributeType="XML"
                    type="rotate"
                    from="0 80 80"
                    to="360 80 80"
                    dur="4s"
                    repeatCount="indefinite"
                />
                {/* Wedge trail behind the scan line */}
                <path d="M80,80 L80,10 A70,70 0 0,0 19.4,45 Z" fill={accent} opacity="0.1" />
                {/* Scan line */}
                <line
                    x1="80"
                    y1="80"
                    x2="80"
                    y2="10"
                    stroke={accent}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    opacity="0.85"
                />
            </g>

            {/* Blip dots: staggered appear → fade, as if discovered by sweep */}
            {blips.map(({ cx, cy, delay }) => (
                <motion.circle
                    key={`${cx}-${cy}`}
                    cx={cx}
                    cy={cy}
                    r={3.5}
                    fill={accent}
                    animate={{ opacity: [0, 0.9, 0.5, 0], scale: [0.3, 1, 0.8, 0.3] }}
                    transition={{ duration: 4, delay, repeat: Infinity, ease: "easeOut" }}
                    style={{ transformOrigin: `${cx}px ${cy}px` }}
                />
            ))}

            {/* Center crosshair */}
            <circle cx="80" cy="80" r="7" fill={accent} opacity="0.12" />
            <circle cx="80" cy="80" r="3.5" fill={accent} />
            <line x1="73" y1="80" x2="87" y2="80" stroke="var(--card)" strokeWidth="1.25" />
            <line x1="80" y1="73" x2="80" y2="87" stroke="var(--card)" strokeWidth="1.25" />
        </svg>
    );
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
                <p className="text-sm text-destructive">Invalid work order id.</p>
            </section>
        );
    }

    if (query.isPending) {
        return (
            <section className="flex h-full flex-col gap-4 p-6 print:hidden">
                <BackLink />
                <p className="text-sm text-text-tertiary">Loading…</p>
            </section>
        );
    }

    if (query.isError || !query.data) {
        return (
            <section className="flex h-full flex-col gap-4 p-6 print:hidden">
                <BackLink />
                <p className="text-sm text-destructive">
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
    const navigate = useNavigate();
    const user = getUser();
    const canEdit = user?.role === "admin" || user?.role === "operator";
    const canDelete = user?.role === "admin";
    const agentBusy = wo.status === "detected" || wo.status === "analyzed";

    const [editing, setEditing] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const deleteMutation = useDeleteWorkOrder();

    const handleDelete = () => {
        deleteMutation.mutate(wo.id, {
            onSuccess: () => navigate("/work-orders", { replace: true }),
        });
    };

    if (editing) {
        return (
            <section className="flex h-full flex-col overflow-auto bg-background print:hidden">
                <div className="sticky top-0 z-10 flex flex-none items-center justify-between gap-4 border-b border-border bg-background/95 px-6 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
                    <BackLink />
                    <span className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
                        <Icons.FileText className="size-3.5" aria-hidden />
                        Editing — only changed fields are sent
                    </span>
                </div>
                <div className="px-6 py-6">
                    <WorkOrderEditForm
                        wo={wo}
                        onCancel={() => setEditing(false)}
                        onSaved={() => setEditing(false)}
                    />
                </div>
            </section>
        );
    }

    return (
        <section className="flex h-full flex-col overflow-auto bg-background print:hidden">
            {/* Sticky toolbar — back link + prominent action group */}
            <div className="sticky top-0 z-10 flex flex-none items-center justify-between gap-4 border-b border-border bg-background/95 px-6 py-3 backdrop-blur supports-backdrop-filter:bg-background/80">
                <BackLink />
                <div className="flex items-center gap-2">
                    {canEdit && !agentBusy && (
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditing(true)}
                        >
                            <Icons.FileText className="size-4" aria-hidden />
                            Edit
                        </Button>
                    )}
                    <button
                        type="button"
                        onClick={() => window.print()}
                        aria-label="Print this work order"
                        className="inline-flex h-9 items-center gap-1.5 rounded-cta border-[1.5px] border-border bg-card px-3 text-sm font-medium text-foreground shadow-pill transition-colors duration-150 hover:border-input hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <Icons.Printer className="size-4" aria-hidden />
                        Print
                    </button>
                    {canDelete && !agentBusy && (
                        <button
                            type="button"
                            onClick={() => setConfirmingDelete(true)}
                            aria-label="Delete this work order"
                            className="inline-flex h-9 items-center gap-1.5 rounded-cta border-[1.5px] border-[color-mix(in_oklab,var(--destructive),transparent_70%)] bg-card px-3 text-sm font-medium text-destructive transition-colors duration-150 hover:border-destructive hover:bg-[color-mix(in_oklab,var(--destructive),transparent_92%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Icons.X className="size-4" aria-hidden />
                            Delete
                        </button>
                    )}
                </div>
            </div>

            <div className="flex flex-col gap-6 px-6 py-6">
                {/* Hero card with priority-coloured left bar */}
                <div
                    className="relative flex flex-col gap-4 overflow-hidden rounded-r-xl border border-border bg-card p-6 pl-7"
                    style={{
                        boxShadow: `inset 4px 0 0 0 ${priorityBarColor(wo.priority)}`,
                    }}
                >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={priorityVariant(wo.priority)}>{wo.priority}</Badge>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
                                <StatusDot status={statusToDotStatus(wo.status)} />
                                <span>{wo.status.replace(/_/g, " ")}</span>
                            </span>
                            {wo.generated_by_agent && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-text-tertiary">
                                    <Icons.Sparkles className="size-3" aria-hidden />
                                    Generated by agent
                                </span>
                            )}
                        </div>
                        <span className="font-mono text-sm text-text-tertiary">#{wo.id}</span>
                    </div>
                    <h2 className="text-2xl font-semibold leading-tight tracking-[-0.015em] text-foreground">
                        {wo.title}
                    </h2>
                    <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <HeroMeta label="Cell" value={wo.cell_name ?? `#${wo.cell_id}`} />
                        <HeroMeta label="Created" value={formatDateTime(wo.created_at)} />
                        {wo.assigned_to_username && (
                            <HeroMeta label="Assigned to" value={wo.assigned_to_username} />
                        )}
                    </dl>
                </div>

                <AgentWorkingBanner status={wo.status} />

                {!agentBusy && (
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                        {/* Main column — narrative content */}
                        <div className="flex min-w-0 flex-col gap-5">
                            {wo.description && (
                                <Panel title="Description">
                                    <p className="whitespace-pre-wrap text-sm leading-[1.6] text-foreground">
                                        {wo.description}
                                    </p>
                                </Panel>
                            )}
                            {wo.rca_summary && (
                                <Panel
                                    title="Root cause analysis"
                                    meta={<Badge variant="accent">RCA ready</Badge>}
                                >
                                    <p className="whitespace-pre-wrap text-sm leading-[1.6] text-foreground">
                                        {wo.rca_summary}
                                    </p>
                                </Panel>
                            )}
                            {actions.length > 0 && (
                                <Panel
                                    title="Recommended actions"
                                    meta={
                                        <span className="text-xs text-text-tertiary">
                                            {actions.length} step{actions.length === 1 ? "" : "s"}
                                        </span>
                                    }
                                >
                                    <ol className="flex flex-col gap-2">
                                        {actions.map((a, i) => (
                                            <li
                                                key={a}
                                                className="flex items-start gap-3 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-background"
                                            >
                                                <span
                                                    aria-hidden
                                                    className="mt-0.5 inline-flex size-6 flex-none items-center justify-center rounded-full border border-border bg-background text-xs font-semibold tabular-nums text-foreground"
                                                >
                                                    {i + 1}
                                                </span>
                                                <span className="text-sm leading-[1.55] text-foreground">
                                                    {a}
                                                </span>
                                            </li>
                                        ))}
                                    </ol>
                                </Panel>
                            )}
                        </div>

                        {/* Side rail — operational details */}
                        <aside className="flex flex-col gap-5">
                            {(wo.suggested_window_start || wo.estimated_duration_min != null) && (
                                <Panel
                                    title="Scheduling"
                                    icon={<Icons.Clock className="size-4" aria-hidden />}
                                    compact
                                >
                                    <dl className="flex flex-col gap-2.5 text-sm">
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
                            {parts.length > 0 && (
                                <Panel
                                    title="Required parts"
                                    icon={<Icons.Wrench className="size-4" aria-hidden />}
                                    meta={
                                        <span className="text-xs text-text-tertiary">
                                            {parts.length}
                                        </span>
                                    }
                                    compact
                                >
                                    <ul className="flex flex-col divide-y divide-border">
                                        {parts.map((p) => {
                                            const { qty, name } = parsePart(p);
                                            return (
                                                <li
                                                    key={p}
                                                    className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0"
                                                >
                                                    <span className="inline-flex min-w-[2rem] flex-none items-center justify-center rounded-md border border-border bg-background px-1.5 py-0.5 text-xs font-semibold tabular-nums text-foreground">
                                                        ×{qty}
                                                    </span>
                                                    <span className="text-sm leading-snug text-foreground">
                                                        {name}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </Panel>
                            )}
                            {skills.length > 0 && (
                                <Panel
                                    title="Required skills"
                                    icon={<Icons.User className="size-4" aria-hidden />}
                                    compact
                                >
                                    <ul className="flex flex-wrap gap-1.5">
                                        {skills.map((s) => (
                                            <li key={s}>
                                                <Badge variant="default">{s}</Badge>
                                            </li>
                                        ))}
                                    </ul>
                                </Panel>
                            )}
                        </aside>
                    </div>
                )}
            </div>

            {confirmingDelete && (
                <DeleteConfirmDialog
                    title={wo.title}
                    pending={deleteMutation.isPending}
                    error={deleteMutation.error}
                    onCancel={() => setConfirmingDelete(false)}
                    onConfirm={handleDelete}
                />
            )}
        </section>
    );
}

/** Parse a "1 - Foo bar" / "1x Foo" / "Foo" string into qty + name. */
function parsePart(raw: string): { qty: string; name: string } {
    const trimmed = raw.trim();
    const match = trimmed.match(/^(\d+)\s*(?:-|x|×|\*)\s*(.+)$/i);
    if (match) return { qty: match[1], name: match[2].trim() };
    return { qty: "1", name: trimmed };
}

function HeroMeta({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline gap-1.5">
            <dt className="text-xs uppercase tracking-wide text-text-tertiary">{label}</dt>
            <dd className="font-medium text-foreground">{value}</dd>
        </div>
    );
}

function DeleteConfirmDialog({
    title,
    pending,
    error,
    onCancel,
    onConfirm,
}: {
    title: string;
    pending: boolean;
    error: unknown;
    onCancel: () => void;
    onConfirm: () => void;
}) {
    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="wo-delete-title"
            className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4 print:hidden"
            onClick={(e) => {
                if (e.target === e.currentTarget && !pending) onCancel();
            }}
            onKeyDown={(e) => {
                if (e.key === "Escape" && !pending) onCancel();
            }}
        >
            <div className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-pill">
                <div className="flex items-start gap-3">
                    <div
                        aria-hidden
                        className="flex size-10 flex-none items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--destructive),transparent_85%)] text-destructive"
                    >
                        <Icons.AlertTriangle className="size-5" />
                    </div>
                    <div className="flex flex-col gap-1">
                        <h3
                            id="wo-delete-title"
                            className="text-base font-semibold text-foreground"
                        >
                            Delete this work order?
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            “{title}” will be permanently removed. This cannot be undone.
                        </p>
                    </div>
                </div>
                {error instanceof Error && (
                    <p className="text-sm text-destructive">Could not delete: {error.message}</p>
                )}
                <div className="flex items-center justify-end gap-3">
                    <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        onClick={onCancel}
                        disabled={pending}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        variant="destructive"
                        size="md"
                        onClick={onConfirm}
                        disabled={pending}
                    >
                        {pending ? (
                            <>
                                <Icons.Loader2 className="size-4 animate-spin" aria-hidden />
                                Deleting…
                            </>
                        ) : (
                            <>
                                <Icons.X className="size-4" aria-hidden />
                                Delete
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

function BackLink() {
    return (
        <Link
            to="/work-orders"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
            <Icons.ChevronLeft className="size-4" aria-hidden />
            Back to list
        </Link>
    );
}

function Panel({
    title,
    icon,
    meta,
    compact = false,
    children,
}: {
    title: string;
    icon?: React.ReactNode;
    meta?: React.ReactNode;
    compact?: boolean;
    children: React.ReactNode;
}) {
    return (
        <section
            className={`flex flex-col rounded-xl border border-border bg-card ${
                compact ? "gap-2.5 p-4" : "gap-3 p-5"
            }`}
        >
            <header className="flex items-center justify-between gap-3">
                <h3
                    className={`flex items-center gap-2 font-semibold text-foreground ${
                        compact ? "text-sm" : "text-base"
                    }`}
                >
                    {icon && <span className="text-text-tertiary">{icon}</span>}
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
            <dt className="text-xs uppercase tracking-wide text-text-tertiary">{label}</dt>
            <dd className="text-sm font-medium text-foreground">{value}</dd>
        </div>
    );
}
