import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EquipmentSelection } from "../../lib/hierarchy";
import { formatCount, formatDuration, formatOee, KpiBar } from "./KpiBar";

const selection: EquipmentSelection = {
    cellId: 42,
    cellName: "Cell-02",
    lineId: 7,
    lineName: "Line-01",
    areaName: "Treatment",
    siteName: "Field",
};

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

/** Minimal shape returned by `apiFetch<T>` — we unwrap the envelope server-side. */
interface EnvelopeResponse {
    data: unknown;
}

function jsonResponse(data: unknown): Response {
    const body: EnvelopeResponse = { data };
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

describe("KpiBar — formatters", () => {
    it("formats OEE as a 1-decimal percent", () => {
        expect(formatOee(74.33)).toBe("74.3%");
        expect(formatOee(100)).toBe("100.0%");
        expect(formatOee(null)).toBe("—");
    });

    it("formats MTBF duration in hours or days", () => {
        expect(formatDuration(142 * 3600, "hours")).toBe("142h");
        expect(formatDuration(9 * 24 * 3600 + 4 * 3600, "hours")).toBe("9d 4h");
        expect(formatDuration(null, "hours")).toBe("—");
    });

    it("formats MTTR duration in minutes or hours+minutes", () => {
        expect(formatDuration(23 * 60, "minutes")).toBe("23min");
        expect(formatDuration(72 * 60, "minutes")).toBe("1h 12min");
        expect(formatDuration(0, "minutes")).toBe("0min");
    });

    it("formats anomaly count as an integer string", () => {
        expect(formatCount(0)).toBe("0");
        expect(formatCount(12)).toBe("12");
        expect(formatCount(null)).toBe("—");
    });
});

describe("KpiBar — rendering", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
        fetchSpy.mockRestore();
    });

    it("shows em-dash placeholders when no equipment is selected", () => {
        render(withClient(<KpiBar selection={null} />));

        const tiles = screen.getAllByRole("generic", { hidden: true });
        // The four dashes should exist across the tiles. We assert on their
        // rendered value text instead.
        const oee = screen.getByText("OEE").parentElement?.parentElement;
        expect(oee).toBeDefined();
        expect(oee).toHaveAttribute("data-kpi-state", "loading");
        expect(oee?.textContent).toContain("—");
        // No fetch calls when disabled.
        expect(fetchSpy).not.toHaveBeenCalled();
        // Tiles are rendered
        expect(tiles.length).toBeGreaterThan(0);
    });

    it("renders formatted values after the four queries resolve", async () => {
        fetchSpy.mockImplementation(async (input: Request | string | URL) => {
            const url = typeof input === "string" ? input : input.toString();
            if (url.includes("/kpi/oee/trend")) {
                return jsonResponse([
                    { bucket: "2026-04-22T00:00:00Z", cell_id: 42, oee: 0.7 },
                    { bucket: "2026-04-22T01:00:00Z", cell_id: 42, oee: 0.74 },
                    { bucket: "2026-04-22T02:00:00Z", cell_id: 42, oee: 0.78 },
                ]);
            }
            if (url.includes("/kpi/oee")) {
                return jsonResponse({
                    availability: 0.9,
                    performance: 0.9,
                    quality: 0.92,
                    oee: 0.743,
                });
            }
            if (url.includes("/kpi/maintenance")) {
                return jsonResponse({
                    mtbf_seconds: 142 * 3600,
                    mttr_seconds: 23 * 60,
                });
            }
            if (url.includes("/monitoring/events/machine-status")) {
                return jsonResponse([
                    { time: "2026-04-22T01:00:00Z", status_category: "unplanned_stop" },
                    { time: "2026-04-22T03:00:00Z", status_category: "unplanned_stop" },
                    { time: "2026-04-22T05:00:00Z", status_category: "unplanned_stop" },
                    { time: "2026-04-22T07:00:00Z", status_category: "running" },
                ]);
            }
            return jsonResponse(null);
        });

        const client = makeClient();
        render(withClient(<KpiBar selection={selection} />, client));

        await waitFor(() => expect(screen.getByText("74.3%")).toBeInTheDocument());
        expect(screen.getByText("142h")).toBeInTheDocument();
        expect(screen.getByText("23min")).toBeInTheDocument();
        expect(screen.getByText("3")).toBeInTheDocument();

        // OEE tile reached ready state.
        const oeeTile = screen.getByText("OEE").parentElement?.parentElement;
        expect(oeeTile).toHaveAttribute("data-kpi-state", "ready");
    });

    it("marks a tile as error when its query fails", async () => {
        fetchSpy.mockImplementation(async (input: Request | string | URL) => {
            const url = typeof input === "string" ? input : input.toString();
            if (url.includes("/kpi/maintenance")) {
                return new Response(JSON.stringify({ message: "boom" }), { status: 500 });
            }
            if (url.includes("/kpi/oee/trend")) {
                return jsonResponse([
                    { bucket: "2026-04-22T00:00:00Z", cell_id: 42, oee: 0.7 },
                    { bucket: "2026-04-22T01:00:00Z", cell_id: 42, oee: 0.74 },
                ]);
            }
            if (url.includes("/kpi/oee")) {
                return jsonResponse({
                    availability: 0.9,
                    performance: 0.9,
                    quality: 0.92,
                    oee: 0.8,
                });
            }
            if (url.includes("/monitoring/events/machine-status")) {
                return jsonResponse([]);
            }
            return jsonResponse(null);
        });

        const client = makeClient();
        render(withClient(<KpiBar selection={selection} />, client));

        const mtbfTile = () => screen.getByText("MTBF").parentElement?.parentElement;

        await waitFor(() => expect(mtbfTile()).toHaveAttribute("data-kpi-state", "error"));
        expect(mtbfTile()?.textContent).toContain("—");
    });
});
