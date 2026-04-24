/**
 * SandboxExecution — M5.7 / #105 render artifact.
 *
 * Rendered by the Managed Investigator after it runs a Python analysis
 * inside Anthropic's cloud sandbox and before it calls `submit_rca`.
 * Shows the operator (and the judges) three things:
 *
 *   1. The Python script that actually executed — verbatim, in a
 *      monospaced code block.
 *   2. The key=value output the script printed — verbatim, highlighted.
 *   3. An "ran in Anthropic sandbox" chip, so the capability is
 *      labelled rather than implied.
 *
 * The RCA text carries the same numerical output in its `Sandbox: ...`
 * prefix (see `backend/agents/investigator/prompts.py`) — this card is
 * the *visual* side of the same evidence.
 *
 * Design discipline (DESIGN_PLAN_v2 §9): no pulse / no glow /
 * no neon / no shimmer. Tokens only. Static depth via the shared
 * `Card` primitive.
 */

import { Card, Icons } from "../ui";
import type { SandboxExecutionProps } from "./schemas";

type Technique = SandboxExecutionProps["technique"];

const TECHNIQUE_LABELS: Record<Technique, string> = {
    regression: "Linear regression",
    correlation: "Pearson correlation",
    fft: "FFT spectral analysis",
    cusum: "CUSUM drift detection",
    other: "Numerical analysis",
};

const TECHNIQUE_HINTS: Record<Technique, string> = {
    regression: "slope · r² · time-to-threshold",
    correlation: "rho · sample count",
    fft: "dominant frequency · bearing fault match",
    cusum: "mean shift · control-limit exceedance",
    other: "key=value numerical output",
};

function SandboxChip() {
    return (
        <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
            style={{
                color: "var(--accent-arc)",
                borderColor: "var(--accent-arc)",
                // color-mix tint keeps the chip legible without introducing
                // a new token — same pattern as AnomalyBanner forecast tone.
                background: "color-mix(in oklab, var(--accent-arc) 8%, var(--card))",
            }}
            title="This script ran as real Python inside Anthropic's Managed Agents cloud container."
        >
            <Icons.Sparkles className="size-3" aria-hidden />
            Ran in Anthropic sandbox
        </span>
    );
}

interface FooterMetaProps {
    cellId: number;
    signalDefIds?: number[];
    windowHours?: number;
}

function FooterMeta({ cellId, signalDefIds, windowHours }: FooterMetaProps) {
    const bits: string[] = [`Cell ${cellId}`];
    if (windowHours !== undefined && windowHours > 0) {
        const label = windowHours < 1 ? `${Math.round(windowHours * 60)} min` : `${windowHours}h`;
        bits.push(`Window ${label}`);
    }
    if (signalDefIds && signalDefIds.length > 0) {
        bits.push(`Signal${signalDefIds.length > 1 ? "s" : ""} #${signalDefIds.join(" · #")}`);
    }
    return (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border-muted pt-2 font-mono text-[11px] text-muted-foreground">
            {bits.map((bit) => (
                <span key={bit}>{bit}</span>
            ))}
        </div>
    );
}

export function SandboxExecution(props: SandboxExecutionProps) {
    const { cell_id, technique, script, output, signal_def_ids, window_hours } = props;
    const title = TECHNIQUE_LABELS[technique];
    const hint = TECHNIQUE_HINTS[technique];

    return (
        <Card className="w-full max-w-[560px]" padding="md">
            <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        <Icons.Cpu className="size-3" aria-hidden />
                        Sandbox execution
                    </div>
                    <h3 className="text-base font-medium tracking-[-0.01em] text-foreground">
                        {title}
                    </h3>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                </div>
                <SandboxChip />
            </header>

            <section aria-label="Python script" className="mb-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Script
                </div>
                <pre className="max-h-[240px] overflow-auto rounded-lg border border-border-muted bg-muted/50 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                    <code>{script.trim()}</code>
                </pre>
            </section>

            <section aria-label="Numerical output">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Output
                </div>
                <pre
                    className="rounded-lg border p-3 font-mono text-xs leading-relaxed"
                    style={{
                        borderColor: "var(--accent-arc)",
                        color: "var(--foreground)",
                        background: "color-mix(in oklab, var(--accent-arc) 6%, var(--card))",
                    }}
                >
                    <code>{output.trim() || "(no output)"}</code>
                </pre>
            </section>

            <FooterMeta cellId={cell_id} signalDefIds={signal_def_ids} windowHours={window_hours} />
        </Card>
    );
}
