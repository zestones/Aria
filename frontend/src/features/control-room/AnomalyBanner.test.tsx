import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStore } from "../../app/chat/chatStore";
import { AnomalyBanner, buildInvestigatePrompt, formatRelativeTime } from "./AnomalyBanner";
import type { AnomalyEvent, UseAnomalyStreamResult } from "./useAnomalyStream";

function makeClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
        },
    });
}

function withClient(ui: ReactNode) {
    return <QueryClientProvider client={makeClient()}>{ui}</QueryClientProvider>;
}

function anomalyFixture(overrides: Partial<AnomalyEvent> = {}): AnomalyEvent {
    return {
        cell_id: 2,
        signal_def_id: 11,
        value: 4.8,
        threshold: 4.2,
        work_order_id: 101,
        time: "2026-04-24T12:00:00.000Z",
        severity: "alert",
        direction: "high",
        receivedAt: Date.now(),
        id: "2-11-2026-04-24T12:00:00.000Z",
        ...overrides,
    };
}

function streamResult(events: AnomalyEvent[]): UseAnomalyStreamResult {
    return {
        active: events,
        latest: events[0] ?? null,
        count: events.length,
        dismissAll: vi.fn(),
        dismissLatest: vi.fn(),
        connectionStatus: "open",
    };
}

