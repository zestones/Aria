/**
 * M7.3 — Real-time anomaly banner.
 *
 * Sticky strip under the TopBar. Visible only while at least one anomaly is
 * active. Renders the latest event with severity-tinted surface, a count
 * badge when multiple, a CTA that hands off to the chat drawer, and a
 * dismiss.
 *
 * Design discipline (DESIGN_PLAN_v2 §9):
 *   - no pulse / blink / glow / neon / shimmer
 *   - zero new motion variants — reuses `fadeInUp`
 *   - §2 tokens only; the severity tint is a `color-mix` of an existing
 *     status token with `transparent`, not a fresh hex
 *   - §4 no shadow (the banner sits inside the shell layout, not as overlay)
 *   - §7 icons via the `design-system/icons.tsx` wrapper
 *
 * Keyboard: `Escape` dismisses the current head anomaly.
 *
 * A11y: `role="alert"`. `aria-live="assertive"` on trip, `polite` on alert —
 * operator hears trip barge-ins even mid-screen-reader-speech.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { Button } from "../../components/ui/Button";
import { AlertCircle, AlertTriangle, X } from "../../components/ui/icons";
import { fadeInUp } from "../../components/ui/motion";
import { useChatDrawerOpener } from "../chat/chatDrawerStore";
import { useChatStore } from "../chat/chatStore";
import type { AnomalyEvent } from "./useAnomalyStream";
import { useAnomalyStream } from "./useAnomalyStream";
import type { ForecastEvent } from "./useForecastStream";
import { useForecastStream } from "./useForecastStream";
import { useSignalDefinitions } from "./useSignalDefinitions";

type Severity = AnomalyEvent["severity"];

/**
 * Unified banner item — either a real breach (Sentinel) or a projected
 * breach (forecast-watch). We tag at the source so the banner can branch
 * on copy and tone without inspecting payload shape.
 */
type BannerItem =
    | { kind: "anomaly"; event: AnomalyEvent; stamp: number }
    | { kind: "forecast"; event: ForecastEvent; stamp: number };

function severityTone(
    severity: Severity,
    kind: BannerItem["kind"],
): {
    accentVar: string;
    fgVar: string;
    Icon: typeof AlertTriangle;
} {
    if (kind === "forecast") {
        // Forecasts are advisory — use a cooler, lower-saturation tone even
        // when severity is "trip", so judges read them as "warning ahead",
        // not "pipe bursting right now". `--accent-arc` is the same token
        // the SignalChart forecast line uses — visual rhyme intended.
        return {
            accentVar: "var(--accent-arc)",
            fgVar: "var(--accent-arc)",
            Icon: AlertTriangle,
        };
    }
    if (severity === "trip") {
        return {
            accentVar: "var(--destructive)",
            fgVar: "var(--destructive)",
            Icon: AlertCircle,
        };
    }
    return {
        accentVar: "var(--warning)",
        fgVar: "var(--warning)",
        Icon: AlertTriangle,
    };
}

