/**
 * Typed message maps for ARIA WebSocket endpoints.
 *
 * - `EventBusMap`: keyed record for `/api/v1/events` (server-driven telemetry).
 * - `ChatMap`: discriminated union for `/api/v1/agent/chat` (streamed agent
 *   turns).
 */

export type EventBusMap = {
    anomaly_detected: {
        cell_id: number;
        signal_def_id: number;
        value: number;
        threshold: number;
        work_order_id: number;
        time: string;
        severity: "alert" | "trip";
        direction: "high" | "low";
    };
    tool_call_started: {
        agent: string;
        tool_name: string;
        args: Record<string, unknown>;
        turn_id: string;
    };
    tool_call_completed: {
        agent: string;
        tool_name: string;
        duration_ms: number;
        turn_id: string;
    };
    agent_handoff: {
        from_agent: string;
        to_agent: string;
        reason: string;
        turn_id: string;
    };
    thinking_delta: {
        agent: string;
        content: string;
        turn_id: string;
    };
    rca_ready: {
        work_order_id: number;
        rca_summary: string;
        confidence: number;
        turn_id: string;
    };
    work_order_ready: {
        work_order_id: number;
    };
    ui_render: {
        agent: string;
        component: string;
        props: Record<string, unknown>;
        turn_id: string;
    };
    agent_start: {
        agent: string;
        turn_id: string;
    };
    agent_end: {
        agent: string;
        turn_id: string;
        finish_reason: string;
    };
};

export type ChatMap =
    | { type: "text_delta"; content: string }
    | { type: "thinking_delta"; content: string }
    | { type: "tool_call"; name: string; args: Record<string, unknown> }
    | { type: "tool_result"; name: string; summary: string }
    | { type: "ui_render"; component: string; props: Record<string, unknown> }
    | { type: "agent_handoff"; from: string; to: string; reason: string }
    | { type: "done"; error?: string };
