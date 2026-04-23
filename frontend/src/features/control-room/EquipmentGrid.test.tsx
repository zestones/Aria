import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EquipmentGrid } from "./EquipmentGrid";
import type { EquipmentEntry } from "./useEquipmentList";

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
});
