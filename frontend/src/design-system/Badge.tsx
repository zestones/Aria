import type { HTMLAttributes } from "react";

export type AgentId = "sentinel" | "investigator" | "kb_builder" | "work_order" | "qa";

type Variant = "default" | "accent" | "nominal" | "warning" | "critical" | "agent";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
    variant?: Variant;
    agent?: AgentId;
    size?: "sm" | "md";
    /**
     * Status-tag look: uppercased text + mono + letter-spacing (SCADA feel).
     * Default false for long-form labels like "Generating work order".
     */
    tag?: boolean;
}

const agentColorVar: Record<AgentId, string> = {
    sentinel: "--ds-agent-sentinel",
    investigator: "--ds-agent-investigator",
    kb_builder: "--ds-agent-kb-builder",
    work_order: "--ds-agent-work-order",
    qa: "--ds-agent-qa",
};

const baseVariants: Record<Exclude<Variant, "agent">, string> = {
    default: "bg-[var(--ds-bg-elevated)] text-[var(--ds-fg-muted)] border-[var(--ds-border)]",
    accent: "bg-[color-mix(in_oklab,var(--ds-accent),transparent_82%)] text-[var(--ds-accent)] border-[color-mix(in_oklab,var(--ds-accent),transparent_60%)]",
    nominal:
        "bg-[color-mix(in_oklab,var(--ds-status-nominal),transparent_82%)] text-[var(--ds-status-nominal)] border-[color-mix(in_oklab,var(--ds-status-nominal),transparent_60%)]",
    warning:
        "bg-[color-mix(in_oklab,var(--ds-status-warning),transparent_82%)] text-[var(--ds-status-warning)] border-[color-mix(in_oklab,var(--ds-status-warning),transparent_60%)]",
    critical:
        "bg-[color-mix(in_oklab,var(--ds-status-critical),transparent_82%)] text-[var(--ds-status-critical)] border-[color-mix(in_oklab,var(--ds-status-critical),transparent_60%)]",
};

export function Badge({
    variant = "default",
    agent,
    size = "sm",
    tag = false,
    className = "",
    style,
    children,
    ...rest
}: BadgeProps) {
    const sizing = size === "md" ? "h-6 px-2 text-xs" : "h-5 px-1.5 text-[11px]";
    const typography = tag ? "font-mono uppercase tracking-[0.08em]" : "font-medium";

    if (variant === "agent" && agent) {
        const cssVar = agentColorVar[agent];
        const agentStyle = {
            ...style,
            backgroundColor: `color-mix(in oklab, var(${cssVar}), transparent 82%)`,
            color: `var(${cssVar})`,
            borderColor: `color-mix(in oklab, var(${cssVar}), transparent 60%)`,
        };
        return (
            <span
                style={agentStyle}
                className={`inline-flex items-center gap-1 ${sizing} rounded-[var(--ds-radius-xs)] border ${typography} whitespace-nowrap ${className}`}
                {...rest}
            >
                {children}
            </span>
        );
    }

    const v = variant === "agent" ? "default" : variant;
    return (
        <span
            className={`inline-flex items-center gap-1 ${sizing} rounded-[var(--ds-radius-xs)] border ${typography} whitespace-nowrap ${baseVariants[v]} ${className}`}
            style={style}
            {...rest}
        >
            {children}
        </span>
    );
}
