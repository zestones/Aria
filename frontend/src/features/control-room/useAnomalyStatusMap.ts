/**
 * M7.1b — Derive an equipment status map from the live anomaly stream.
 *
 * `EquipmentGrid` renders a backend-driven list of cells whose `status` is
 * still hardcoded to `nominal` (see `useEquipmentList`). This hook overlays
 * the live Sentinel stream on top of that baseline: when an anomaly lands
 * for `cell_id=N`, the map exposes `warning` or `critical` for that cell
 * and the caller can override its own fallback.
 *
 * Severity rules (trip always beats alert):
 *  - any active anomaly with `severity="trip"` on cell X → `critical`
 *  - otherwise any active anomaly with `severity="alert"` on cell X → `warning`
 *  - no active anomaly on cell X → absent from the map (caller falls back
 *    to its own baseline, typically `nominal`)
 *
 * `unknown` is intentionally *not* produced here — that status is reserved
 * for disabled / offline equipment surfaced by the backend hierarchy, not
 * for "no anomaly seen yet".
 *
 * The returned map is memoized against the `active` array reference from
 * `useAnomalyStream`, so re-renders without new anomalies yield the same
 * identity — keeps `EquipmentGrid`'s render cheap and React keys stable.
 */

import { useMemo } from "react";
import { useAnomalyStream } from "./useAnomalyStream";

export type AnomalyStatus = "nominal" | "warning" | "critical" | "unknown";

/** Severity-derived statuses only. Absence = nominal at the caller. */
export type LiveAnomalyStatus = "warning" | "critical";

/**
 * Build a `cell_id → status` map from the currently active anomaly stream.
 *
 * @returns A readonly map keyed by numeric cell id. Cells without any active
 *          anomaly are absent from the map — callers should fall back to
 *          their own default (typically the backend-provided `nominal`).
 */
export function useAnomalyStatusMap(): ReadonlyMap<number, LiveAnomalyStatus> {
    const { active } = useAnomalyStream();

    return useMemo(() => {
        const map = new Map<number, LiveAnomalyStatus>();
        for (const evt of active) {
            const existing = map.get(evt.cell_id);
            // Trip wins over alert. Once a cell is marked critical, nothing
            // downgrades it in this pass.
            if (existing === "critical") continue;
            if (evt.severity === "trip") {
                map.set(evt.cell_id, "critical");
            } else if (evt.severity === "alert" && existing !== "warning") {
                map.set(evt.cell_id, "warning");
            }
        }
        return map;
    }, [active]);
}
