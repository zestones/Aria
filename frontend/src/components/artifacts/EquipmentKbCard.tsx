/**
 * EquipmentKbCard — M8.2 real artifact.
 *
 * Mounted inline inside chat when the agent emits `render_equipment_kb_card`.
 *
 * Responsibilities:
 * - Fetch the full equipment KB for a given cell via `GET /kb/equipment/{cell_id}`.
 * - Display header / thresholds / specs / footer (see DESIGN_PLAN §5).
 * - Allow the operator to calibrate threshold values inline (click-to-edit +
 *   optimistic `PUT /kb/equipment` + rollback on error).
 * - Highlight the specific threshold fields listed in `highlight_fields` with
 *   a static accent ring (no pulse — DESIGN_PLAN §6 / §9).
 *
 * Design constraints:
 * - Tokens only (no hex, no gradients) — §2.
 * - Sentence case headers, Inter everywhere, mono *only* on numeric cells
 *   (with `tabular-nums`) — §3.
 * - Collapsible sections use native `<details>` — no new deps.
 * - No animation loops, no shimmer, no glow — §6, §9.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { EquipmentKB, EquipmentKbOut, ThresholdValue } from "../../features/onboarding";
import { getEquipmentKb, upsertEquipmentKb } from "../../services/kb";
import { ChevronDown } from "../ui/icons";
import type { EquipmentKbCardProps } from "./schemas";

// ---------- Types ----------

interface UpsertBody {
    cell_id: number;
    structured_data: EquipmentKB;
    equipment_type?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    installation_date?: string | null;
    last_updated_by: string;
}

type ThresholdNumKey = "nominal" | "alert" | "trip" | "low_alert" | "high_alert";

interface EditState {
    value: string; // kept as string for the controlled input (allows empty/partial typing)
    original: number;
}

// ---------- Helpers ----------

/**
 * Human label for a threshold key like `vibration_mm_s` → `Vibration (mm/s)`.
 * Unit suffix (`_mm_s`, `_c`, `_l_min`, `_bar`, `_kpa`…) is extracted into
 * parentheses when present; everything else is sentence-cased.
 */
const UNIT_SUFFIXES: Array<{ match: string; unit: string }> = [
    { match: "_mm_s", unit: "mm/s" },
    { match: "_l_min", unit: "L/min" },
    { match: "_m3_h", unit: "m³/h" },
    { match: "_kpa", unit: "kPa" },
    { match: "_bar", unit: "bar" },
    { match: "_rpm", unit: "rpm" },
    { match: "_hz", unit: "Hz" },
    // Temperature — strip only the `_c`/`_f` so the label keeps `temp`.
    { match: "_c", unit: "°C" },
    { match: "_f", unit: "°F" },
];

export function humanizeThresholdKey(key: string): string {
    let base = key;
    let unit: string | null = null;
    for (const { match, unit: u } of UNIT_SUFFIXES) {
        if (base.endsWith(match)) {
            base = base.slice(0, -match.length);
            unit = u;
            break;
        }
    }
    const label = base
        .split("_")
        .filter(Boolean)
        .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(" ");
    return unit ? `${label} (${unit})` : label;
}

const SPEC_LABELS: Record<string, string> = {
    equipment_type: "Equipment type",
    manufacturer: "Manufacturer",
    model: "Model",
    motor_power_kw: "Motor power (kW)",
    rpm_nominal: "Rated speed (rpm)",
    service_description: "Service",
    installation_date: "Installed",
    cell_id: "Cell",
};

function formatSpecValue(v: unknown): string {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "number") return String(v);
    return String(v);
}

/**
 * Ordered list of numeric threshold fields we display.
 * Skip null/undefined at render time.
 */
const THRESHOLD_FIELDS: ThresholdNumKey[] = ["nominal", "low_alert", "alert", "high_alert", "trip"];

const THRESHOLD_FIELD_LABELS: Record<ThresholdNumKey, string> = {
    nominal: "nominal",
    alert: "alert",
    trip: "trip",
    low_alert: "low",
    high_alert: "high",
};

function fetchEquipmentKb(cellId: number): Promise<EquipmentKbOut> {
    return getEquipmentKb(cellId);
}

// ---------- Main component ----------

