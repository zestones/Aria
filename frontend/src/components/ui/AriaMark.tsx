import type { SVGAttributes } from "react";

/**
 * ARIA brand mark — minimal triangle "A" bisected by a telemetry pulse.
 * Default color is `fg-primary` per DESIGN_PLAN_v2 §5.6. Callers opt in to
 * accent tone by passing `className="text-primary"` (rare).
 */
export function AriaMark({
    className = "text-foreground",
    size = 20,
    ...rest
}: SVGAttributes<SVGSVGElement> & { size?: number }) {
    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden="true"
            {...rest}
        >
            <title>ARIA</title>
            <path d="M12 3.5 L20.5 20.5 L3.5 20.5 Z" />
            <path d="M6.5 14.5 L9.5 14.5 L10.75 11.5 L12.25 17 L13.5 14.5 L17.5 14.5" />
        </svg>
    );
}
