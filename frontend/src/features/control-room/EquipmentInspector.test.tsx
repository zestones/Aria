import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EquipmentInspector } from "./EquipmentInspector";

const node = { id: "cell:3", kind: "cell", label: "Cell 04", subLabel: "Main Booster Line" };

describe("EquipmentInspector", () => {
    it("renders nothing when closed", () => {
        render(<EquipmentInspector open={false} node={node} onClose={() => {}} />);
        expect(screen.queryByTestId("equipment-inspector")).not.toBeInTheDocument();
    });

    it("renders the node label in the header when open", () => {
        render(<EquipmentInspector open node={node} onClose={() => {}} />);
        expect(screen.getByTestId("equipment-inspector")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Cell 04" })).toBeInTheDocument();
    });

    it("renders the subLabel under the header when provided", () => {
        render(<EquipmentInspector open node={node} onClose={() => {}} />);
        expect(screen.getByText("Main Booster Line")).toBeInTheDocument();
    });

    it("omits the caption entirely when subLabel is not provided", () => {
        const bare = { id: "cell:3", kind: "cell", label: "Cell 04" };
        render(<EquipmentInspector open node={bare} onClose={() => {}} />);
        // No `kind · id` fallback — header shows only the label.
        expect(screen.queryByText(/cell\s*·\s*cell:3/i)).not.toBeInTheDocument();
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

    it("renders the three placeholder sections with the current copy", () => {
        render(<EquipmentInspector open node={node} onClose={() => {}} />);
        expect(screen.getByText("Signals (last 10)")).toBeInTheDocument();
        expect(screen.getByText("Knowledge base")).toBeInTheDocument();
        expect(screen.getByText("Recent work orders")).toBeInTheDocument();
        expect(screen.getAllByText("Live data coming in M8.")).toHaveLength(3);
    });
});
