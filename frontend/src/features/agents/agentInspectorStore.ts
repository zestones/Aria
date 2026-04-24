/**
 * Global open/close state for the Agent Inspector drawer. Kept minimal —
 * just the agent being inspected. The actual stream state lives inside
 * `useAgentStream`, scoped to the open agent.
 *
 * Any chat row (or future activity feed row) calls `openForAgent(id)` to
 * surface the inspector for that agent's active turn.
 */

import { create } from "zustand";

export interface AgentInspectorState {
    /** Agent currently being inspected, or null when closed. */
    agent: string | null;
    /** Open (or switch) the inspector to a given agent. */
    openForAgent: (agent: string) => void;
    /** Close the drawer. */
    close: () => void;
}

export const useAgentInspectorStore = create<AgentInspectorState>((set) => ({
    agent: null,
    openForAgent: (agent) => set({ agent }),
    close: () => set({ agent: null }),
}));
