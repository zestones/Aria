import { forwardRef, type HTMLAttributes } from "react";
import { type RailTone, StatusRail } from "./StatusRail";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    padding?: "none" | "sm" | "md" | "lg";
    elevated?: boolean;
    /**
     * Left-edge 2px status rail conveying the card's live state.
     * See DESIGN_PLAN §5.4.
     */
    rail?: RailTone;
    /** Pulse the rail when warning/critical (defaults true for those tones). */
    railPulse?: boolean;
}

const paddings = {
    none: "",
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
    (
        { padding = "md", elevated = false, rail, railPulse, className = "", children, ...rest },
        ref,
    ) => {
        const bg = elevated ? "bg-[var(--ds-bg-elevated)]" : "bg-[var(--ds-bg-surface)]";
        const hasRail = rail !== undefined;
        const pulse = railPulse ?? (rail === "critical" || rail === "warning");
        const railPadding = hasRail ? "pl-[calc(var(--ds-space-rail,14px))]" : "";
        return (
            <div
                ref={ref}
                className={`relative ${bg} border border-[var(--ds-border)] rounded-[var(--ds-radius-md)] ${paddings[padding]} ${railPadding} ${className}`}
                {...rest}
            >
                {hasRail && <StatusRail tone={rail} pulse={pulse} />}
                {children}
            </div>
        );
    },
);
Card.displayName = "Card";

export function CardHeader({ className = "", children, ...rest }: HTMLAttributes<HTMLDivElement>) {
    return (
        <div className={`mb-3 ${className}`} {...rest}>
            {children}
        </div>
    );
}

export function CardTitle({
    className = "",
    children,
    ...rest
}: HTMLAttributes<HTMLHeadingElement>) {
    return (
        <h3
            className={`text-[16px] font-semibold leading-tight tracking-[-0.01em] text-[var(--ds-fg-primary)] ${className}`}
            {...rest}
        >
            {children}
        </h3>
    );
}

export function CardDescription({
    className = "",
    children,
    ...rest
}: HTMLAttributes<HTMLParagraphElement>) {
    return (
        <p className={`text-xs text-[var(--ds-fg-muted)] mt-0.5 ${className}`} {...rest}>
            {children}
        </p>
    );
}
