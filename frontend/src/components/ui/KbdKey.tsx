import type { HTMLAttributes } from "react";

export function KbdKey({ className = "", children, ...rest }: HTMLAttributes<HTMLElement>) {
    return (
        <kbd
            className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-[10px] font-mono font-medium leading-none text-muted-foreground bg-muted border border-border rounded-md ${className}`}
            {...rest}
        >
            {children}
        </kbd>
    );
}
