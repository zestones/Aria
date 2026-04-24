import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "default" | "accent" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
}

const base =
    "inline-flex items-center justify-center gap-2 font-medium rounded-[var(--ds-radius-md)] transition-colors duration-[var(--ds-motion-fast)] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)]";

const variants: Record<Variant, string> = {
    default:
        "bg-[var(--ds-bg-elevated)] text-[var(--ds-fg-primary)] border border-[var(--ds-border)] hover:bg-[var(--ds-bg-hover)] hover:border-[var(--ds-border-strong)]",
    accent: "bg-[var(--ds-accent)] text-[var(--ds-accent-fg)] hover:bg-[var(--ds-accent-hover)]",
    ghost: "bg-transparent text-[var(--ds-fg-muted)] hover:text-[var(--ds-fg-primary)] hover:bg-[var(--ds-bg-hover)]",
    danger: "bg-[var(--ds-status-critical)] text-white hover:bg-[color-mix(in_oklab,var(--ds-status-critical),white_10%)]",
};

const sizes: Record<Size, string> = {
    sm: "h-7 px-3 text-[var(--ds-text-sm)]",
    md: "h-9 px-3.5 text-[var(--ds-text-sm)]",
    lg: "h-11 px-5 text-[var(--ds-text-md)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = "default", size = "md", className = "", ...rest }, ref) => {
        return (
            <button
                ref={ref}
                className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
                {...rest}
            />
        );
    },
);
Button.displayName = "Button";
