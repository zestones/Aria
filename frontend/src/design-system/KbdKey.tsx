import type { HTMLAttributes } from "react";

export function KbdKey({ className = "", children, ...rest }: HTMLAttributes<HTMLElement>) {
    return (
        <kbd
            className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-mono font-medium leading-none text-[var(--ds-fg-muted)] bg-[var(--ds-bg-elevated)] border border-[var(--ds-border)] rounded-[var(--ds-radius-xs)] ${className}`}
            {...rest}
        >
            {children}
        </kbd>
    );
}
