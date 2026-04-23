import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArtifactRenderer } from "./ArtifactRenderer";
import { registry } from "./registry";

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("ArtifactRenderer", () => {
    it("renders an unknown fallback when the component is not registered", () => {
        render(<ArtifactRenderer component="ghost_widget" props={{}} />);
        expect(screen.getByText(/Unknown artifact: ghost_widget/i)).toBeInTheDocument();
    });

    it("renders the matching placeholder when props validate", () => {
        render(
            <ArtifactRenderer
                component="alert_banner"
                props={{
                    cell_id: 3,
                    severity: "alert",
                    message: "Vibration exceeded threshold",
                    anomaly_id: 77,
                }}
            />,
        );
        expect(screen.getByText(/Alert banner/i)).toBeInTheDocument();
        expect(screen.getByText(/cell 3 · alert/i)).toBeInTheDocument();
    });

    it("renders an invalid-props fallback when the schema rejects the payload", () => {
        render(
            <ArtifactRenderer
                component="signal_chart"
                // missing required signal_def_id, wrong types for cell_id
                props={{ cell_id: "not-a-number" }}
            />,
        );
        expect(
            screen.getByText(/Artifact error: invalid props for signal_chart/i),
        ).toBeInTheDocument();
    });

    it("catches runtime render errors via its error boundary", () => {
        // Silence expected error logs in this assertion path.
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const originalAlertBanner = registry.alert_banner;
        const Boom = () => {
            throw new Error("boom");
        };
        // Inject a throwing component behind a registered name so the dispatcher
        // reaches the error boundary path (valid lookup + valid schema + throw).
        registry.alert_banner = Boom;

        try {
            render(
                <ArtifactRenderer
                    component="alert_banner"
                    props={{
                        cell_id: 1,
                        severity: "info",
                        message: "ok",
                    }}
                />,
            );
            expect(
                screen.getByText(/Artifact error: alert_banner failed to render/i),
            ).toBeInTheDocument();
        } finally {
            registry.alert_banner = originalAlertBanner;
            errorSpy.mockRestore();
        }
    });
});
