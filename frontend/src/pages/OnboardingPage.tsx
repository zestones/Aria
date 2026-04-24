/**
 * OnboardingPage — Scene 1 entry point.
 *
 * Always mounts the `OnboardingWizard`. The optional `:session_id` URL
 * segment is preserved for deep-linkable bookmarks but the wizard manages
 * the live session state internally.
 */

import { useState } from "react";
import { useParams } from "react-router-dom";
import { Hairline, SectionHeader } from "../components/ui";
import { OnboardingWizard } from "../features/onboarding";

const DEFAULT_CELL_ID = 2;

export default function OnboardingPage() {
    const { session_id: sessionId } = useParams<{ session_id: string }>();
    const [cellId, setCellId] = useState<number>(DEFAULT_CELL_ID);

    return (
        <div className="min-h-full flex flex-col bg-background">
            <main className="flex flex-1 items-start justify-center px-4 py-10">
                <div className="w-full max-w-2xl space-y-6">
                    <SectionHeader
                        label="Enrol equipment"
                        size="lg"
                        meta={
                            <span>
                                Cell {cellId}
                                {sessionId ? ` · session ${sessionId.slice(0, 8)}` : ""}
                            </span>
                        }
                    />
                    <p className="text-sm text-muted-foreground">
                        Upload the equipment manual as a PDF. KB Builder extracts thresholds,
                        failure patterns and maintenance procedures, then asks a few calibration
                        questions before ARIA starts monitoring.
                    </p>

                    {!sessionId && <CellSelector value={cellId} onChange={setCellId} />}
                    <Hairline />
                    <OnboardingWizard cellId={cellId} />
                </div>
            </main>
        </div>
    );
}

function CellSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const options = [
        { id: 1, label: "Cell 01.01 — Intake pump" },
        { id: 2, label: "Cell 02.01 — Booster pump P-02" },
        { id: 3, label: "Cell 03.01 — Dosing pump" },
    ];
    return (
        <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-muted-foreground">Target cell</span>
            <div className="flex flex-wrap gap-2">
                {options.map((opt) => {
                    const active = opt.id === value;
                    return (
                        <button
                            type="button"
                            key={opt.id}
                            onClick={() => onChange(opt.id)}
                            aria-pressed={active}
                            className={`inline-flex h-8 items-center rounded-lg border px-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                active
                                    ? "border-primary bg-accent-soft text-primary"
                                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                            }`}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
