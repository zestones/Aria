/**
 * Onboarding service — wraps the multi-turn calibration endpoints.
 *
 * Backend contract (`backend/modules/kb/router.py`):
 *   POST /kb/equipment/{cell_id}/onboarding/start
 *     → { session_id, question_index, question, total_questions }
 *   POST /kb/equipment/{cell_id}/onboarding/message
 *     body { session_id, answer }
 *     → next question (same shape) | { session_id, complete: true, kb }
 *
 * Lives in `features/onboarding/` rather than `services/kb/` because the
 * payloads are wizard-specific and not reused elsewhere.
 */

import { apiFetch } from "../../lib/api/api.client";
import type { EquipmentKbOut } from "./kb.types";

export interface OnboardingQuestion {
    session_id: string;
    question_index: number;
    question: string;
    total_questions: number;
    complete?: false;
}

export interface OnboardingComplete {
    session_id: string;
    complete: true;
    kb: EquipmentKbOut;
}

export type OnboardingTurn = OnboardingQuestion | OnboardingComplete;

export function startOnboarding(cellId: number): Promise<OnboardingQuestion> {
    return apiFetch<OnboardingQuestion>(`/kb/equipment/${cellId}/onboarding/start`, {
        method: "POST",
        body: {},
    });
}

export function submitOnboardingMessage(
    cellId: number,
    sessionId: string,
    answer: string,
): Promise<OnboardingTurn> {
    return apiFetch<OnboardingTurn>(`/kb/equipment/${cellId}/onboarding/message`, {
        method: "POST",
        body: { session_id: sessionId, answer },
    });
}
