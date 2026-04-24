/**
 * ArtifactCanvas — the workspace's "wow" surface.
 *
 * Pulls every `artifact` part the agents have emitted from the chat
 * conversation and renders them in a responsive 12-column grid. Each
 * artifact gets a cinematic entrance: fade + lift + soft scale, with a
 * tiny stagger keyed off its arrival index so a burst of artifacts from
 * one turn cascades in instead of popping all at once.
 *
 * Layout heuristic per artifact `component`:
 *   - signal_chart, bar_chart        → 12 cols (full width, breathes)
 *   - diagnostic_card, work_order    → 12 cols (wide narrative cards)
 *   - pattern_match                  → 12 cols (decorative connector)
 *   - kb_progress, alert_banner      → 12 cols (status full-width)
 *   - equipment_kb_card              → 6 cols on lg+
 *
 * The canvas is the single biggest visual differentiator of the demo —
 * artifacts that read as cramped in the side drawer become genuinely
 * impressive once they have a full-width canvas to inhabit.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { ArtifactRenderer } from "../../components/artifacts";
import { Badge, Icons } from "../../components/ui";
import type { WorkspaceArtifact } from "./useWorkspaceArtifacts";

const KNOWN_AGENTS = new Set(["sentinel", "investigator", "kb_builder", "work_order", "qa"]);

const FULL_WIDTH = new Set([
    "signal_chart",
    "bar_chart",
    "diagnostic_card",
    "work_order_card",
    "pattern_match",
    "kb_progress",
    "alert_banner",
]);

function spanFor(component: string): string {
    if (FULL_WIDTH.has(component)) return "col-span-12";
    return "col-span-12 lg:col-span-6";
}

function formatAgentLabel(id: string): string {
    if (id === "kb_builder") return "KB Builder";
    if (id === "work_order") return "Work Order";
    if (id === "qa") return "QA";
    return id.charAt(0).toUpperCase() + id.slice(1);
}

function formatClock(ts: number): string {
    return new Date(ts).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

function humanComponent(name: string): string {
    return name.replace(/_/g, " ");
}

export interface ArtifactCanvasProps {
    artifacts: WorkspaceArtifact[];
}

export function ArtifactCanvas({ artifacts }: ArtifactCanvasProps) {
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const lastCountRef = useRef(0);

    // Auto-scroll to the freshly-arrived artifact so the demo always lands
    // on the most recent piece of evidence the agents produced. We only
    // scroll when the count grew (no jitter on prop re-renders).
    useEffect(() => {
        if (artifacts.length > lastCountRef.current && scrollRef.current) {
            const el = scrollRef.current;
            // Scroll-to-bottom within the next paint so the layout sees the
            // newly-mounted artifact.
            requestAnimationFrame(() => {
                el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            });
        }
        lastCountRef.current = artifacts.length;
    }, [artifacts.length]);

    if (artifacts.length === 0) {
        return <EmptyCanvas />;
    }

    return (
        <div ref={scrollRef} className="h-full overflow-y-auto px-8 py-8">
            <div className="mx-auto grid max-w-[1400px] grid-cols-12 gap-6">
                <AnimatePresence initial={false}>
                    {artifacts.map((art) => (
                        <motion.div
                            key={art.id}
                            layout
                            initial={{ opacity: 0, y: 20, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            transition={{
                                duration: 0.45,
                                ease: [0.22, 1, 0.36, 1],
                                delay: 0,
                            }}
                            className={spanFor(art.component)}
                        >
                            <ArtifactWithCaption artifact={art} />
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
}

interface ArtifactWithCaptionProps {
    artifact: WorkspaceArtifact;
}

/**
 * Wraps the renderer with an eyebrow strip identifying which agent
 * produced the artifact and when — the workspace's narrative seam.
 * Card chrome stays minimal so the artifact itself is the visual hero.
 */
function ArtifactWithCaption({ artifact }: ArtifactWithCaptionProps) {
    const agentKey = KNOWN_AGENTS.has(artifact.agent) ? (artifact.agent as never) : undefined;
    return (
        <figure className="group flex h-full flex-col gap-2.5">
            <figcaption className="flex items-center gap-2 px-1">
                <span
                    aria-hidden
                    className="inline-block size-1.5 rounded-full bg-[var(--accent-arc,var(--primary))]"
                />
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
                    {humanComponent(artifact.component)}
                </span>
                <span aria-hidden className="text-text-tertiary">
                    ·
                </span>
                {agentKey ? (
                    <Badge variant="agent" agent={agentKey}>
                        {formatAgentLabel(artifact.agent)}
                    </Badge>
                ) : (
                    <Badge variant="default">{formatAgentLabel(artifact.agent)}</Badge>
                )}
                <span className="ml-auto text-[10px] text-text-tertiary tabular-nums">
                    {formatClock(artifact.emittedAt)}
                </span>
            </figcaption>
            {/* Each artifact component already owns its border/bg/padding — we
                deliberately do *not* wrap it in another card here so charts
                fill the column edge-to-edge instead of being lost in the
                middle of an empty oversized box. */}
            <div className="flex-1 [&>*]:h-full [&>*]:w-full">
                <ArtifactRenderer component={artifact.component} props={artifact.props} />
            </div>
        </figure>
    );
}

function EmptyCanvas() {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-8 py-12 text-center">
            <div
                className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
                aria-hidden
            >
                <Icons.Sparkles className="size-5" />
            </div>
            <div className="flex max-w-md flex-col gap-2">
                <h2 className="text-lg font-medium tracking-[-0.01em] text-foreground">
                    Ask ARIA something — its answers will land here
                </h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    Charts, diagnostics, work orders and pattern matches the agents produce appear
                    in this canvas with full breathing room. The composer on the right is the same
                    conversation as the side drawer — pick whichever surface fits the moment.
                </p>
            </div>
        </div>
    );
}
