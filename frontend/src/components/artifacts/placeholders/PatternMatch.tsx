/**
 * PatternMatch — M8.4 real artifact.
 *
 * Side-by-side "current vs matched" event view emitted by the Investigator
 * agent when a known historical pattern matches the live incident
 * (Scene 3 — RCA via memory). Decorative arc connector reflects DESIGN.md
 * "orbital" gesture.
 */

import { Card } from "../../ui";
import type { PatternMatchProps } from "../schemas";

function similarityColor(similarity: number): string {
    if (similarity >= 0.85) return "var(--success)";
    if (similarity >= 0.6) return "var(--warning)";
    return "var(--text-tertiary)";
}

function SimilarityBadge({ similarity }: { similarity: number }) {
    const color = similarityColor(similarity);
    const pct = Math.round(Math.max(0, Math.min(1, similarity)) * 100);
    return (
        <div
            className="inline-flex items-center gap-1.5 rounded-full border-2 bg-card px-3 py-0.5 shadow-card"
            style={{ borderColor: color }}
        >
            <span className="font-mono text-xs font-semibold tabular-nums" style={{ color }}>
                {pct}%
            </span>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                match
            </span>
        </div>
    );
}

function ConnectorArc() {
    return (
        <svg
            width="100%"
            height="24"
            viewBox="0 0 480 24"
            preserveAspectRatio="none"
            aria-hidden="true"
            focusable="false"
            role="presentation"
            className="pointer-events-none absolute inset-x-0 -top-3"
        >
            <path
                d="M 80 20 Q 240 4 400 20"
                stroke="var(--accent-arc)"
                strokeWidth={1.25}
                fill="none"
                opacity={0.55}
            />
        </svg>
    );
}

export function PatternMatch(props: PatternMatchProps) {
    const { cell_id, current_event, past_event_ref, similarity } = props;

    return (
        <div className="w-full max-w-[480px]">
            <div className="relative mb-2 flex justify-center">
                <ConnectorArc />
                <SimilarityBadge similarity={similarity} />
            </div>

            <Card className="w-full" padding="md">
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                            · Current
                        </div>
                        <p className="text-sm leading-snug text-foreground">{current_event}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 border-l border-border-muted pl-4">
                        <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                            · Matched
                        </div>
                        <p className="text-sm leading-snug text-text-tertiary">{past_event_ref}</p>
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border-muted pt-3 text-xs text-muted-foreground">
                    <span>
                        Cell <span className="font-mono text-foreground">{cell_id}</span>
                    </span>
                    <span className="font-mono tabular-nums">
                        similarity {Math.round(similarity * 100)}%
                    </span>
                </div>
            </Card>
        </div>
    );
}
