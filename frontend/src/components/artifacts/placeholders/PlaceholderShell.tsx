import type { ReactNode } from "react";
import { Badge, Card } from "../../ui";

/**
 * Shared scaffold for every M7.5 artifact placeholder.
 *
 * Placeholders are intentionally thin — they only prove the dispatcher path
 * works end-to-end. Each real component lands in its M8.x milestone.
 *
 * Design discipline (DESIGN_PLAN_v2):
 * - Tokens only (no hex, no gradients).
 * - Sentence case label + mono detail (no mono-caps, no bracketed headers).
 * - `variant="code"` badge is our mono-flavored Badge — see Badge.tsx.
 */
export interface PlaceholderShellProps {
    label: string;
    detail?: ReactNode;
    children?: ReactNode;
}

export function PlaceholderShell({ label, detail, children }: PlaceholderShellProps) {
    return (
        <Card padding="sm" elevated>
            <div className="flex flex-wrap items-center gap-2">
                <Badge variant="accent" size="sm">
                    {label}
                </Badge>
                {detail && <span className="font-mono text-ds-xs text-ds-fg-muted">{detail}</span>}
            </div>
            {children && (
                <div className="mt-2 font-mono text-ds-xs leading-[1.55] text-ds-fg-subtle break-words">
                    {children}
                </div>
            )}
        </Card>
    );
}

/** Compact JSON dump used by most placeholders to visualise inbound props. */
export function dumpJson(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}
