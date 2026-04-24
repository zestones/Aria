/**
 * DiagnosticCard — M8.4 real artifact.
 *
 * Renders a root-cause diagnostic from the Investigator agent (Scene 3 — RCA).
 * Self-contained — no fetch. Shows agent badge, title, confidence ring (SVG),
 * root cause, contributing factors, and a CTA to spawn a work order.
 */

import { Badge, Button, Card, CardTitle, Icons } from "../ui";
import type { DiagnosticCardProps } from "./schemas";

function confidenceColor(conf: number): string {
    if (conf >= 0.8) return "var(--success)";
    if (conf >= 0.5) return "var(--warning)";
    return "var(--destructive)";
}

function ConfidenceRing({ confidence, size = 44 }: { confidence: number; size?: number }) {
    const radius = size / 2 - 3;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(1, confidence));
    const offset = circumference * (1 - clamped);
    const color = confidenceColor(clamped);

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="shrink-0"
            role="img"
            aria-label={`Confidence ${Math.round(clamped * 100)} percent`}
        >
            <title>{`Confidence ${Math.round(clamped * 100)}%`}</title>
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="var(--border-muted)"
                strokeWidth={2}
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                style={{
                    transform: "rotate(-90deg)",
                    transformOrigin: `${size / 2}px ${size / 2}px`,
                }}
            />
            <text
                x={size / 2}
                y={size / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={size / 3.6}
                fontWeight={600}
                fill={color}
                style={{ fontVariantNumeric: "tabular-nums" }}
            >
                {Math.round(clamped * 100)}%
            </text>
        </svg>
    );
}

export function DiagnosticCard(props: DiagnosticCardProps) {
    const { cell_id, title, confidence, root_cause, contributing_factors, pattern_match_id } =
        props;

    return (
        <Card className="w-full" padding="md">
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <Badge variant="agent" agent="investigator" size="sm">
                            Investigator
                        </Badge>
                        <span className="font-mono text-[11px] text-muted-foreground">
                            Cell {cell_id}
                        </span>
                    </div>
                    <CardTitle className="text-base">{title}</CardTitle>
                </div>
                <ConfidenceRing confidence={confidence} />
            </div>

            <div className="mb-3">
                <h4 className="mb-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    · Root cause
                </h4>
                <p className="text-sm leading-snug text-foreground">{root_cause}</p>
            </div>

            {contributing_factors.length > 0 && (
                <div className="mb-4">
                    <h4 className="mb-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                        · Contributing factors
                    </h4>
                    <ul className="space-y-1">
                        {contributing_factors.map((factor, idx) => (
                            <li
                                // biome-ignore lint/suspicious/noArrayIndexKey: factors are stable within a single render
                                key={idx}
                                className="flex items-start gap-2 text-sm text-foreground"
                            >
                                <Icons.ChevronRight
                                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                    aria-hidden
                                />
                                <span>{factor}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {pattern_match_id !== undefined && (
                <div className="mb-3 rounded-md bg-accent-soft px-2 py-1.5">
                    <span className="text-xs text-muted-foreground">
                        Matches incident{" "}
                        <span className="font-mono text-foreground">#{pattern_match_id}</span>
                    </span>
                </div>
            )}

            <div className="border-t border-border-muted pt-3">
                <Button variant="default" size="sm" className="w-full">
                    <Icons.Wrench className="h-4 w-4" aria-hidden />
                    <span>Generate work order</span>
                </Button>
            </div>
        </Card>
    );
}
