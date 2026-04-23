import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PidDiagram } from "./PidDiagram";

describe("PidDiagram", () => {
    it("renders the five scene-P-02 nodes", () => {
        render(<PidDiagram selectedNodeId={null} onSelectNode={() => {}} />);
        for (const id of ["tank", "p-01", "valve", "p-02", "outlet"]) {
            expect(screen.getByTestId(`equipment-node-${id}`)).toBeInTheDocument();
        }
    });

    it("renders the four flow edges connecting the ladder", () => {
        render(<PidDiagram selectedNodeId={null} onSelectNode={() => {}} />);
        for (const id of ["tank-p01", "p01-valve", "valve-p02", "p02-outlet"]) {
            expect(screen.getByTestId(`flow-edge-${id}`)).toBeInTheDocument();
        }
    });

    it("invokes onSelectNode with the node id when clicked", async () => {
        const onSelectNode = vi.fn();
        const user = userEvent.setup();
        render(<PidDiagram selectedNodeId={null} onSelectNode={onSelectNode} />);
        await user.click(screen.getByTestId("equipment-node-p-02"));
        expect(onSelectNode).toHaveBeenCalledWith("p-02");
    });

    it("marks the currently selected node with data-selected=true", () => {
        render(<PidDiagram selectedNodeId="p-02" onSelectNode={() => {}} />);
        expect(screen.getByTestId("equipment-node-p-02")).toHaveAttribute("data-selected", "true");
        expect(screen.getByTestId("equipment-node-tank")).toHaveAttribute("data-selected", "false");
    });
});
