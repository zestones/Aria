import type { HTMLAttributes } from "react";

export function KbdKey({ className = "", children, ...rest }: HTMLAttributes<HTMLElement>) {
    return (
        <kbd
            className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-mono font-medium leading-none text-ds-fg-muted bg-ds-bg-elevated border border-ds-border rounded-ds-sm ${className}`}
            {...rest}
        >
            {children}
        </kbd>
    );
}
