/**
 * Mock PDF-upload transport — isomorphic to the real
 * `POST /api/v1/kb/equipment/{cell_id}/upload` endpoint (backend M3.2).
 *
 * The signature mirrors the real call so swapping in `uploadPdf` via
 * `apiFetch` is a one-line change at the call site once M3.2 lands.
 *
 * Returns the same `EquipmentKbOut` shape as the backend (see
 * `backend/modules/kb/schemas.py::EquipmentKbOut`). Progress callback
 * simulates the upload percent to exercise the progress bar.
 */
import type { EquipmentKbOut } from "./kb.types";

export interface UploadPdfOptions {
    /** Target cell id — path param in the real endpoint. */
    cellId: number;
    /** The PDF file (field `file`). */
    file: File;
    /** 0..100 upload progress; fires frequently during the simulated send. */
    onProgress?: (pct: number) => void;
    /** Abort signal — cancels pending timers and rejects with AbortError. */
    signal?: AbortSignal;
}

const MOCK_TOTAL_MS = 2600;
const MOCK_TICK_MS = 80;

export class UploadAbortError extends Error {
    constructor() {
        super("upload aborted");
        this.name = "AbortError";
    }
}

function buildMockResponse(cellId: number, file: File): EquipmentKbOut {
    const now = new Date().toISOString();
    return {
        id: 1001,
        cell_id: cellId,
        cell_name: `Cell ${String(cellId).padStart(2, "0")}.01`,
        equipment_type: "Centrifugal pump",
        manufacturer: "Grundfos",
        model: "CR 32-4",
        installation_date: null,
        structured_data: {
            equipment: {
                equipment_type: "Centrifugal pump",
                manufacturer: "Grundfos",
                model: "CR 32-4",
                motor_power_kw: 7.5,
                rpm_nominal: 2900,
                service_description: `Extracted from ${file.name}.`,
            },
            thresholds: {
                vibration_mm_s: {
                    nominal: 2.8,
                    alert: 5.0,
                    trip: 7.1,
                    unit: "mm/s",
                    source: "§ maintenance, p. 14",
                    confidence: 0.82,
                },
                bearing_temp_c: {
                    nominal: 68,
                    alert: 85,
                    trip: 95,
                    unit: "°C",
                    source: "§ specifications, p. 6",
                    confidence: 0.9,
                },
                flow_l_min: {
                    alert: null,
                    source: "pending_calibration",
                    confidence: 0,
                },
                pressure_bar: {
                    alert: null,
                    source: "pending_calibration",
                    confidence: 0,
                },
            },
            failure_patterns: [
                {
                    mode: "Bearing wear",
                    symptoms: "Rising vibration followed by temperature creep",
                    mtbf_months: 36,
                },
            ],
            maintenance_procedures: [
                {
                    action: "Replace mechanical seal",
                    interval_months: 24,
                    duration_min: 90,
                    parts: ["seal kit 905-12"],
                },
            ],
        },
        raw_markdown: null,
        confidence_score: 0.64,
        last_enriched_at: now,
        onboarding_complete: false,
        last_updated_by: "kb_builder_agent",
        last_updated_at: now,
        created_at: now,
    };
}

/**
 * Simulate a multipart upload with progress + abort support.
 *
 * Resolves with the decoded `EquipmentKbOut` on success.
 * Rejects with `UploadAbortError` when `signal` aborts.
 * Rejects with `Error` on the rare simulated server failure (files whose
 * name contains `fail` — lets tests exercise the error branch without a
 * network layer).
 */
export function mockUploadPdf(options: UploadPdfOptions): Promise<EquipmentKbOut> {
    const { cellId, file, onProgress, signal } = options;

    return new Promise<EquipmentKbOut>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new UploadAbortError());
            return;
        }

        const timers = new Set<ReturnType<typeof setTimeout>>();
        const clearAll = () => {
            for (const t of timers) clearTimeout(t);
            timers.clear();
        };

        const onAbort = () => {
            clearAll();
            signal?.removeEventListener("abort", onAbort);
            reject(new UploadAbortError());
        };
        signal?.addEventListener("abort", onAbort, { once: true });

        const ticks = Math.max(1, Math.floor(MOCK_TOTAL_MS / MOCK_TICK_MS));
        for (let i = 1; i <= ticks; i++) {
            const t = setTimeout(() => {
                timers.delete(t);
                if (signal?.aborted) return;
                onProgress?.(Math.min(100, Math.round((i / ticks) * 100)));
            }, i * MOCK_TICK_MS);
            timers.add(t);
        }

        const finish = setTimeout(() => {
            timers.delete(finish);
            if (signal?.aborted) return;
            signal?.removeEventListener("abort", onAbort);
            if (file.name.toLowerCase().includes("fail")) {
                reject(new Error("Extraction failed after retry: schema validation error"));
                return;
            }
            onProgress?.(100);
            resolve(buildMockResponse(cellId, file));
        }, MOCK_TOTAL_MS + 40);
        timers.add(finish);
    });
}
