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
import { useChatStore } from "../../app/chat/chatStore";
import { Button } from "../../design-system/Button";
import { AlertCircle, AlertTriangle, X } from "../../design-system/icons";
import { fadeInUp } from "../../design-system/motion";
import type { AnomalyEvent } from "./useAnomalyStream";
import { useAnomalyStream } from "./useAnomalyStream";
import { useSignalDefinitions } from "./useSignalDefinitions";

type Severity = AnomalyEvent["severity"];

function severityTone(severity: Severity): {
    accentVar: string;
    fgVar: string;
    Icon: typeof AlertTriangle;
} {
    if (severity === "trip") {
        return {
            accentVar: "var(--ds-status-critical)",
            fgVar: "var(--ds-status-critical)",
            Icon: AlertCircle,
        };
    }
    return {
        accentVar: "var(--ds-status-warning)",
        fgVar: "var(--ds-status-warning)",
        Icon: AlertTriangle,
    };
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

interface BannerBodyProps {
    event: AnomalyEvent;
    count: number;
    signalLabel: string;
    onDismiss: () => void;
    onInvestigate: (prompt: string) => void;
}

function BannerBody({ event, count, signalLabel, onDismiss, onInvestigate }: BannerBodyProps) {
    const { accentVar, fgVar, Icon } = severityTone(event.severity);
    const relativeTime = formatRelativeTime(event.receivedAt);

    const description = `Cell ${event.cell_id} · ${signalLabel} ${event.direction} of threshold (${event.value} vs ${event.threshold})`;

    // `color-mix` tint — very subtle surface, tokens only.
    const background = `color-mix(in oklab, ${accentVar} 12%, var(--ds-bg-surface))`;

    return (
        <motion.div
            key={event.id}
            role="alert"
            aria-live={event.severity === "trip" ? "assertive" : "polite"}
            data-severity={event.severity}
            data-testid="anomaly-banner"
            variants={fadeInUp}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className="relative flex items-center gap-3 border-b border-[var(--ds-border)] px-4"
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

            <span
                className="text-[var(--ds-text-sm)] font-medium text-[var(--ds-fg-primary)] truncate"
                data-testid="anomaly-banner-text"
            >
                {description}
            </span>

            <span className="text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)] whitespace-nowrap">
                {relativeTime}
            </span>

            {count > 1 && (
                <span
                    data-testid="anomaly-banner-count"
                    className="ml-auto rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] px-2 py-0.5 text-[var(--ds-text-xs)] font-medium text-[var(--ds-fg-muted)]"
                >
                    +{count - 1} more
                </span>
            )}

            <div className={`${count > 1 ? "" : "ml-auto"} flex items-center gap-1`}>
                <Button
                    size="sm"
                    variant="accent"
                    onClick={() =>
                        onInvestigate(
                            buildInvestigatePrompt({
                                event,
                                signalLabel,
                                relativeTime,
                            }),
                        )
                    }
                    data-testid="anomaly-banner-investigate"
                >
                    Investigate
                </Button>
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={onDismiss}
                    aria-label="Dismiss anomaly"
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
     * Test seam — override the stream to feed a fixed anomaly list without
     * mocking the WS runtime. Production mount passes nothing.
     */
    streamOverride?: ReturnType<typeof useAnomalyStream>;
    /**
     * Test seam — override the signal-label lookup. Production mount passes
     * nothing; the hook fetches from `/signals/definitions`.
     */
    resolveSignalLabelOverride?: (signalDefId: number) => string;
}

/**
 * Sticky under-TopBar anomaly banner. Renders nothing (zero DOM) when the
 * stream has no active events, so it does not reserve vertical space.
 *
 * Consumes:
 *  - `useAnomalyStream()` for the event list + dismiss handlers
 *  - `useChatStore()` for the Investigate CTA (`sendMessage` + `requestFocus`)
 *  - `useSignalDefinitions(cellId)` so the text shows `flow_rate` rather than
 *    `Signal #11`; falls back cleanly if the fetch fails.
 */
export function AnomalyBanner({
    streamOverride,
    resolveSignalLabelOverride,
}: AnomalyBannerProps = {}) {
    const streamFromHook = useAnomalyStream();
    const stream = streamOverride ?? streamFromHook;

    const sendMessage = useChatStore((s) => s.sendMessage);
    const requestFocus = useChatStore((s) => s.requestFocus);

    const latest = stream.latest;
    const cellId = latest?.cell_id;
    const signalDefs = useSignalDefinitions(cellId ?? null);
    const signalLabel = useMemo(() => {
        if (!latest) return "";
        if (resolveSignalLabelOverride) return resolveSignalLabelOverride(latest.signal_def_id);
        return signalDefs.resolve(latest.signal_def_id) ?? `Signal #${latest.signal_def_id}`;
    }, [latest, resolveSignalLabelOverride, signalDefs]);

    // ESC → dismiss the head anomaly. Only wire while the banner is rendered.
    useEffect(() => {
        if (!latest) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            // Don't hijack ESC when the user is typing — mirrors AppShell's
            // isTypingTarget guard. Keeping it local to avoid a shared util
            // for M7.3 scope.
            const target = e.target;
            if (target instanceof HTMLElement) {
                const tag = target.tagName;
                if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
                if (target.isContentEditable) return;
            }
            stream.dismissLatest();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [latest, stream]);

    const handleInvestigate = (prompt: string) => {
        // Fire-and-forget — the chat drawer is assumed open (AppShell default).
        // Drawer auto-open on closed is M7.4+ polish; dropping it here keeps
        // the M7.3 scope tight. See PR body.
        sendMessage(prompt);
        requestFocus();
    };

    return (
        <div data-testid="anomaly-banner-slot">
            <AnimatePresence mode="wait" initial={false}>
                {latest ? (
                    <BannerBody
                        key={latest.id}
                        event={latest}
                        count={stream.count}
                        signalLabel={signalLabel}
                        onDismiss={stream.dismissLatest}
                        onInvestigate={handleInvestigate}
                    />
                ) : null}
            </AnimatePresence>
        </div>
    );
}
