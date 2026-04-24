import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EquipmentNode } from "@/features/control-room/EquipmentNode";

describe("EquipmentNode", () => {
    it("renders the label and optional sublabel", () => {
        render(<EquipmentNode id="cell:42" label="Cell-02" sublabel="Line-01" status="nominal" />);
        expect(screen.getByText("Cell-02")).toBeInTheDocument();
        expect(screen.getByText("Line-01")).toBeInTheDocument();
    });

    it("exposes the status via data-status for styling hooks", () => {
        render(<EquipmentNode id="t1" label="Tank" status="critical" />);
        const node = screen.getByTestId("equipment-node-t1");
        expect(node).toHaveAttribute("data-status", "critical");
    });

    it("fires onClick when clicked and is keyboard-activatable", async () => {
        const onClick = vi.fn();
        const user = userEvent.setup();
        render(<EquipmentNode id="p1" label="P-01" status="nominal" onClick={onClick} />);
        const node = screen.getByTestId("equipment-node-p1");
        await user.click(node);
        expect(onClick).toHaveBeenCalledTimes(1);

        node.focus();
        await user.keyboard("{Enter}");
        expect(onClick).toHaveBeenCalledTimes(2);
    });

    it("flags selection via data-selected and aria-pressed", () => {
        render(
            <EquipmentNode id="v1" label="Valve" status="nominal" selected onClick={() => {}} />,
        );
        const node = screen.getByTestId("equipment-node-v1");
        expect(node).toHaveAttribute("data-selected", "true");
        expect(node).toHaveAttribute("aria-pressed", "true");
    });
});