beforeEach(() => {
    // Ensure chatStore is inert in tests — no real WS connection attempts.
    useChatStore.getState().reset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("formatRelativeTime", () => {
    it("collapses recent events to 'just now'", () => {
        expect(formatRelativeTime(1_000_000_000, 1_000_010_000)).toBe("just now");
    });

    it("formats minutes under an hour", () => {
        expect(formatRelativeTime(1_000_000_000, 1_000_000_000 + 120_000)).toBe("2m ago");
    });

    it("formats hours under a day", () => {
        expect(formatRelativeTime(0, 3 * 3600 * 1000)).toBe("3h ago");
    });
});

describe("buildInvestigatePrompt", () => {
    it("includes the full anomaly tuple for the agent", () => {
        const prompt = buildInvestigatePrompt({
            event: anomalyFixture(),
            signalLabel: "flow_rate",
            relativeTime: "just now",
        });
        expect(prompt).toContain("Investigate anomaly on Cell 2");
        expect(prompt).toContain("flow_rate high of threshold");
        expect(prompt).toContain("value 4.8");
        expect(prompt).toContain("limit 4.2");
        expect(prompt).toContain("just now");
    });
});

describe("AnomalyBanner", () => {
    it("renders nothing when there are no active anomalies", () => {
        render(
            withClient(
                <AnomalyBanner
                    streamOverride={streamResult([])}
                    resolveSignalLabelOverride={() => "flow_rate"}
                />,
            ),
        );
        expect(screen.queryByTestId("anomaly-banner")).toBeNull();
    });

    it("renders an alert-severity banner with a descriptive text", () => {
        render(
            withClient(
                <AnomalyBanner
                    streamOverride={streamResult([anomalyFixture({ severity: "alert" })])}
                    resolveSignalLabelOverride={() => "flow_rate"}
                />,
            ),
        );
        const banner = screen.getByTestId("anomaly-banner");
        expect(banner).toHaveAttribute("data-severity", "alert");
        expect(banner).toHaveAttribute("aria-live", "polite");
        expect(screen.getByTestId("anomaly-banner-text").textContent).toContain("Cell 2");
        expect(screen.getByTestId("anomaly-banner-text").textContent).toContain("flow_rate");
    });

    it("uses aria-live=assertive and critical tone for trip severity", () => {
        render(
            withClient(
                <AnomalyBanner
                    streamOverride={streamResult([anomalyFixture({ severity: "trip" })])}
                    resolveSignalLabelOverride={() => "flow_rate"}
                />,
            ),
        );
        const banner = screen.getByTestId("anomaly-banner");
        expect(banner).toHaveAttribute("data-severity", "trip");
        expect(banner).toHaveAttribute("aria-live", "assertive");
    });

    it("shows a '+N more' badge when multiple anomalies are active", () => {
        const events = [
            anomalyFixture({ id: "a", cell_id: 1 }),
            anomalyFixture({ id: "b", cell_id: 2 }),
            anomalyFixture({ id: "c", cell_id: 3 }),
        ];
        render(
            withClient(
                <AnomalyBanner
                    streamOverride={streamResult(events)}
                    resolveSignalLabelOverride={() => "flow_rate"}
                />,
            ),
        );
        expect(screen.getByTestId("anomaly-banner-count").textContent).toBe("+2 more");
    });

    it("hides the count badge when only a single anomaly is active", () => {
        render(
            withClient(
                <AnomalyBanner
                    streamOverride={streamResult([anomalyFixture()])}
                    resolveSignalLabelOverride={() => "flow_rate"}
                />,
            ),
        );
        expect(screen.queryByTestId("anomaly-banner-count")).toBeNull();
    });

    it("calls dismissLatest when the × button is clicked", async () => {
        const stream = streamResult([anomalyFixture()]);
        const user = userEvent.setup();
        render(
            withClient(
                <AnomalyBanner
                    streamOverride={stream}
                    resolveSignalLabelOverride={() => "flow_rate"}
                />,
            ),
        );
        await user.click(screen.getByTestId("anomaly-banner-dismiss"));
        expect(stream.dismissLatest).toHaveBeenCalledTimes(1);
    });

    it("calls dismissLatest on Escape (outside typing context)", () => {
        const stream = streamResult([anomalyFixture()]);
        render(
            withClient(
                <AnomalyBanner
                    streamOverride={stream}
                    resolveSignalLabelOverride={() => "flow_rate"}
                />,
            ),
        );
        act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        });
        expect(stream.dismissLatest).toHaveBeenCalledTimes(1);
    });

    it("Investigate CTA sends a prefilled chat message and requests focus", async () => {
        const stream = streamResult([anomalyFixture({ cell_id: 7, severity: "alert" })]);
        const user = userEvent.setup();

        const sendMessage = vi.fn();
        const requestFocus = vi.fn();
        const spy = vi.spyOn(useChatStore, "getState").mockReturnValue({
            ...useChatStore.getState(),
            sendMessage,
            requestFocus,
        });
        // useChatStore is used via selectors (subscribeWithSelector); patch
        // the selector outputs directly by overriding the hook calls used
        // inside the component with a setState-backed mock.
        useChatStore.setState({
            sendMessage,
            requestFocus,
        } as unknown as ReturnType<typeof useChatStore.getState>);

        try {
            render(
                withClient(
                    <AnomalyBanner
                        streamOverride={stream}
                        resolveSignalLabelOverride={() => "flow_rate"}
                    />,
                ),
            );
            await user.click(screen.getByTestId("anomaly-banner-investigate"));

            expect(sendMessage).toHaveBeenCalledTimes(1);
            const prompt = sendMessage.mock.calls[0][0] as string;
            expect(prompt).toContain("Investigate anomaly on Cell 7");
            expect(prompt).toContain("flow_rate high of threshold");
            expect(requestFocus).toHaveBeenCalledTimes(1);
        } finally {
            spy.mockRestore();
        }
    });

    it("falls back to 'Signal #<id>' when the label resolver returns null", () => {
        render(
            withClient(
                <AnomalyBanner
                    streamOverride={streamResult([anomalyFixture({ signal_def_id: 42 })])}
                    // No override — default resolution through the query runs,
                    // but the query is disabled here (no fetch mock) so the
                    // resolver effectively returns null. Component must fall
                    // back to "Signal #42".
                />,
            ),
        );
        expect(screen.getByTestId("anomaly-banner-text").textContent).toContain("Signal #42");
    });
});
