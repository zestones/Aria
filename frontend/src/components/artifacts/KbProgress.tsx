/**
 * KbProgress — M8.5 real artifact.
 *
 * Vertical step list streamed by the KB Builder agent during PDF parsing /
 * KB compilation (Scene 1 — onboarding). Step indicators reflect status:
 * pending (empty ring), in_progress (spinner), done (filled check),
 * skipped (dashed). No animation loops per §9.
 */

import { Badge, Card, Icons } from "../ui";
import type { KbProgressProps } from "./schemas";

type StepStatus = "pending" | "in_progress" | "done" | "skipped";

function StepIndicator({ status }: { status: StepStatus }) {
    if (status === "done") {
        return (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success">
                <Icons.Check
                    className="h-3 w-3"
                    style={{ color: "var(--success-foreground)" }}
                    strokeWidth={3}
                    aria-hidden
                />
            </div>
        );
    }
    if (status === "in_progress") {
        return (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-card">
                <Icons.Activity className="h-3 w-3 text-primary" aria-hidden />
            </div>
        );
    }
    if (status === "skipped") {
        return (
            <div className="h-5 w-5 shrink-0 rounded-full border-2 border-dashed border-border-muted bg-card" />
        );
    }
    return <div className="h-5 w-5 shrink-0 rounded-full border-2 border-border-muted bg-card" />;
}

export function KbProgress(props: KbProgressProps) {
    const { cell_id, steps } = props;
    const total = steps.length;
    const done = steps.filter((s) => s.status === "done").length;
    const inProgress = steps.some((s) => s.status === "in_progress");
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);

    return (
        <Card className="w-full" padding="md">
            <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Badge variant="agent" agent="kb_builder" size="sm">
                        KB Builder
                    </Badge>
                    <span className="text-sm font-medium text-foreground">
                        Building knowledge base
                    </span>
                </div>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {done}/{total}
                </span>
            </div>

            <div className="mb-4 h-1 w-full overflow-hidden rounded-full bg-border-muted">
                <div
                    className="h-full bg-primary transition-[width] duration-500 ease-out"
                    style={{ width: `${pct}%` }}
                />
            </div>

            <ol className="space-y-2.5">
                {steps.map((step, idx) => (
                    <li
                        // biome-ignore lint/suspicious/noArrayIndexKey: steps are stable within a single render
                        key={idx}
                        className="flex items-center gap-3"
                    >
                        <StepIndicator status={step.status} />
                        <div className="min-w-0 flex-1">
                            <span
                                className={
                                    step.status === "done"
                                        ? "text-sm text-muted-foreground"
                                        : step.status === "skipped"
                                          ? "text-sm text-text-tertiary line-through"
                                          : "text-sm text-foreground"
                                }
                            >
                                {step.label}
                            </span>
                        </div>
                        <span className="text-[11px] uppercase tracking-widest text-text-tertiary">
                            {step.status === "in_progress" ? "Working" : step.status}
                        </span>
                    </li>
                ))}
            </ol>

            <div className="mt-4 flex items-center justify-between border-t border-border-muted pt-3 text-[11px] text-muted-foreground">
                <span className="font-mono">Cell {cell_id}</span>
                <span>
                    {inProgress ? "Parsing in progress" : done === total ? "Complete" : "Pending"}
                </span>
            </div>
        </Card>
    );
}
