import { type ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "default" | "accent" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
}

const base =
    "inline-flex items-center justify-center gap-2 font-medium rounded-ds-md transition-colors duration-ds-fast disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-ring";

const variants: Record<Variant, string> = {
    default:
        "bg-ds-bg-elevated text-ds-fg-primary border border-ds-border hover:bg-ds-bg-hover hover:border-ds-border-strong",
    accent: "bg-ds-accent text-ds-accent-fg hover:bg-ds-accent-hover",
    ghost: "bg-transparent text-ds-fg-muted hover:text-ds-fg-primary hover:bg-ds-bg-hover",
    danger: "bg-ds-critical text-white hover:bg-[color-mix(in_oklab,var(--ds-status-critical),white_10%)]",
};

const sizes: Record<Size, string> = {
    sm: "h-7 px-3 text-ds-sm",
    md: "h-9 px-3.5 text-ds-sm",
    lg: "h-11 px-5 text-ds-md",
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
