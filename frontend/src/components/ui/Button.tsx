import { type ButtonHTMLAttributes, forwardRef } from "react";

/**
 * Primary control surface — editorial pill (ink-on-cream).
 *
 * Variants
 *   default     — Ink-black background, cream text. Workhorse CTA.
 *   secondary   — Lifted cream surface, ink text, hairline ink border.
 *   ghost       — Transparent until hover. Inline icon buttons / tab-style.
 *   destructive — Signal-orange pill for destructive actions.
 *   consent     — Signal-orange full pill (cookie banners / "I agree" only).
 */
type Variant = "default" | "secondary" | "ghost" | "destructive" | "consent";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
}

const base =
    "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 ease-out " +
    "disabled:opacity-50 disabled:cursor-not-allowed " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-background active:scale-[0.98] tracking-[-0.32px]";

const variants: Record<Variant, string> = {
    default:
        "bg-primary text-primary-foreground border-[1.5px] border-primary " +
        "hover:bg-primary-hover shadow-pill rounded-cta",
    secondary:
        "bg-card text-foreground border-[1.5px] border-foreground hover:bg-accent rounded-cta",
    ghost: "bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent rounded-cta",
    destructive:
        "bg-destructive text-destructive-foreground border-[1.5px] border-destructive " +
        "hover:opacity-90 shadow-pill rounded-cta",
    consent:
        "bg-destructive text-destructive-foreground border-[1.5px] border-destructive " +
        "hover:opacity-95 shadow-pill rounded-full",
};

const sizes: Record<Size, string> = {
    sm: "h-7 px-3 text-xs",
    md: "h-9 px-6 py-1.5 text-sm",
    lg: "h-11 px-8 text-base",
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
