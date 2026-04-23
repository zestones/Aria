import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EquipmentNode } from "./EquipmentNode";

function renderInSvg(children: React.ReactNode) {
    return render(
        <svg viewBox="0 0 200 200" data-testid="host-svg">
            <title>test host</title>
            {children}
        </svg>,
    );
}

describe("EquipmentNode", () => {
    it("renders the label text", () => {
        renderInSvg(
            <EquipmentNode id="p-02" kind="pump" label="P-02" x={100} y={100} status="nominal" />,
        );
        expect(screen.getByText("P-02")).toBeInTheDocument();
    });

    it("exposes the status via data-status for styling hooks", () => {
        renderInSvg(
            <EquipmentNode id="tank" kind="tank" label="Tank" x={50} y={50} status="critical" />,
        );
        const node = screen.getByTestId("equipment-node-tank");
        expect(node).toHaveAttribute("data-status", "critical");
        expect(node).toHaveAttribute("data-kind", "tank");
    });

    it("fires onClick when clicked and is keyboard-activatable", async () => {
        const onClick = vi.fn();
        const user = userEvent.setup();
        renderInSvg(
            <EquipmentNode
                id="p-01"
                kind="pump"
                label="P-01"
                x={80}
                y={80}
                status="nominal"
                onClick={onClick}
            />,
        );
        const node = screen.getByTestId("equipment-node-p-01");
        await user.click(node);
        expect(onClick).toHaveBeenCalledTimes(1);

        node.focus();
        await user.keyboard("{Enter}");
        expect(onClick).toHaveBeenCalledTimes(2);
    });

    it("flags selection via data-selected", () => {
        renderInSvg(
            <EquipmentNode
                id="valve"
                kind="valve"
                label="Valve"
                x={100}
                y={100}
                status="nominal"
                selected
                onClick={() => {}}
            />,
        );
        expect(screen.getByTestId("equipment-node-valve")).toHaveAttribute("data-selected", "true");
    });
});
