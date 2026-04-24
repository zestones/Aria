import type { HTMLAttributes } from "react";

export type AgentId = "sentinel" | "investigator" | "kb_builder" | "work_order" | "qa";

type Variant = "default" | "accent" | "nominal" | "warning" | "critical" | "agent" | "code";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: Variant;
    /** Required when `variant="agent"`. */
    agent?: AgentId;
    size?: "sm" | "md";
}

const agentColorVar: Record<AgentId, string> = {
    sentinel: "--ds-agent-sentinel",
    investigator: "--ds-agent-investigator",
    kb_builder: "--ds-agent-kb-builder",
    work_order: "--ds-agent-work-order",
    qa: "--ds-agent-qa",
};

const baseVariants: Record<Exclude<Variant, "agent" | "code">, string> = {
    default: "bg-ds-bg-elevated text-ds-fg-muted border-ds-border",
    accent: "bg-ds-accent-soft text-ds-accent border-[color-mix(in_oklab,var(--ds-accent),transparent_70%)]",
    nominal:
        "bg-[color-mix(in_oklab,var(--ds-status-nominal),transparent_85%)] text-ds-nominal border-[color-mix(in_oklab,var(--ds-status-nominal),transparent_70%)]",
    warning:
        "bg-[color-mix(in_oklab,var(--ds-status-warning),transparent_85%)] text-ds-warning border-[color-mix(in_oklab,var(--ds-status-warning),transparent_70%)]",
    critical:
        "bg-[color-mix(in_oklab,var(--ds-status-critical),transparent_85%)] text-ds-critical border-[color-mix(in_oklab,var(--ds-status-critical),transparent_70%)]",
};

/**
 * Badge — default sentence-case sans. `variant="code"` is for rare literal
 * flavors (version strings, SHAs) — mono, no uppercase.
 * See DESIGN_PLAN_v2 §10.2.
 */
export function Badge({
    variant = "default",
    agent,
    size = "sm",
    className = "",
    style,
    children,
    ...rest
}: BadgeProps) {
    const sizing = size === "md" ? "h-6 px-2 text-ds-xs" : "h-5 px-1.5 text-[11px]";
    const typography = variant === "code" ? "font-mono" : "font-medium";

    if (variant === "agent" && agent) {
        const cssVar = agentColorVar[agent];
        const agentStyle = {
            ...style,
            backgroundColor: `color-mix(in oklab, var(${cssVar}), transparent 85%)`,
            color: `var(${cssVar})`,
            borderColor: `color-mix(in oklab, var(${cssVar}), transparent 70%)`,
        };
        return (
            <span
                style={agentStyle}
                className={`inline-flex items-center gap-1 ${sizing} rounded-ds-sm border ${typography} whitespace-nowrap ${className}`}
                {...rest}
            >
                {children}
            </span>
        );
    }

    const v: Exclude<Variant, "agent"> = variant === "agent" ? "default" : variant;
    const variantClass = v === "code" ? baseVariants.default : baseVariants[v];
    return (
        <span
            className={`inline-flex items-center gap-1 ${sizing} rounded-ds-sm border ${typography} whitespace-nowrap ${variantClass} ${className}`}
            style={style}
            {...rest}
        >
            {children}
        </span>
    );
}
