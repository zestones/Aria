import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Recharts ResponsiveContainer measures its parent with ResizeObserver; in JSDom
// this returns 0×0 and the inner chart never renders its SVG children. Replace
// with a pass-through that injects explicit width/height into the inner chart
// (Recharts honors direct `width`/`height` props as an explicit mode).
vi.mock("recharts", async () => {
    const actual = await vi.importActual<typeof import("recharts")>("recharts");
    const { cloneElement, isValidElement } = await import("react");
    return {
        ...actual,
        ResponsiveContainer: ({ children }: { children: ReactNode }) => {
            if (isValidElement(children)) {
                return cloneElement(
                    children as React.ReactElement<{ width?: number; height?: number }>,
                    { width: 400, height: 200 },
                );
            }
            return <>{children}</>;
        },
    };
});

import { SignalChart } from "./SignalChart";

// ---------- Helpers ----------

function makeClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
        },
    });
}

function withClient(ui: ReactNode, client = makeClient()) {
    return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify({ status, message: "OK", data }), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

const DEF_FIXTURE = {
    id: 42,
    cell_id: 3,
    display_name: "Bearing vibration",
    unit_name: "mm/s",
    signal_type_name: "vibration",
};

function makeSeries(n: number, baseIso = "2026-04-24T10:00:00Z") {
    const start = new Date(baseIso).getTime();
    return Array.from({ length: n }, (_, i) => ({
        time: new Date(start + i * 60_000).toISOString(),
        raw_value: 3 + Math.sin(i / 5),
    }));
}

// ResponsiveContainer needs a measurable parent in JSDom — wrap every render.
function Sized({ children }: { children: ReactNode }) {
    return <div style={{ width: 400, height: 200 }}>{children}</div>;
}

describe("SignalChart", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
        fetchSpy.mockRestore();
        vi.restoreAllMocks();
    });

    it("renders the header with display name and chart container on happy path", async () => {
        fetchSpy.mockImplementation(async (input: Request | string | URL) => {
            const url = typeof input === "string" ? input : input.toString();
            if (url.includes("/signals/definitions/42")) return jsonResponse(DEF_FIXTURE);
            if (url.includes("/signals/data/42")) return jsonResponse(makeSeries(30));
            return jsonResponse(null);
        });

        render(
            withClient(
                <Sized>
                    <SignalChart cell_id={3} signal_def_id={42} window_hours={6} />
                </Sized>,
            ),
        );

        await waitFor(() => expect(screen.getByText("Bearing vibration")).toBeInTheDocument());
        expect(screen.getByText(/Last 6h · Cell 3/)).toBeInTheDocument();
        expect(screen.getByTestId("signal-chart-container")).toBeInTheDocument();
    });

    it("shows the loading state while requests are pending", () => {
        // Keep fetches unresolved so isLoading stays true.
        fetchSpy.mockImplementation(() => new Promise(() => {}));

        render(
            withClient(
                <Sized>
                    <SignalChart cell_id={3} signal_def_id={42} window_hours={24} />
                </Sized>,
            ),
        );

        expect(screen.getByText(/Loading signal/i)).toBeInTheDocument();
    });

    it("renders the error fallback when the data query fails", async () => {
        fetchSpy.mockImplementation(async (input: Request | string | URL) => {
            const url = typeof input === "string" ? input : input.toString();
            if (url.includes("/signals/definitions/42")) return jsonResponse(DEF_FIXTURE);
            if (url.includes("/signals/data/42")) {
                return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
            }
            return jsonResponse(null);
        });

        render(
            withClient(
                <Sized>
                    <SignalChart cell_id={3} signal_def_id={42} window_hours={24} />
                </Sized>,
            ),
        );

        await waitFor(() =>
            expect(screen.getByText(/No data for signal #42 in the last 24h/)).toBeInTheDocument(),
        );
    });

    it("renders the empty fallback when series is empty", async () => {
        fetchSpy.mockImplementation(async (input: Request | string | URL) => {
            const url = typeof input === "string" ? input : input.toString();
            if (url.includes("/signals/definitions/42")) return jsonResponse(DEF_FIXTURE);
            if (url.includes("/signals/data/42")) return jsonResponse([]);
            return jsonResponse(null);
        });

        render(
            withClient(
                <Sized>
                    <SignalChart cell_id={3} signal_def_id={42} window_hours={12} />
                </Sized>,
            ),
        );

        await waitFor(() =>
            expect(screen.getByText(/No data for signal #42 in the last 12h/)).toBeInTheDocument(),
        );
    });

    it("renders a reference line when threshold is provided", async () => {
        fetchSpy.mockImplementation(async (input: Request | string | URL) => {
            const url = typeof input === "string" ? input : input.toString();
            if (url.includes("/signals/definitions/42")) return jsonResponse(DEF_FIXTURE);
            if (url.includes("/signals/data/42")) return jsonResponse(makeSeries(30));
            return jsonResponse(null);
        });

        const { container } = render(
            withClient(
                <Sized>
                    <SignalChart cell_id={3} signal_def_id={42} window_hours={6} threshold={7.1} />
                </Sized>,
            ),
        );

        await waitFor(() => expect(screen.getByText("Bearing vibration")).toBeInTheDocument());
        // Recharts renders ReferenceLine as an SVG group with class recharts-reference-line.
        await waitFor(() => {
            expect(container.querySelector(".recharts-reference-line")).not.toBeNull();
        });
    });

    it("renders an anomaly marker when mark_anomaly_at matches a point", async () => {
        const series = makeSeries(30);
        const anomalyIso = series[10]!.time;

        fetchSpy.mockImplementation(async (input: Request | string | URL) => {
            const url = typeof input === "string" ? input : input.toString();
            if (url.includes("/signals/definitions/42")) return jsonResponse(DEF_FIXTURE);
            if (url.includes("/signals/data/42")) return jsonResponse(series);
            return jsonResponse(null);
        });

        const { container } = render(
            withClient(
                <Sized>
                    <SignalChart
                        cell_id={3}
                        signal_def_id={42}
                        window_hours={6}
                        mark_anomaly_at={anomalyIso}
                    />
                </Sized>,
            ),
        );

        await waitFor(() => expect(screen.getByText("Bearing vibration")).toBeInTheDocument());
        await waitFor(() => {
            expect(container.querySelector(".recharts-reference-dot")).not.toBeNull();
        });
    });
});
