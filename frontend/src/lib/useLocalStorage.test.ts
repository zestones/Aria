import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useLocalStorage } from "./useLocalStorage";

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    window.localStorage.clear();
});

describe("useLocalStorage — same-tab sync", () => {
    it("propagates writes from one hook instance to another on the same key", () => {
        const a = renderHook(() => useLocalStorage<string>("aria.test.same-tab", "init"));
        const b = renderHook(() => useLocalStorage<string>("aria.test.same-tab", "init"));

        expect(a.result.current[0]).toBe("init");
        expect(b.result.current[0]).toBe("init");

        act(() => {
            a.result.current[1]("updated");
        });

        expect(a.result.current[0]).toBe("updated");
        expect(b.result.current[0]).toBe("updated");
        expect(window.localStorage.getItem("aria.test.same-tab")).toBe(JSON.stringify("updated"));
    });

    it("ignores same-tab events targeting a different key", () => {
        const a = renderHook(() => useLocalStorage<string>("aria.test.key-a", "a-init"));
        const b = renderHook(() => useLocalStorage<string>("aria.test.key-b", "b-init"));

        act(() => {
            a.result.current[1]("a-updated");
        });

        expect(a.result.current[0]).toBe("a-updated");
        expect(b.result.current[0]).toBe("b-init");
    });
});

describe("useLocalStorage — cross-tab sync (native storage event)", () => {
    it("updates state when a StorageEvent for its key is dispatched", () => {
        const { result } = renderHook(() => useLocalStorage<string>("aria.test.cross-tab", "init"));

        act(() => {
            window.dispatchEvent(
                new StorageEvent("storage", {
                    key: "aria.test.cross-tab",
                    newValue: JSON.stringify("from-other-tab"),
                }),
            );
        });

        expect(result.current[0]).toBe("from-other-tab");
    });
});

describe("useLocalStorage — validator on custom event", () => {
    it("does not update state when validator rejects an incoming same-tab value", () => {
        interface Shape {
            v: number;
        }
        const validator = (raw: unknown): Shape | null => {
            if (
                typeof raw === "object" &&
                raw !== null &&
                "v" in raw &&
                typeof (raw as { v: unknown }).v === "number"
            ) {
                return raw as Shape;
            }
            return null;
        };

        const reader = renderHook(() =>
            useLocalStorage<Shape>("aria.test.validated", { v: 0 }, { validator }),
        );

        // Writer instance has NO validator, so it will happily persist an
        // invalid shape and dispatch the sync event. The reader must reject
        // it via its validator and keep its current state.
        const writer = renderHook(() => useLocalStorage<unknown>("aria.test.validated", { v: 0 }));

        expect(reader.result.current[0]).toEqual({ v: 0 });

        act(() => {
            writer.result.current[1]({ bogus: true });
        });

        // Reader's validator rejected the payload → state unchanged.
        expect(reader.result.current[0]).toEqual({ v: 0 });
    });
});