function formatEta(hours: number): string {
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
    if (hours < 48) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} h`;
    return `${(hours / 24).toFixed(hours < 24 * 10 ? 1 : 0)} days`;
}

/**
 * Compact relative-time formatter for the banner metadata.
 *
 * The banner only ever shows anomalies seconds to minutes old — the demo
 * flow resolves or dismisses them quickly. We collapse "just now" for <45 s,
 * minutes up to an hour, hours past that.
 */
export function formatRelativeTime(fromMs: number, nowMs: number = Date.now()): string {
    const deltaSec = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
    if (deltaSec < 45) return "just now";
    const deltaMin = Math.floor(deltaSec / 60);
    if (deltaMin < 60) return `${deltaMin}m ago`;
    const deltaHr = Math.floor(deltaMin / 60);
    if (deltaHr < 24) return `${deltaHr}h ago`;
    const deltaDay = Math.floor(deltaHr / 24);
    return `${deltaDay}d ago`;
}

/**
 * Build the CTA prompt handed to the chat. Includes the full anomaly tuple so
 * the agent can act on it without a round-trip for context.
 */
export function buildInvestigatePrompt(args: {
    event: AnomalyEvent;
    signalLabel: string;
    relativeTime: string;
}): string {
    const { event, signalLabel, relativeTime } = args;
    return (
        `Investigate anomaly on Cell ${event.cell_id}: ${signalLabel} ${event.direction} ` +
        `of threshold (value ${event.value}, limit ${event.threshold}) detected ${relativeTime}.`
    );
}

/** Prompt handed to the chat when the operator clicks "Investigate" on a
 *  forecast warning. Distinct from the breach prompt — we want the agent to
 *  frame this as a drift projection, not a failure post-mortem. */
export function buildForecastPrompt(args: { event: ForecastEvent; signalLabel: string }): string {
    const { event, signalLabel } = args;
    const eta = formatEta(event.eta_hours);
    const confidencePct = Math.round(event.confidence * 100);
    return (
        `Forecast breach on Cell ${event.cell_id}: ${signalLabel} is ${event.trend} toward ` +
        `its ${event.threshold_field} threshold (${event.current_value} → ${event.threshold_value}) ` +
        `in ~${eta} at the current drift rate (regression confidence ${confidencePct}%). ` +
        `Assess whether a preventive investigation or maintenance window is warranted now.`
    );
}

interface BannerBodyProps {
    item: BannerItem;
    count: number;
    signalLabel: string;
    onDismiss: () => void;
    onInvestigate: (prompt: string) => void;
}

function BannerBody({ item, count, signalLabel, onDismiss, onInvestigate }: BannerBodyProps) {
    const { accentVar, fgVar, Icon } = severityTone(item.event.severity, item.kind);
    const relativeTime = formatRelativeTime(
        item.kind === "anomaly" ? item.event.receivedAt : item.event.receivedAt,
    );

    const description =
        item.kind === "anomaly"
            ? `Cell ${item.event.cell_id} · ${signalLabel} ${item.event.direction} of threshold (${item.event.value} vs ${item.event.threshold})`
            : // Forecast copy is deliberately forward-looking: "will breach",
              // not "breached". The ETA is the headline — that is what makes
              // the banner *predictive* rather than reactive.
              `Cell ${item.event.cell_id} · ${signalLabel} forecast to breach ` +
              `${item.event.threshold_field} (${item.event.current_value} → ${item.event.threshold_value}) ` +
              `in ~${formatEta(item.event.eta_hours)}`;

    const kindLabel =
        item.kind === "forecast"
            ? `Forecast · ${Math.round(item.event.confidence * 100)}% confidence`
            : null;

    // `color-mix` tint — very subtle surface, tokens only.
    const background = `color-mix(in oklab, ${accentVar} 12%, var(--card))`;

    const ariaLive =
        item.kind === "anomaly"
            ? item.event.severity === "trip"
                ? "assertive"
                : "polite"
            : "polite"; // forecasts never barge in — they are advisory.

    const investigatePrompt =
        item.kind === "anomaly"
            ? buildInvestigatePrompt({
                  event: item.event,
                  signalLabel,
                  relativeTime,
              })
            : buildForecastPrompt({ event: item.event, signalLabel });

    return (
        <motion.div
            key={item.event.id}
            role="alert"
            aria-live={ariaLive}
            data-kind={item.kind}
            data-severity={item.event.severity}
            data-testid="anomaly-banner"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="relative flex items-center gap-3 border-b border-border px-4"
            style={{
                minHeight: 44,
                paddingLeft: 16,
                background,
            }}
        >
            {/* Left rail: static, no pulse/glow per §9. */}
            <span
                aria-hidden="true"
                className="absolute left-0 top-0 bottom-0"
                style={{ width: 3, background: accentVar }}
            />

            <Icon size={16} style={{ color: fgVar }} aria-hidden="true" />

            {kindLabel && (
                <span
                    className="whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-widest"
                    style={{
                        borderColor: accentVar,
                        color: fgVar,
                    }}
                    data-testid="anomaly-banner-kind"
                >
                    {kindLabel}
                </span>
            )}

            <span
                className="text-sm font-medium text-foreground truncate"
                data-testid="anomaly-banner-text"
            >
                {description}
            </span>

            <span className="text-xs text-muted-foreground whitespace-nowrap">{relativeTime}</span>

            {count > 1 && (
                <span
                    data-testid="anomaly-banner-count"
                    className="ml-auto rounded-md border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                >
                    +{count - 1} more
                </span>
            )}

            <div className={`${count > 1 ? "" : "ml-auto"} flex items-center gap-1`}>
                <Button
                    size="sm"
                    variant="default"
                    onClick={() => onInvestigate(investigatePrompt)}
                    data-testid="anomaly-banner-investigate"
                >
                    {item.kind === "forecast" ? "Assess" : "Investigate"}
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onDismiss}
                    aria-label={item.kind === "forecast" ? "Dismiss forecast" : "Dismiss anomaly"}
                    data-testid="anomaly-banner-dismiss"
                    className="px-2"
                >
                    <X size={14} aria-hidden="true" />
                </Button>
            </div>
        </motion.div>
    );
}

export interface AnomalyBannerProps {
    /**
     * Test seam — override the anomaly stream to feed a fixed list without
     * mocking the WS runtime. Production mount passes nothing.
     */
    streamOverride?: ReturnType<typeof useAnomalyStream>;
    /**
     * Test seam — override the forecast stream. Production mount passes nothing.
     */
    forecastStreamOverride?: ReturnType<typeof useForecastStream>;
    /**
     * Test seam — override the signal-label lookup. Production mount passes
     * nothing; the hook fetches from `/signals/definitions`.
     */
    resolveSignalLabelOverride?: (signalDefId: number) => string;
}

/**
 * Sticky under-TopBar anomaly + forecast banner. Renders nothing (zero DOM)
 * when both streams are empty, so it does not reserve vertical space.
 *
 * Consumes:
 *  - `useAnomalyStream()` — real threshold breaches (Sentinel)
 *  - `useForecastStream()` — projected breaches (forecast-watch, M9)
 *  - `useChatStore()` for the Investigate/Assess CTA
 *  - `useSignalDefinitions(cellId)` so the text shows `flow_rate` rather
 *    than `Signal #11`; falls back cleanly if the fetch fails.
 *
 * **Merge rule**: real anomalies always win the head slot over forecasts —
 * a breach that has actually happened is more urgent than a projection.
 * Within each group, newest-first. The "+N more" count reflects the union
 * of both streams so operators know how many alerts are queued regardless
 * of kind.
 */
