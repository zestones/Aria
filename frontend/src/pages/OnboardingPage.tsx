/**
 * OnboardingPage — Scene 1 entry point.
 *
 * Two surfaces:
 *  - `/onboarding`                 → pick a cell, upload a PDF manual.
 *  - `/onboarding/:session_id`     → stub landing after upload. The full
 *                                    multi-turn wizard lands in M8.6.
 */

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Hairline, Icons, SectionHeader } from "../components/ui";
import { type EquipmentKbOut, PdfUpload } from "../features/onboarding";

const DEFAULT_CELL_ID = 2;

export default function OnboardingPage() {
    const { session_id: sessionId } = useParams<{ session_id: string }>();
    const navigate = useNavigate();
    const [cellId, setCellId] = useState<number>(DEFAULT_CELL_ID);
    const [result, setResult] = useState<EquipmentKbOut | null>(null);

    const handleUploaded = (response: EquipmentKbOut) => {
        setResult(response);
        const nextSessionId =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `sess-${Date.now()}`;
        window.setTimeout(() => {
            navigate(`/onboarding/${nextSessionId}`, {
                replace: true,
                state: { cellId: response.cell_id, kb: response },
            });
        }, 650);
    };

    return (
        <div className="min-h-full flex flex-col bg-background">
            <main className="flex flex-1 items-start justify-center px-4 py-10">
                <div className="w-full max-w-2xl space-y-6">
                    {sessionId ? (
                        <SessionStub sessionId={sessionId} />
                    ) : (
                        <>
                            <SectionHeader
                                label="Enrol equipment"
                                size="lg"
                                meta={<span>Cell {cellId} · Step 1 of 3</span>}
                            />
                            <p className="text-sm text-muted-foreground">
                                Upload the equipment manual as a PDF. KB Builder extracts
                                thresholds, failure patterns and maintenance procedures, then asks a
                                few calibration questions.
                            </p>

                            <CellSelector value={cellId} onChange={setCellId} />
                            <Hairline />
                            <PdfUpload cellId={cellId} onUploaded={handleUploaded} />

                            {result && (
                                <p className="text-sm text-muted-foreground">
                                    Extracted{" "}
                                    {Object.keys(result.structured_data?.thresholds ?? {}).length}{" "}
                                    thresholds. Redirecting…
                                </p>
                            )}
                        </>
                    )}
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

function SessionStub({ sessionId }: { sessionId: string }) {
    const navigate = useNavigate();
    return (
        <div className="space-y-6">
            <SectionHeader
                label="Calibration session"
                size="lg"
                meta={<Badge variant="code">{sessionId.slice(0, 8)}</Badge>}
            />
            <p className="text-sm text-muted-foreground">
                The extraction succeeded. The multi-turn calibration wizard ships with M8.6 — for
                now, the session is staged and ready.
            </p>
            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    variant="default"
                    size="md"
                    onClick={() => navigate("/control-room")}
                >
                    Continue to control room
                    <Icons.ArrowRight className="size-4" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={() => navigate("/onboarding")}
                >
                    Upload another manual
                </Button>
            </div>
        </div>
    );
}
