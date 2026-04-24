import { z } from "zod";

/**
 * Zod schemas for every `ui_render` component name emitted by the backend.
 *
 * Mirrors `backend/agents/ui_tools.py` — keep both in sync when the contract
 * evolves. Component names are the backend `tool_name` without the `render_`
 * prefix (stripped in the orchestrator — see `ui_tools.py` lines 46-53).
 *
 * `passthrough()` on every schema so future backend fields don't break the
 * frontend before the matching placeholder update lands.
 */

export const SignalChartPropsSchema = z
    .object({
        cell_id: z.number().int(),
        signal_def_id: z.number().int(),
        window_hours: z.number().optional(),
        mark_anomaly_at: z.string().optional(),
        threshold: z.number().optional(),
        /**
         * Optional server-computed hours until the signal is forecast to
         * cross its threshold at the current drift rate. When present, the
         * chart's ETA caption uses this value verbatim instead of the
         * local linear extrapolation. Mirrors the field declared in
         * `backend/agents/ui_tools.py::RENDER_SIGNAL_CHART`.
         */
        predicted_breach_hours: z.number().nonnegative().optional(),
        /**
         * Optional server-computed trend direction of the recent tail.
         * Direction-only vocabulary (`rising` / `falling` / `flat` /
         * `unknown`) matches both the backend `render_signal_chart` schema
         * and the `forecast_warning` event on the events bus. When present,
         * the chart's trend caption uses this value instead of its local
         * slope estimate.
         */
        trend: z.enum(["rising", "falling", "flat", "unknown"]).optional(),
    })
    .passthrough();

export const EquipmentKbCardPropsSchema = z
    .object({
        cell_id: z.number().int(),
        highlight_fields: z.array(z.string()).optional(),
    })
    .passthrough();

export const WorkOrderCardPropsSchema = z
    .object({
        cell_id: z.number().int(),
        work_order_id: z.number().int(),
        printable: z.boolean().optional(),
    })
    .passthrough();

export const DiagnosticCardPropsSchema = z
    .object({
        cell_id: z.number().int(),
        title: z.string(),
        confidence: z.number().min(0).max(1),
        root_cause: z.string(),
        contributing_factors: z.array(z.string()).min(1),
        pattern_match_id: z.number().int().optional(),
    })
    .passthrough();

export const PatternMatchPropsSchema = z
    .object({
        cell_id: z.number().int(),
        current_event: z.string(),
        past_event_ref: z.string(),
        similarity: z.number().min(0).max(1),
        /**
         * Optional predicted mean-time-to-failure in hours, derived from the
         * matched past incident's time-to-failure. When present, the card
         * reframes from "we recognise this pattern" to "we predict failure in
         * ~X hours / days".
         */
        predicted_mttf_hours: z.number().nonnegative().optional(),
        /** Optional one-line recommended action the operator can take now. */
        recommended_action: z.string().optional(),
        /** Optional ISO date of the past incident, rendered inline in the UI. */
        past_event_date: z.string().optional(),
    })
    .passthrough();

export const BarChartPropsSchema = z
    .object({
        title: z.string(),
        x_label: z.string(),
        y_label: z.string(),
        bars: z
            .array(
                z.object({
                    label: z.string(),
                    value: z.number(),
                }),
            )
            .min(1),
        cell_id: z.number().int().optional(),
    })
    .passthrough();

export const KbProgressPropsSchema = z
    .object({
        cell_id: z.number().int(),
        steps: z
            .array(
                z.object({
                    label: z.string(),
                    status: z.enum(["pending", "in_progress", "done", "skipped"]),
                }),
            )
            .min(1),
    })
    .passthrough();

export const AlertBannerPropsSchema = z
    .object({
        cell_id: z.number().int(),
        severity: z.enum(["info", "alert", "trip"]),
        message: z.string(),
        anomaly_id: z.number().int().optional(),
        signal_def_id: z.number().int().optional(),
    })
    .passthrough();

/**
 * Shape emitted by `render_sandbox_execution` (M5.7 / #105). The Managed
 * Investigator calls this after running a Python analysis in the
 * Anthropic cloud sandbox and before `submit_rca`, so the judge can see
 * the script, the numerical output, and a "ran in Anthropic sandbox"
 * chip — the visual proof that the math ran as real Python rather than
 * in tokens.
 */
export const SandboxExecutionPropsSchema = z
    .object({
        cell_id: z.number().int(),
        technique: z.enum(["regression", "correlation", "fft", "cusum", "other"]),
        /** Verbatim Python the agent ran, without the outer bash/curl wrapper. */
        script: z.string(),
        /** Verbatim `key=value` lines the script printed — one per line. */
        output: z.string(),
        /** Which signal CSVs the agent pulled from the sandbox endpoint. */
        signal_def_ids: z.array(z.number().int()).optional(),
        /** Time window the script analysed, in hours. */
        window_hours: z.number().nonnegative().optional(),
    })
    .passthrough();

export type SignalChartProps = z.infer<typeof SignalChartPropsSchema>;
export type EquipmentKbCardProps = z.infer<typeof EquipmentKbCardPropsSchema>;
export type WorkOrderCardProps = z.infer<typeof WorkOrderCardPropsSchema>;
export type DiagnosticCardProps = z.infer<typeof DiagnosticCardPropsSchema>;
export type PatternMatchProps = z.infer<typeof PatternMatchPropsSchema>;
export type BarChartProps = z.infer<typeof BarChartPropsSchema>;
export type KbProgressProps = z.infer<typeof KbProgressPropsSchema>;
export type AlertBannerProps = z.infer<typeof AlertBannerPropsSchema>;
export type SandboxExecutionProps = z.infer<typeof SandboxExecutionPropsSchema>;

export const schemas = {
    signal_chart: SignalChartPropsSchema,
    equipment_kb_card: EquipmentKbCardPropsSchema,
    work_order_card: WorkOrderCardPropsSchema,
    diagnostic_card: DiagnosticCardPropsSchema,
    pattern_match: PatternMatchPropsSchema,
    bar_chart: BarChartPropsSchema,
    kb_progress: KbProgressPropsSchema,
    alert_banner: AlertBannerPropsSchema,
    sandbox_execution: SandboxExecutionPropsSchema,
} as const;

export type ArtifactComponentName = keyof typeof schemas;
