import { afterEach, describe, expect, it } from "vitest";
import { type ActivityEvent, MAX_EVENTS, useActivityFeedStore } from "@/features/agents/activityFeedStore";

function pushN(count: number, kind: ActivityEvent["kind"] = "agent_start") {
    for (let i = 0; i < count; i += 1) {
        const e: ActivityEvent = {
            kind: "agent_start",
            id: `evt-${i}`,
            receivedAt: Date.now() + i,
            agent: i % 2 === 0 ? "investigator" : "sentinel",
            turn_id: `turn-${i}`,
        } as ActivityEvent;
        void kind;
        useActivityFeedStore.getState().push(e);
    }
}

afterEach(() => {
    useActivityFeedStore.getState().clear();
});

describe("activityFeedStore", () => {
    it("prepends newest events to the buffer", () => {
        useActivityFeedStore.getState().push({
            kind: "agent_start",
            id: "evt-a",
            receivedAt: 1,
            agent: "sentinel",
            turn_id: "turn-a",
        });
        useActivityFeedStore.getState().push({
            kind: "agent_start",
            id: "evt-b",
            receivedAt: 2,
            agent: "investigator",
            turn_id: "turn-b",
        });
        const events = useActivityFeedStore.getState().events;
        expect(events[0].id).toBe("evt-b");
        expect(events[1].id).toBe("evt-a");
    });

    it("caps the buffer at MAX_EVENTS (FIFO, oldest drops)", () => {
        pushN(MAX_EVENTS + 20);
        const events = useActivityFeedStore.getState().events;
        expect(events).toHaveLength(MAX_EVENTS);
        // Newest is the last pushed (index MAX_EVENTS+19).
        expect(events[0].id).toBe(`evt-${MAX_EVENTS + 19}`);
        // Oldest kept should be the one at position MAX_EVENTS-1 from the end,
        // i.e. id=20 (first 20 dropped).
        expect(events[events.length - 1].id).toBe("evt-20");
    });

    it("clear() empties the buffer", () => {
        pushN(5);
        expect(useActivityFeedStore.getState().events.length).toBe(5);
        useActivityFeedStore.getState().clear();
        expect(useActivityFeedStore.getState().events).toHaveLength(0);
    });

    it("preserves the discriminated kinds so consumers can filter by agent", () => {
        const events: ActivityEvent[] = [
            {
                kind: "agent_start",
                id: "e1",
                receivedAt: 1,
                agent: "investigator",
                turn_id: "t1",
            },
            {
                kind: "agent_handoff",
                id: "e2",
                receivedAt: 2,
                from_agent: "investigator",
                to_agent: "kb_builder",
                reason: "need torque spec",
                turn_id: "t1",
            },
            {
                kind: "anomaly_detected",
                id: "e3",
                receivedAt: 3,
                cell_id: 2,
                signal_def_id: 11,
                value: 4.8,
                threshold: 4.2,
                work_order_id: 101,
                time: "2026-04-24T12:00:00.000Z",
                severity: "alert",
                direction: "high",
            },
        ];
        for (const e of events) useActivityFeedStore.getState().push(e);
        const stored = useActivityFeedStore.getState().events;
        expect(stored).toHaveLength(3);
        const kinds = stored.map((e) => e.kind);
        expect(kinds).toContain("agent_start");
        expect(kinds).toContain("agent_handoff");
        expect(kinds).toContain("anomaly_detected");
    });
});
