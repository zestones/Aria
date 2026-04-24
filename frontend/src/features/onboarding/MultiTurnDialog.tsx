/**
 * MultiTurnDialog — single-question Q&A turn rendered by the OnboardingWizard
 * during the calibration phase (Scene 1).
 *
 * Posts each operator answer to `/kb/equipment/{cell_id}/onboarding/message`
 * and renders the next question (or hands the final KB back to the wizard).
 *
 * Forward-only by design: the backend session has no "go back" affordance,
 * so a back button is intentionally omitted from the question UI.
 */

import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Icons } from "../../components/ui";
import {
    type OnboardingComplete,
    type OnboardingQuestion,
    submitOnboardingMessage,
} from "./onboarding.service";

export interface MultiTurnDialogProps {
    cellId: number;
    question: OnboardingQuestion;
    onNext: (next: OnboardingQuestion) => void;
    onComplete: (final: OnboardingComplete) => void;
}

export function MultiTurnDialog({ cellId, question, onNext, onComplete }: MultiTurnDialogProps) {
    const [answer, setAnswer] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Refocus + clear on each new question.
    // biome-ignore lint/correctness/useExhaustiveDependencies: only resetting on a new question's index, not on every prop change.
    useEffect(() => {
        setAnswer("");
        textareaRef.current?.focus();
    }, [question.question_index]);

    const mutation = useMutation({
        mutationFn: (value: string) => submitOnboardingMessage(cellId, question.session_id, value),
        onSuccess: (turn) => {
            if (turn.complete) onComplete(turn);
            else onNext(turn);
        },
    });

    const submit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const trimmed = answer.trim();
        if (!trimmed || mutation.isPending) return;
        mutation.mutate(trimmed);
    };

    const total = Math.max(1, question.total_questions);
    const current = question.question_index + 1; // backend index is 0-based
    const errorMessage =
        mutation.error instanceof Error ? mutation.error.message : "Couldn't send that answer.";

    return (
        <Card padding="lg" className="w-full">
            <div className="mb-4 flex items-center justify-between">
                <Badge variant="agent" agent="kb_builder" size="md">
                    KB Builder
                </Badge>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    Question {current} of {total}
                </span>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={question.question_index}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                    <p className="mb-5 text-lg font-medium leading-snug tracking-[-0.02em] text-foreground">
                        {question.question}
                    </p>
                </motion.div>
            </AnimatePresence>

            <form onSubmit={submit} className="space-y-3">
                <textarea
                    ref={textareaRef}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={3}
                    placeholder="Type your answer…"
                    disabled={mutation.isPending}
                    className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-text-tertiary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                    aria-label={`Answer to: ${question.question}`}
                />

                {mutation.isError && <p className="text-sm text-destructive">{errorMessage}</p>}

                <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                        {answer.trim().length === 0
                            ? "Required"
                            : `${answer.trim().length} characters`}
                    </span>
                    <Button
                        type="submit"
                        variant="default"
                        size="md"
                        disabled={mutation.isPending || answer.trim().length === 0}
                    >
                        <span>{mutation.isPending ? "Sending…" : "Submit answer"}</span>
                        <Icons.ArrowRight className="size-4" aria-hidden />
                    </Button>
                </div>
            </form>
        </Card>
    );
}
