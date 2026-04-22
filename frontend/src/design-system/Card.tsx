import { forwardRef, type HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
    padding?: "none" | "sm" | "md" | "lg";
    elevated?: boolean;
}

const paddings = {
    none: "",
    sm: "p-3",
    md: "p-4",
    lg: "p-6",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ padding = "md", elevated = false, className = "", children, ...rest }, ref) => {
        const bg = elevated ? "bg-[var(--ds-bg-elevated)]" : "bg-[var(--ds-bg-surface)]";
        return (
            <div
                ref={ref}
                className={`${bg} border border-[var(--ds-border)] rounded-[var(--ds-radius-md)] ${paddings[padding]} ${className}`}
                {...rest}
            >
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
        <h3 className={`text-sm font-semibold text-[var(--ds-fg-primary)] ${className}`} {...rest}>
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
