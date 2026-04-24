import type { ComponentType } from "react";
import { AlertBanner } from "./placeholders/AlertBanner";
import { BarChart } from "./placeholders/BarChart";
import { DiagnosticCard } from "./placeholders/DiagnosticCard";
import { EquipmentKbCard } from "./placeholders/EquipmentKbCard";
import { KbProgress } from "./placeholders/KbProgress";
import { PatternMatch } from "./placeholders/PatternMatch";
import { SignalChart } from "./placeholders/SignalChart";
import { WorkOrderCard } from "./placeholders/WorkOrderCard";
import type { ArtifactComponentName } from "./schemas";

/**
 * Component type used by the registry — each entry validates its own props
 * against a Zod schema before being mounted, so the registry erases the
 * per-artifact shape. `ArtifactRenderer` hands the parsed data through.
 */
// biome-ignore lint/suspicious/noExplicitAny: registry entries are narrowed by the matching Zod schema in schemas.ts
export type ArtifactComponent = ComponentType<any>;

/**
 * Single lookup table from backend `ui_render` component name → React FC.
 *
 * Component keys match the backend tool name **without** the `render_` prefix
 * (the orchestrator strips it — see `backend/agents/ui_tools.py:50`).
 *
 * Adding a new artifact: add a Zod schema in `schemas.ts`, add a placeholder
 * under `placeholders/`, wire both through here. One entry per type — no
 * dynamic imports, no auto-registration.
 */
export const registry: Record<ArtifactComponentName, ArtifactComponent> = {
    signal_chart: SignalChart,
    equipment_kb_card: EquipmentKbCard,
    work_order_card: WorkOrderCard,
    diagnostic_card: DiagnosticCard,
    pattern_match: PatternMatch,
    bar_chart: BarChart,
    kb_progress: KbProgress,
    alert_banner: AlertBanner,
};

export function getArtifactComponent(name: string): ArtifactComponent | undefined {
    return (registry as Record<string, ArtifactComponent>)[name];
}