export function AnomalyBanner({
    streamOverride,
    forecastStreamOverride,
    resolveSignalLabelOverride,
}: AnomalyBannerProps = {}) {
    const streamFromHook = useAnomalyStream();
    const forecastFromHook = useForecastStream();
    const stream = streamOverride ?? streamFromHook;
    const forecastStream = forecastStreamOverride ?? forecastFromHook;

    const sendMessage = useChatStore((s) => s.sendMessage);
    const requestFocus = useChatStore((s) => s.requestFocus);
    const requestDrawerOpen = useChatDrawerOpener((s) => s.requestOpen);

    // Head is the first real anomaly if any; otherwise the first forecast.
    // The signal-label hook must fetch definitions for whichever cell owns
    // the head item, so we resolve it per-render.
    const head: BannerItem | null = useMemo(() => {
        if (stream.latest) {
            return { kind: "anomaly", event: stream.latest, stamp: stream.latest.receivedAt };
        }
        if (forecastStream.latest) {
            return {
                kind: "forecast",
                event: forecastStream.latest,
                stamp: forecastStream.latest.receivedAt,
            };
        }
        return null;
    }, [stream.latest, forecastStream.latest]);

    const totalCount = stream.count + forecastStream.count;

    const headCellId = head?.event.cell_id;
    const signalDefs = useSignalDefinitions(headCellId ?? null);
    const signalLabel = useMemo(() => {
        if (!head) return "";
        if (resolveSignalLabelOverride) {
            return resolveSignalLabelOverride(head.event.signal_def_id);
        }
        const fromDefs = signalDefs.resolve(head.event.signal_def_id);
        if (fromDefs) return fromDefs;
        // Forecast payloads always carry a `signal_name`; prefer it over the
        // generic `Signal #X` fallback for a cleaner banner on fresh mounts.
        if (head.kind === "forecast" && head.event.signal_name) return head.event.signal_name;
        return `Signal #${head.event.signal_def_id}`;
    }, [head, resolveSignalLabelOverride, signalDefs]);

    // ESC → dismiss the head item from whichever stream it came from.
    useEffect(() => {
        if (!head) return;
        const dismissHead =
            head.kind === "anomaly" ? stream.dismissLatest : forecastStream.dismissLatest;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            const target = e.target;
            if (target instanceof HTMLElement) {
                const tag = target.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
                if (target.isContentEditable) return;
            }
            dismissHead();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [head, stream, forecastStream]);

    const handleInvestigate = (prompt: string) => {
        // Make sure the chat drawer is visible before sending — AppShell
        // subscribes to ``useChatDrawerOpener`` and flips its drawer state to
        // open the next tick. Then send + focus.
        requestDrawerOpen();
        sendMessage(prompt);
        requestFocus();
    };

    const dismissHead =
        head?.kind === "forecast" ? forecastStream.dismissLatest : stream.dismissLatest;

    return (
        <div
            data-testid="anomaly-banner-slot"
            // Sticky under the TopBar so the banner stays visible even when a
            // long page (work-orders list, anomalies log) scrolls the inner
            // content. ``z-30`` keeps it above the page surface but below
            // the global drawer / inspector / constellation overlays.
            className="sticky top-0 z-30"
        >
            <AnimatePresence mode="wait" initial={false}>
                {head ? (
                    <BannerBody
                        key={head.event.id}
                        item={head}
                        count={totalCount}
                        signalLabel={signalLabel}
                        onDismiss={dismissHead}
                        onInvestigate={handleInvestigate}
                    />
                ) : null}
            </AnimatePresence>
        </div>
    );
}
