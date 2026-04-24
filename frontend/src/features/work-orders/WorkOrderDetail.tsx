/**
 * Work Order detail — M9.1.
 *
 * Fetches a single WO by route param, renders every field in sober DS
 * signatures (no ad-hoc markup), offers `Print` which triggers
 * `window.print()`. The on-screen layout is suppressed under `@media print`
 * (see `PrintableWorkOrder`) so the printed page uses the dedicated layout.
 */

import { AnimatePresence, motion } from "framer-motion";
import { createPortal } from "react-dom";
import { Link, useParams } from "react-router-dom";
import { Badge, Hairline, Icons, MetaStrip, SectionHeader, StatusDot } from "../../components/ui";
import { fadeInUp } from "../../components/ui/motion";
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

    return (
        <section className="flex h-full flex-col gap-6 overflow-auto p-6 print:hidden">
            <div className="flex items-start justify-between gap-4">
                <BackLink />
                <button
                    type="button"
                    onClick={() => window.print()}
                    aria-label="Print this work order"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors duration-150 hover:border-input hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <StatusDot status={statusToDotStatus(wo.status)} />
                            <span className="text-foreground">{wo.status.replace(/_/g, " ")}</span>
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
            <AgentWorkingBanner status={wo.status} />
            {wo.description && (
                <Panel title="Description">
                    <p className="whitespace-pre-wrap text-sm leading-[1.55] text-foreground">
                        {wo.description}
                    </p>
                </Panel>
            )}
            {wo.rca_summary && (
                <Panel title="Root cause analysis" meta={<Badge variant="accent">RCA ready</Badge>}>
                    <p className="whitespace-pre-wrap text-sm leading-[1.55] text-foreground">
                        {wo.rca_summary}
                    </p>
                </Panel>
            )}
            {actions.length > 0 && (
                <Panel title="Recommended actions">
                    <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-[1.55] text-foreground">
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
                    <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
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
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
            <header className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">{title}</h3>
                {meta}
            </header>
            {children}
        </section>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-foreground">{value}</dd>
        </div>
    );
}
