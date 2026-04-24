/**
 * PatternMatch — predictive failure forecast card.
 *
 * Rendered by the Investigator when a live signal signature matches a known
 * historical failure. The card is framed as a *forecast*, not a recognition:
 * the matched past incident becomes the basis for a predicted mean-time-to-
 * failure, not just a trivia point. When `predicted_mttf_hours` /
 * `recommended_action` are provided, the card surfaces them as the primary
 * action; otherwise it degrades gracefully to a similarity comparison.
 */

import { Card } from "../ui";
import type { PatternMatchProps } from "./schemas";

function similarityColor(similarity: number): string {
    if (similarity >= 0.85) return "var(--success)";
    if (similarity >= 0.6) return "var(--warning)";
    return "var(--text-tertiary)";
}

function formatMttf(hours: number): { value: string; unit: string } {
    if (hours < 1) return { value: `${Math.round(hours * 60)}`, unit: "min" };
    if (hours < 48) return { value: hours.toFixed(hours < 10 ? 1 : 0), unit: "h" };
    return { value: (hours / 24).toFixed(hours < 24 * 10 ? 1 : 0), unit: "days" };
}

function formatPastDate(iso: string | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function ForecastBadge({ similarity }: { similarity: number }) {
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
                forecast confidence
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

function MttfRow({ hours }: { hours: number }) {
    const { value, unit } = formatMttf(hours);
    const tone =
        hours <= 24 ? "var(--destructive)" : hours <= 72 ? "var(--warning)" : "var(--foreground)";
    return (
        <div className="flex items-baseline gap-2 rounded-md border border-border-muted bg-muted/40 px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Predicted MTTF
            </span>
            <span
                className="ml-auto font-mono text-sm font-semibold tabular-nums"
                style={{ color: tone }}
            >
                {value}
            </span>
            <span className="text-xs text-muted-foreground">{unit}</span>
        </div>
    );
}

export function PatternMatch(props: PatternMatchProps) {
    const {
        cell_id,
        current_event,
        past_event_ref,
        similarity,
        predicted_mttf_hours,
        recommended_action,
        past_event_date,
    } = props;

    const prettyDate = formatPastDate(past_event_date);
    const pastLabel = prettyDate ? `Preceded failure on ${prettyDate}` : "Preceded failure";

    return (
        <div className="w-full max-w-[480px]">
            <div className="relative mb-2 flex justify-center">
                <ConnectorArc />
                <ForecastBadge similarity={similarity} />
            </div>

            <Card className="w-full" padding="md">
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                        <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                            · Live signature
                        </div>
                        <p className="text-sm leading-snug text-foreground">{current_event}</p>
                    </div>
                    <div className="flex flex-col gap-1.5 border-l border-border-muted pl-4">
                        <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                            · {pastLabel}
                        </div>
                        <p className="text-sm leading-snug text-text-tertiary">{past_event_ref}</p>
                    </div>
                </div>

                {predicted_mttf_hours !== undefined && (
                    <div className="mt-3">
                        <MttfRow hours={predicted_mttf_hours} />
                    </div>
                )}

                {recommended_action && (
                    <div className="mt-2 rounded-md border border-border-muted bg-card px-3 py-2">
                        <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                            Recommended · act now
                        </div>
                        <p className="mt-0.5 text-sm leading-snug text-foreground">
                            {recommended_action}
                        </p>
                    </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-border-muted pt-3 text-xs text-muted-foreground">
                    <span>
                        Cell <span className="font-mono text-foreground">{cell_id}</span>
                    </span>
                    <span className="font-mono tabular-nums">
                        based on historical pattern · {Math.round(similarity * 100)}%
                    </span>
                </div>
            </Card>
        </div>
    );
}
