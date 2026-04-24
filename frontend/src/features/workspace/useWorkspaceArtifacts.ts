import { useMemo } from "react";
import type { AgentMessage, ArtifactPart, ChatMessage } from "../chat/chatStore";

/**
 * One artifact extracted from the chat stream, decorated with the
 * provenance the workspace canvas needs to render it large + caption it
 * with the emitting agent and turn timestamp.
 */
export interface WorkspaceArtifact {
    id: string;
    component: string;
    props: Record<string, unknown>;
    /** Agent that produced the parent agent-message this artifact lives in. */
    agent: string;
    /** Created-at of the parent agent-message — used for the eyebrow caption. */
    emittedAt: number;
    /** Stable index in arrival order — used for staggered entrance. */
    arrivalIndex: number;
}

/**
 * Pull every `artifact` part out of the conversation in chronological
 * order. Memoised on the messages array so the workspace canvas only
 * re-flows when the underlying message log actually changes.
 */
export function useWorkspaceArtifacts(messages: ChatMessage[]): WorkspaceArtifact[] {
    return useMemo(() => {
        const out: WorkspaceArtifact[] = [];
        let i = 0;
        for (const m of messages) {
            if (m.role !== "agent") continue;
            const am = m as AgentMessage;
            for (const part of am.parts) {
                if (part.kind !== "artifact") continue;
                const ap = part as ArtifactPart;
                out.push({
                    id: ap.id,
                    component: ap.component,
                    props: ap.props,
                    agent: am.agent,
                    emittedAt: am.createdAt,
                    arrivalIndex: i,
                });
                i += 1;
            }
        }
        return out;
    }, [messages]);
}
