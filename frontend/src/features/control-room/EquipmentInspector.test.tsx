import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EquipmentInspector } from "./EquipmentInspector";

const node = { id: "p-02", kind: "pump", label: "P-02" };

describe("EquipmentInspector", () => {
    it("renders nothing when closed", () => {
        render(<EquipmentInspector open={false} node={node} onClose={() => {}} />);
        expect(screen.queryByTestId("equipment-inspector")).not.toBeInTheDocument();
    });

    it("renders the node label in the header when open", () => {
        render(<EquipmentInspector open node={node} onClose={() => {}} />);
        expect(screen.getByTestId("equipment-inspector")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "P-02" })).toBeInTheDocument();
    });

    it("calls onClose when the close button is clicked", async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(<EquipmentInspector open node={node} onClose={onClose} />);
        await user.click(screen.getByRole("button", { name: "Close inspector" }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Escape is pressed", async () => {
        const onClose = vi.fn();
        const user = userEvent.setup();
        render(<EquipmentInspector open node={node} onClose={onClose} />);
        await user.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("renders the three M7.1a placeholder sections", () => {
        render(<EquipmentInspector open node={node} onClose={() => {}} />);
        expect(screen.getByText("Signals (last 10)")).toBeInTheDocument();
        expect(screen.getByText("Knowledge base")).toBeInTheDocument();
        expect(screen.getByText("Recent work orders")).toBeInTheDocument();
    });
});