export function EquipmentKbCard(props: EquipmentKbCardProps) {
    const { cell_id, highlight_fields } = props;
    const highlightSet = new Set(highlight_fields ?? []);
    const queryClient = useQueryClient();

    const queryKey = ["kb-equipment", cell_id] as const;

    const {
        data: kb,
        isLoading,
        isError,
    } = useQuery<EquipmentKbOut>({
        queryKey,
        queryFn: () => fetchEquipmentKb(cell_id),
        staleTime: 60_000,
    });

    const [edits, setEdits] = useState<Record<string, EditState>>({});

    const mutation = useMutation({
        mutationFn: (body: UpsertBody) => upsertEquipmentKb(body),
        onMutate: async (body) => {
            await queryClient.cancelQueries({ queryKey });
            const prev = queryClient.getQueryData<EquipmentKbOut>(queryKey);
            if (prev) {
                // Optimistic: merge the body's structured_data + meta into the cached KB.
                queryClient.setQueryData<EquipmentKbOut>(queryKey, {
                    ...prev,
                    equipment_type: body.equipment_type ?? prev.equipment_type,
                    manufacturer: body.manufacturer ?? prev.manufacturer,
                    model: body.model ?? prev.model,
                    installation_date: body.installation_date ?? prev.installation_date,
                    structured_data: body.structured_data,
                    last_updated_by: body.last_updated_by,
                });
            }
            return { prev };
        },
        onError: (_err, _body, ctx) => {
            if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey });
        },
    });

    // ---------- Loading / error fallbacks ----------

    if (isLoading) {
        return (
            <div
                className="flex w-full items-center justify-center rounded-lg border border-border bg-card p-4"
                role="status"
            >
                <span className="text-xs text-muted-foreground">Loading equipment KB…</span>
            </div>
        );
    }

    if (isError || !kb) {
        return (
            <div className="w-full rounded-lg border border-border bg-card p-3">
                <div className="mb-1 text-sm font-medium text-foreground">Equipment</div>
                <div className="text-xs text-text-tertiary">No KB data for cell {cell_id}.</div>
            </div>
        );
    }

    // ---------- Derived data ----------

    const kbData: EquipmentKbOut = kb;
    const structured: EquipmentKB = kbData.structured_data ?? {};
    const thresholds: Record<string, ThresholdValue> = structured.thresholds ?? {};
    const equipment = structured.equipment ?? {};

    const thresholdKeys = Object.keys(thresholds);
    const displayName = kbData.cell_name ?? `Cell ${cell_id}`;
    const equipmentType = kbData.equipment_type ?? equipment.equipment_type ?? "Equipment";

    const subParts: string[] = [];
    if (kbData.manufacturer) subParts.push(kbData.manufacturer);
    if (kbData.model) subParts.push(kbData.model);
    if (kbData.installation_date) subParts.push(`Installed ${kbData.installation_date}`);

    // Specifications: equipment.* fields that aren't redundant with the header.
    const specEntries: Array<[string, unknown]> = Object.entries(equipment).filter(
        ([k, v]) => v !== null && v !== undefined && v !== "" && k !== "cell_id",
    );

    const confidencePct =
        typeof kbData.confidence_score === "number"
            ? Math.round(kbData.confidence_score * 100)
            : null;

    // ---------- Threshold edit flow ----------

    function pathFor(key: string, field: ThresholdNumKey): string {
        return `thresholds.${key}.${field}`;
    }

    function startEdit(path: string, value: number | null | undefined): void {
        const original = typeof value === "number" ? value : 0;
        setEdits((prev) => ({
            ...prev,
            [path]: { value: String(original), original },
        }));
    }

    function cancelEdit(path: string): void {
        setEdits((prev) => {
            const next = { ...prev };
            delete next[path];
            return next;
        });
    }

    function changeEdit(path: string, raw: string): void {
        setEdits((prev) => {
            const cur = prev[path];
            if (!cur) return prev;
            return { ...prev, [path]: { ...cur, value: raw } };
        });
    }

    function commitEdit(path: string, key: string, field: ThresholdNumKey): void {
        const edit = edits[path];
        if (!edit) return;
        const parsed = Number.parseFloat(edit.value);
        if (!Number.isFinite(parsed) || parsed === edit.original) {
            cancelEdit(path);
            return;
        }

        // Rebuild full structured_data, changing only the target field.
        const currentThreshold = thresholds[key] ?? {};
        const nextThresholds: Record<string, ThresholdValue> = {
            ...thresholds,
            [key]: { ...currentThreshold, [field]: parsed },
        };
        const nextStructured: EquipmentKB = {
            ...structured,
            thresholds: nextThresholds,
        };

        mutation.mutate({
            cell_id: kbData.cell_id,
            structured_data: nextStructured,
            equipment_type: kbData.equipment_type ?? null,
            manufacturer: kbData.manufacturer ?? null,
            model: kbData.model ?? null,
            installation_date: kbData.installation_date ?? null,
            last_updated_by: "operator",
        });

        cancelEdit(path);
    }

    // ---------- Render ----------

    return (
        <section
            aria-label={`Equipment KB for ${displayName}`}
            className="w-full overflow-hidden rounded-lg border border-border bg-card"
        >
            {/* Header */}
            <div className="px-4 pt-3 pb-2">
                <div className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold text-foreground">{displayName}</span>
                    <span className="text-sm text-muted-foreground">· {equipmentType}</span>
                </div>
                {subParts.length > 0 && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                        {subParts.join(" · ")}
                    </div>
                )}
            </div>

            <div aria-hidden="true" className="h-px w-full bg-border" />

            {/* Thresholds */}
            <details open className="group/thresholds">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span>Thresholds ({thresholdKeys.length})</span>
                    <ChevronDown
                        className="size-4 text-muted-foreground transition-transform [details:not([open])_&]:-rotate-90"
                        aria-hidden="true"
                    />
                </summary>

                {thresholdKeys.length === 0 ? (
                    <div className="px-4 pb-3 text-xs text-text-tertiary">
                        No thresholds calibrated yet.
                    </div>
                ) : (
                    <div className="px-4 pb-3">
                        {thresholdKeys.map((key) => {
                            const t = thresholds[key] ?? {};
                            const presentFields = THRESHOLD_FIELDS.filter(
                                (f) => typeof t[f] === "number" && t[f] !== null,
                            );
                            return (
                                <div key={key} className="py-2">
                                    <div className="mb-1 text-xs text-muted-foreground">
                                        {humanizeThresholdKey(key)}
                                    </div>
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                        {presentFields.map((field) => {
                                            const path = pathFor(key, field);
                                            const value = t[field] as number;
                                            const editing = edits[path];
                                            const highlighted = highlightSet.has(path);

                                            return (
                                                <div
                                                    key={field}
                                                    className="flex items-baseline gap-1.5"
                                                >
                                                    <span className="text-xs text-text-tertiary">
                                                        {THRESHOLD_FIELD_LABELS[field]}
                                                    </span>
                                                    {editing ? (
                                                        <input
                                                            // biome-ignore lint/a11y/noAutofocus: intentional — user clicked to edit
                                                            autoFocus
                                                            type="number"
                                                            inputMode="decimal"
                                                            step="any"
                                                            aria-label={`${humanizeThresholdKey(key)} ${THRESHOLD_FIELD_LABELS[field]}`}
                                                            value={editing.value}
                                                            onChange={(e) =>
                                                                changeEdit(path, e.target.value)
                                                            }
                                                            onBlur={() =>
                                                                commitEdit(path, key, field)
                                                            }
                                                            onKeyDown={(e) => {
                                                                if (e.key === "Enter") {
                                                                    e.preventDefault();
                                                                    commitEdit(path, key, field);
                                                                } else if (e.key === "Escape") {
                                                                    e.preventDefault();
                                                                    cancelEdit(path);
                                                                }
                                                            }}
                                                            className="w-16 rounded-md border border-input bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground tabular-nums focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                                        />
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            data-highlight={
                                                                highlighted ? "true" : undefined
                                                            }
                                                            data-testid={`threshold-value-${path}`}
                                                            onClick={() => startEdit(path, value)}
                                                            className={`cursor-pointer rounded-md px-1.5 py-0.5 font-mono text-sm text-foreground tabular-nums transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${highlighted ? "ring-1 ring-primary" : ""}`}
                                                        >
                                                            {value}
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </details>

            <div aria-hidden="true" className="h-px w-full bg-border" />

            {/* Specifications */}
            <details className="group/specs">
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span>Specifications</span>
                    <ChevronDown
                        className="size-4 text-muted-foreground transition-transform [details:not([open])_&]:-rotate-90"
                        aria-hidden="true"
                    />
                </summary>

                {specEntries.length === 0 ? (
                    <div className="px-4 pb-3 text-xs text-text-tertiary">
                        No specifications recorded.
                    </div>
                ) : (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-4 pb-3">
                        {specEntries.map(([k, v]) => (
                            <div key={k} className="contents">
                                <dt className="text-xs text-muted-foreground">
                                    {SPEC_LABELS[k] ?? humanizeThresholdKey(k)}
                                </dt>
                                <dd className="text-xs text-foreground">{formatSpecValue(v)}</dd>
                            </div>
                        ))}
                    </dl>
                )}
            </details>

            <div aria-hidden="true" className="h-px w-full bg-border" />

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
                <span>
                    {confidencePct !== null ? `Confidence ${confidencePct}%` : "Confidence —"}
                    {" · "}
                    {kbData.last_updated_by ? kbData.last_updated_by : "KB Builder agent"}
                </span>
            </div>
        </section>
    );
}
