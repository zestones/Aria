import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EquipmentKbCard } from "@/components/artifacts/EquipmentKbCard";

// ---------- Helpers ----------

function makeClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false, refetchOnWindowFocus: false, staleTime: Infinity },
            mutations: { retry: false },
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

function errorResponse(status = 500): Response {
    return new Response(JSON.stringify({ message: "boom" }), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

const KB_FIXTURE = {
    id: 1,
    cell_id: 1,
    cell_name: "Bottle Filler",
    equipment_type: "Centrifugal Pump",
    manufacturer: "Grundfos",
    model: "CR 32-2",
    installation_date: "2024-10-23",
    structured_data: {
        equipment: {
            equipment_type: "Centrifugal Pump",
            manufacturer: "Grundfos",
            model: "CR 32-2",
            motor_power_kw: 7.5,
            rpm_nominal: 2900,
            service_description: "Boiler feed water",
        },
        thresholds: {
            vibration_mm_s: {
                nominal: 2.2,
                alert: 4.5,
                trip: 7.1,
                unit: "mm/s",
                source: "ISO 10816",
                confidence: 0.9,
            },
            bearing_temp_c: {
                nominal: 48,
                alert: 75,
                trip: 90,
                unit: "°C",
                source: "ISO 10816",
                confidence: 0.8,
            },
            flow_l_min: {
                nominal: 533,
                low_alert: 480,
                high_alert: 580,
                unit: "L/min",
                source: "Spec",
                confidence: 0.75,
            },
            pressure_bar: {
                nominal: 5.5,
                low_alert: 4.5,
                high_alert: 6.5,
                unit: "bar",
                source: "Spec",
                confidence: 0.8,
            },
        },
    },
    confidence_score: 0.85,
    onboarding_complete: true,
    last_updated_by: "operator",
    last_updated_at: "2026-04-24T10:00:00Z",
    created_at: "2024-10-23T10:00:00Z",
};

describe("EquipmentKbCard", () => {
    let fetchSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        fetchSpy = vi.spyOn(globalThis, "fetch");
    });

    afterEach(() => {
        fetchSpy.mockRestore();
        vi.restoreAllMocks();
    });

    it("renders header, thresholds sections and footer on happy path", async () => {
        fetchSpy.mockImplementation(async (input: Request | string | URL) => {
            const url = typeof input === "string" ? input : input.toString();
            if (url.includes("/kb/equipment/1")) return jsonResponse(KB_FIXTURE);
            return jsonResponse(null);
        });

        render(withClient(<EquipmentKbCard cell_id={1} />));

        // Header
        await waitFor(() => expect(screen.getByText("Bottle Filler")).toBeInTheDocument());
        expect(screen.getByText(/· Centrifugal Pump/)).toBeInTheDocument();
        expect(screen.getByText(/Grundfos · CR 32-2 · Installed 2024-10-23/)).toBeInTheDocument();

        // Thresholds section (4 calibrated)
        expect(screen.getByText("Thresholds (4)")).toBeInTheDocument();
        expect(screen.getByText("Vibration (mm/s)")).toBeInTheDocument();
        expect(screen.getByText("Bearing temp (°C)")).toBeInTheDocument();
        expect(screen.getByText("Flow (L/min)")).toBeInTheDocument();
        expect(screen.getByText("Pressure (bar)")).toBeInTheDocument();

        // Some threshold values
        expect(
            screen.getByTestId("threshold-value-thresholds.vibration_mm_s.alert"),
        ).toHaveTextContent("4.5");
        expect(
            screen.getByTestId("threshold-value-thresholds.vibration_mm_s.trip"),
        ).toHaveTextContent("7.1");

        // Footer
        expect(screen.getByText(/Confidence 85%/)).toBeInTheDocument();
        expect(screen.getByText(/operator/)).toBeInTheDocument();
    });

    it("shows loading state while KB query is pending", () => {
        fetchSpy.mockImplementation(() => new Promise(() => {}));

        render(withClient(<EquipmentKbCard cell_id={1} />));

        expect(screen.getByText(/Loading equipment KB/i)).toBeInTheDocument();
    });

    it("renders the error fallback when the KB query fails", async () => {
        fetchSpy.mockImplementation(async () => errorResponse(500));

        render(withClient(<EquipmentKbCard cell_id={7} />));

        await waitFor(() => expect(screen.getByText(/No KB data for cell 7/)).toBeInTheDocument());
    });

    it("switches a threshold value to an input when clicked (autofocus + prefilled)", async () => {
        fetchSpy.mockImplementation(async (input: Request | string | URL) => {
            const url = typeof input === "string" ? input : input.toString();
            if (url.includes("/kb/equipment/1")) return jsonResponse(KB_FIXTURE);
            return jsonResponse(null);
        });

        const user = userEvent.setup();
        render(withClient(<EquipmentKbCard cell_id={1} />));

        const button = await screen.findByTestId("threshold-value-thresholds.vibration_mm_s.alert");
        await user.click(button);

        const input = screen.getByLabelText("Vibration (mm/s) alert") as HTMLInputElement;
        expect(input).toBeInTheDocument();
        expect(input.value).toBe("4.5");
        expect(document.activeElement).toBe(input);
    });

    it("cancels edit on Escape without firing a mutation", async () => {
        fetchSpy.mockImplementation(async (input: Request | string | URL) => {
            const url = typeof input === "string" ? input : input.toString();
            if (url.includes("/kb/equipment/1")) return jsonResponse(KB_FIXTURE);
            return jsonResponse(null);
        });

        const user = userEvent.setup();
        render(withClient(<EquipmentKbCard cell_id={1} />));

        const button = await screen.findByTestId("threshold-value-thresholds.vibration_mm_s.alert");
        await user.click(button);

        const input = screen.getByLabelText("Vibration (mm/s) alert") as HTMLInputElement;
        await user.clear(input);
        await user.type(input, "9.9");
        await user.keyboard("{Escape}");

        // Button is back with the original value, no PUT fired
        await waitFor(() =>
            expect(
                screen.getByTestId("threshold-value-thresholds.vibration_mm_s.alert"),
            ).toHaveTextContent("4.5"),
        );

        const putCalls = fetchSpy.mock.calls.filter((c: unknown[]) => {
            const init = c[1] as RequestInit | undefined;
            return init?.method === "PUT";
        });
        expect(putCalls).toHaveLength(0);
    });

    it("commits edit on Enter → optimistic update + PUT body contains the new threshold", async () => {
        // Server reflects the last PUT on subsequent GETs (so invalidation doesn't
        // stomp the optimistic value).
        let serverKb: typeof KB_FIXTURE = KB_FIXTURE;
        fetchSpy.mockImplementation(async (input: Request | string | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input.toString();
            if (init?.method === "PUT" && url.includes("/kb/equipment")) {
                const sent = JSON.parse(init.body as string) as {
                    structured_data: typeof KB_FIXTURE.structured_data;
                    last_updated_by: string;
                };
                serverKb = {
                    ...serverKb,
                    structured_data: sent.structured_data,
                    last_updated_by: sent.last_updated_by,
                };
                return jsonResponse(serverKb);
            }
            if (url.includes("/kb/equipment/1")) return jsonResponse(serverKb);
            return jsonResponse(null);
        });

        const user = userEvent.setup();
        render(withClient(<EquipmentKbCard cell_id={1} />));

        const button = await screen.findByTestId("threshold-value-thresholds.vibration_mm_s.alert");
        await user.click(button);

        const input = screen.getByLabelText("Vibration (mm/s) alert") as HTMLInputElement;
        await user.clear(input);
        await user.type(input, "5.2");
        await user.keyboard("{Enter}");

        // Optimistic: input disappears, value reflects the edit
        await waitFor(() =>
            expect(
                screen.getByTestId("threshold-value-thresholds.vibration_mm_s.alert"),
            ).toHaveTextContent("5.2"),
        );

        // A PUT was fired with the expected body shape
        const putCall = fetchSpy.mock.calls.find((c: unknown[]) => {
            const init = c[1] as RequestInit | undefined;
            return init?.method === "PUT";
        });
        expect(putCall).toBeDefined();
        const body = JSON.parse((putCall?.[1] as RequestInit).body as string) as {
            cell_id: number;
            last_updated_by: string;
            structured_data: {
                thresholds: { vibration_mm_s: { alert: number; trip: number } };
            };
        };
        expect(body.cell_id).toBe(1);
        expect(body.last_updated_by).toBe("operator");
        expect(body.structured_data.thresholds.vibration_mm_s.alert).toBe(5.2);
        // Other fields preserved
        expect(body.structured_data.thresholds.vibration_mm_s.trip).toBe(7.1);
    });

    it("rollbacks to original value when the PUT mutation fails", async () => {
        fetchSpy.mockImplementation(async (input: Request | string | URL, init?: RequestInit) => {
            const url = typeof input === "string" ? input : input.toString();
            if (init?.method === "PUT" && url.includes("/kb/equipment")) {
                return errorResponse(500);
            }
            if (url.includes("/kb/equipment/1")) return jsonResponse(KB_FIXTURE);
            return jsonResponse(null);
        });

        const user = userEvent.setup();
        render(withClient(<EquipmentKbCard cell_id={1} />));

        const button = await screen.findByTestId("threshold-value-thresholds.vibration_mm_s.alert");
        await user.click(button);

        const input = screen.getByLabelText("Vibration (mm/s) alert") as HTMLInputElement;
        await user.clear(input);
        await user.type(input, "5.2");
        await user.keyboard("{Enter}");

        // Wait for the mutation to fail and rollback
        await waitFor(() =>
            expect(
                screen.getByTestId("threshold-value-thresholds.vibration_mm_s.alert"),
            ).toHaveTextContent("4.5"),
        );
    });

    it('marks highlighted threshold fields with data-highlight="true"', async () => {
        fetchSpy.mockImplementation(async (input: Request | string | URL) => {
            const url = typeof input === "string" ? input : input.toString();
            if (url.includes("/kb/equipment/1")) return jsonResponse(KB_FIXTURE);
            return jsonResponse(null);
        });

        render(
            withClient(
                <EquipmentKbCard
                    cell_id={1}
                    highlight_fields={["thresholds.vibration_mm_s.alert"]}
                />,
            ),
        );

        const highlighted = await screen.findByTestId(
            "threshold-value-thresholds.vibration_mm_s.alert",
        );
        expect(highlighted).toHaveAttribute("data-highlight", "true");

        // Non-highlighted sibling has no highlight attr
        const nonHighlighted = screen.getByTestId("threshold-value-thresholds.vibration_mm_s.trip");
        expect(nonHighlighted).not.toHaveAttribute("data-highlight");
    });

    it("renders a fallback message when thresholds are empty", async () => {
        fetchSpy.mockImplementation(async (input: Request | string | URL) => {
            const url = typeof input === "string" ? input : input.toString();
            if (url.includes("/kb/equipment/1"))
                return jsonResponse({
                    ...KB_FIXTURE,
                    structured_data: {
                        equipment: KB_FIXTURE.structured_data.equipment,
                        thresholds: {},
                    },
                });
            return jsonResponse(null);
        });

        render(withClient(<EquipmentKbCard cell_id={1} />));

        await waitFor(() => expect(screen.getByText("Thresholds (0)")).toBeInTheDocument());
        expect(screen.getByText(/No thresholds calibrated yet/)).toBeInTheDocument();
    });
});
