/**
 * Tiny cross-component signal: any feature can ask the AppShell-owned chat
 * drawer to open without taking a callback prop or knowing about its
 * localStorage state.
 *
 * Pattern: monotonic counter `requestOpenId` — bump it from anywhere; the
 * AppShell subscribes via `useEffect` and flips its own drawer state to
 * `open: true` when the counter advances. We intentionally do **not** own
 * the drawer's open/closed state here — AppShell remains the single source
 * of truth (with localStorage persistence). This store only carries the
 * "please open" intent.
 *
 * Used by:
 *  - AnomalyBanner "Investigate" button
 *  - AnomaliesList per-row "Investigate" button
 */

import { create } from "zustand";

export interface ChatDrawerOpenerState {
    /** Monotonic counter — bumped each time someone requests an open. */
    requestOpenId: number;
    /** Bump the counter so subscribers (AppShell) open the drawer. */
    requestOpen: () => void;
}

export const useChatDrawerOpener = create<ChatDrawerOpenerState>((set) => ({
    requestOpenId: 0,
    requestOpen: () => set((s) => ({ requestOpenId: s.requestOpenId + 1 })),
}));
