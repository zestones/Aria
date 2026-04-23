import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EquipmentGrid } from "./EquipmentGrid";
import type { AnomalyEvent } from "./useAnomalyStream";
import type { EquipmentEntry } from "./useEquipmentList";

const useAnomalyStreamMock = vi.hoisted(() => vi.fn());

vi.mock("./useAnomalyStream", () => ({
    useAnomalyStream: useAnomalyStreamMock,
}));

function anomaly(partial: Partial<AnomalyEvent> & { cell_id: number }): AnomalyEvent {
    return {
        cell_id: partial.cell_id,
        signal_def_id: partial.signal_def_id ?? 11,
        value: partial.value ?? 5,
        threshold: partial.threshold ?? 4,
        work_order_id: partial.work_order_id ?? 101,
        time: partial.time ?? "2026-04-24T12:00:00.000Z",
        severity: partial.severity ?? "alert",
        direction: partial.direction ?? "high",
        id:
            partial.id ??
            `${partial.cell_id}-${partial.signal_def_id ?? 11}-${partial.time ?? "t"}`,
        receivedAt: partial.receivedAt ?? 0,
    };
}

function mockStream(active: AnomalyEvent[]): void {
    useAnomalyStreamMock.mockReturnValue({
        active,
        latest: active[0] ?? null,
        count: active.length,
        dismissAll: vi.fn(),
        dismissLatest: vi.fn(),
        connectionStatus: "open" as const,
    });
}

beforeEach(() => {
    useAnomalyStreamMock.mockReset();
    mockStream([]);
});

const mockEntries: readonly EquipmentEntry[] = [
    {
        id: "cell:1",
        label: "Cell-01",
        sublabel: "Line-01",
        cellId: 1,
        lineId: 10,
        status: "nominal",
    },
    {
        id: "cell:2",
        label: "Cell-02",
        sublabel: "Line-01",
        cellId: 2,
        lineId: 10,
        status: "nominal",
    },
    {
        id: "cell:3",
        label: "Cell-03",
        sublabel: "Line-02",
        cellId: 3,
        lineId: 11,
        status: "nominal",
    },
];

describe("EquipmentGrid", () => {
    it("renders one node per entry passed in", () => {
        render(
            <EquipmentGrid entries={mockEntries} selectedNodeId={null} onSelectNode={() => {}} />,
        );
        expect(screen.getByTestId("equipment-grid")).toHaveAttribute("data-state", "ready");
        expect(screen.getByTestId("equipment-node-cell:1")).toBeInTheDocument();
        expect(screen.getByTestId("equipment-node-cell:2")).toBeInTheDocument();
        expect(screen.getByTestId("equipment-node-cell:3")).toBeInTheDocument();
    });

    it("invokes onSelectNode with the entry id when a card is clicked", async () => {
        const onSelectNode = vi.fn();
        const user = userEvent.setup();
        render(
            <EquipmentGrid
                entries={mockEntries}
                selectedNodeId={null}
                onSelectNode={onSelectNode}
            />,
        );
        await user.click(screen.getByTestId("equipment-node-cell:2"));
        expect(onSelectNode).toHaveBeenCalledWith("cell:2");
    });

    it("marks the currently selected node with data-selected=true", () => {
        render(
            <EquipmentGrid entries={mockEntries} selectedNodeId="cell:2" onSelectNode={() => {}} />,
        );
        expect(screen.getByTestId("equipment-node-cell:2")).toHaveAttribute(
            "data-selected",
            "true",
        );
        expect(screen.getByTestId("equipment-node-cell:1")).toHaveAttribute(
            "data-selected",
            "false",
        );
    });

    it("renders the loading placeholder when isLoading is true", () => {
        render(
            <EquipmentGrid entries={[]} selectedNodeId={null} onSelectNode={() => {}} isLoading />,
        );
        expect(screen.getByTestId("equipment-grid")).toHaveAttribute("data-state", "loading");
    });

    it("renders the empty state when entries is empty and not loading", () => {
        render(<EquipmentGrid entries={[]} selectedNodeId={null} onSelectNode={() => {}} />);
        expect(screen.getByTestId("equipment-grid")).toHaveAttribute("data-state", "empty");
        expect(screen.getByText("No equipment in scope.")).toBeInTheDocument();
    });

    it("overrides a backend-nominal status with a live trip anomaly for that cell", () => {
        mockStream([anomaly({ cell_id: 1, severity: "trip" })]);
        render(
            <EquipmentGrid entries={mockEntries} selectedNodeId={null} onSelectNode={() => {}} />,
        );
        expect(screen.getByTestId("equipment-node-cell:1")).toHaveAttribute(
            "data-status",
            "critical",
        );
        // Unaffected cells keep their backend-provided baseline.
        expect(screen.getByTestId("equipment-node-cell:2")).toHaveAttribute(
            "data-status",
            "nominal",
        );
        expect(screen.getByTestId("equipment-node-cell:3")).toHaveAttribute(
            "data-status",
            "nominal",
        );
    });

    it("maps a live alert anomaly to the 'warning' status on the matching card", () => {
        mockStream([anomaly({ cell_id: 2, severity: "alert" })]);
        render(
            <EquipmentGrid entries={mockEntries} selectedNodeId={null} onSelectNode={() => {}} />,
        );
        expect(screen.getByTestId("equipment-node-cell:2")).toHaveAttribute(
            "data-status",
            "warning",
        );
    });
});
