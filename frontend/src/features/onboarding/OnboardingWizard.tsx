/**
 * OnboardingWizard — Scene 1 of the demo: Upload → Parsing → Calibration → Ready.
 *
 * State machine:
 *   upload      → PdfUpload (existing component)
 *      ↓ on EquipmentKbOut returned
 *   parsing     → KbProgress with all phases done; auto-advance after ~1.4s
 *      ↓ on `startOnboarding(cellId)` resolved
 *   calibration → MultiTurnDialog loop until {complete:true}
 *      ↓
 *   ready       → EquipmentKbCard (the calibrated KB) + CTA to control room
 *
 * The 4-pill step indicator at the top mirrors the live stage so the operator
 * always knows where they are. Stage transitions use a 0.22s cinematic ease.
 */

import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EquipmentKbCard } from "../../components/artifacts/placeholders/EquipmentKbCard";
import { KbProgress } from "../../components/artifacts/placeholders/KbProgress";
import { Badge, Button, Card, Icons } from "../../components/ui";
import type { EquipmentKbOut } from "./kb.types";
import { MultiTurnDialog } from "./MultiTurnDialog";
import {
    type OnboardingComplete,
    type OnboardingQuestion,
    startOnboarding,
} from "./onboarding.service";
import { PdfUpload } from "./PdfUpload";

type Stage = "upload" | "parsing" | "calibration" | "ready";

const STAGE_ORDER: Stage[] = ["upload", "parsing", "calibration", "ready"];
const STAGE_LABELS: Record<Stage, string> = {
    upload: "Upload",
    parsing: "Parse",
    calibration: "Calibrate",
    ready: "Ready",
};

const PARSING_STEPS = [
    "Read PDF manual",
    "Extract thresholds",
    "Detect failure patterns",
    "Map maintenance procedures",
    "Persist knowledge base",
];

export interface OnboardingWizardProps {
    cellId: number;
}

export function OnboardingWizard({ cellId }: OnboardingWizardProps) {
    const navigate = useNavigate();
    const [stage, setStage] = useState<Stage>("upload");
    const [uploadedKb, setUploadedKb] = useState<EquipmentKbOut | null>(null);
    const [currentQuestion, setCurrentQuestion] = useState<OnboardingQuestion | null>(null);
    const [finalKb, setFinalKb] = useState<EquipmentKbOut | null>(null);
    const [highlightFields, setHighlightFields] = useState<string[]>([]);

    const startMutation = useMutation({
        mutationFn: () => startOnboarding(cellId),
        onSuccess: (q) => {
            setCurrentQuestion(q);
            setStage("calibration");
        },
    });

    // Once the upload returns, dwell briefly on the celebratory parsing screen
    // (so the 5 phases visibly land green), then kick off the real onboarding
    // session. Real time = upload latency + ~1.4 s.
    useEffect(() => {
        if (stage !== "parsing" || !uploadedKb) return;
        const t = window.setTimeout(() => startMutation.mutate(), 1400);
        return () => window.clearTimeout(t);
    }, [stage, uploadedKb, startMutation]);

    const handleUploaded = (kb: EquipmentKbOut) => {
        setUploadedKb(kb);
        setStage("parsing");
    };

    const handleNextQuestion = (q: OnboardingQuestion) => setCurrentQuestion(q);

    const handleComplete = (final: OnboardingComplete) => {
        setFinalKb(final.kb);
        const thresholdKeys = Object.keys(final.kb.structured_data?.thresholds ?? {});
        setHighlightFields(thresholdKeys);
        setStage("ready");
    };

    const startError =
        startMutation.error instanceof Error
            ? startMutation.error.message
            : startMutation.isError
              ? "Couldn't open the calibration session."
              : null;

    return (
        <div className="space-y-6">
            <StageIndicator current={stage} />

            <AnimatePresence mode="wait">
                {stage === "upload" && (
                    <motion.div key="upload" {...fade}>
                        <PdfUpload cellId={cellId} onUploaded={handleUploaded} />
                    </motion.div>
                )}

                {stage === "parsing" && uploadedKb && (
                    <motion.div key="parsing" {...fade} className="space-y-3">
                        <KbProgress
                            cell_id={cellId}
                            steps={PARSING_STEPS.map((label) => ({
                                label,
                                status: "done" as const,
                            }))}
                        />
                        {startMutation.isPending && (
                            <p className="text-center text-xs text-muted-foreground">
                                Opening calibration session…
                            </p>
                        )}
                        {startError && (
                            <Card padding="md">
                                <p className="text-sm text-destructive">{startError}</p>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="mt-3"
                                    onClick={() => startMutation.mutate()}
                                >
                                    Retry
                                </Button>
                            </Card>
                        )}
                    </motion.div>
                )}

                {stage === "calibration" && currentQuestion && (
                    <motion.div key="calibration" {...fade}>
                        <MultiTurnDialog
                            cellId={cellId}
                            question={currentQuestion}
                            onNext={handleNextQuestion}
                            onComplete={handleComplete}
                        />
                    </motion.div>
                )}

                {stage === "ready" && finalKb && (
                    <motion.div key="ready" {...fade} className="space-y-4">
                        <Card padding="md" rail="nominal" railPulse={false}>
                            <div className="flex items-center gap-2">
                                <Icons.Check className="h-5 w-5 text-success" aria-hidden />
                                <h3 className="text-base font-medium tracking-[-0.02em] text-foreground">
                                    Knowledge base calibrated
                                </h3>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                                {highlightFields.length} thresholds tuned by your answers. ARIA can
                                now monitor this cell.
                            </p>
                        </Card>

                        <EquipmentKbCard cell_id={cellId} highlight_fields={highlightFields} />

                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="default"
                                size="md"
                                onClick={() => navigate("/control-room")}
                            >
                                <span>Continue to control room</span>
                                <Icons.ArrowRight className="size-4" aria-hidden />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="md"
                                onClick={() => {
                                    setUploadedKb(null);
                                    setCurrentQuestion(null);
                                    setFinalKb(null);
                                    setHighlightFields([]);
                                    setStage("upload");
                                }}
                            >
                                Onboard another cell
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const fade = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
};

function StageIndicator({ current }: { current: Stage }) {
    const currentIdx = STAGE_ORDER.indexOf(current);
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {STAGE_ORDER.map((stage, idx) => {
                const status: "done" | "active" | "future" =
                    idx < currentIdx ? "done" : idx === currentIdx ? "active" : "future";
                const cls =
                    status === "active"
                        ? "bg-primary text-primary-foreground"
                        : status === "done"
                          ? "bg-success/10 text-success"
                          : "bg-muted text-text-tertiary";
                return (
                    <span
                        key={stage}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${cls}`}
                    >
                        {status === "done" && <Icons.Check className="h-3 w-3" aria-hidden />}
                        <span>{STAGE_LABELS[stage]}</span>
                    </span>
                );
            })}
            <Badge variant="default" size="sm" className="ml-auto">
                Scene 1 · Onboarding
            </Badge>
        </div>
    );
}
