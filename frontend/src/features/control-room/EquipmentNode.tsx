import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Card } from "../../design-system";

/**
 * Node live status. M7.1 refactor (#40) hardcodes every node to `nominal` —
 * live wiring lands in M7.1b. See DESIGN_PLAN_v2 §2.3 for color semantics.
 */
export type EquipmentStatus = "nominal" | "warning" | "critical" | "unknown";

/**
 * Legacy equipment kind. Kept as a type alias only to preserve the public
 * barrel export — M7.1 refactor (#40) dropped every shape-per-kind assumption
 * to make the grid adaptive to any equipment (pump, QR-scanner, CNC, …).
 *
 * @deprecated No longer consumed — will be removed once the inspector is
 *             refactored to drop its `kind` field in M7.1b.
 */
export type EquipmentKind = string;

export interface EquipmentNodeProps {
    /** Stable identifier — used as selection key. */
    id: string;
    /** Primary label (sentence case), shown centered. */
    label: string;
    /** Optional sub-label (e.g. line name, breadcrumb). `text-xs fg-muted`. */
    sublabel?: string;
    /** Live status — drives the left rail tone. */
    status: EquipmentStatus;
    selected?: boolean;
    onClick?: () => void;
}

/**
 * Generic, equipment-agnostic card used in the control-room grid. One uniform
 * rectangle for every cell — the only visual differentiator is the left
 * status rail (§5 DESIGN_PLAN). No SVG, no shapes, no "pump vs tank" logic.
 *
 * Click or keyboard (Enter/Space) activates `onClick`. Selection is conveyed
 * by a discreet ring, never a glow.
 */
export function EquipmentNode({
    id,
    label,
    sublabel,
    status,
    selected = false,
    onClick,
}: EquipmentNodeProps) {
    const interactive = typeof onClick === "function";

    const handleKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        if (!interactive) return;
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
        }
    };

    const ringClass = selected
        ? "ring-1 ring-[var(--ds-accent)]"
        : "hover:ring-1 hover:ring-[var(--ds-border-strong)]";
    const cursorClass = interactive ? "cursor-pointer" : "";

    return (
        <Card
            data-testid={`equipment-node-${id}`}
            data-status={status}
            data-selected={selected ? "true" : "false"}
            elevated
            rail={status}
            padding="md"
            className={`flex min-h-[88px] flex-col justify-center gap-1 transition-[box-shadow,border-color] duration-[var(--ds-motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)] ${ringClass} ${cursorClass}`}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-pressed={interactive ? selected : undefined}
            aria-label={interactive ? `${label} — ${status}` : undefined}
            onClick={interactive ? onClick : undefined}
            onKeyDown={handleKey}
        >
            <span
                className="truncate text-[var(--ds-text-sm)] font-semibold text-[var(--ds-fg-primary)]"
                style={{ fontFamily: "var(--ds-font-sans)" }}
            >
                {label}
            </span>
            {sublabel && (
                <span
                    className="truncate text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]"
                    style={{ fontFamily: "var(--ds-font-sans)" }}
                >
                    {sublabel}
                </span>
            )}
        </Card>
    );
}
