import type { HTMLAttributes } from "react";

export type Status = "nominal" | "warning" | "critical" | "unknown";

const colors: Record<Status, string> = {
    nominal: "var(--ds-status-nominal)",
    warning: "var(--ds-status-warning)",
    critical: "var(--ds-status-critical)",
    unknown: "var(--ds-fg-subtle)",
};

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
    status: Status;
    size?: number;
    pulse?: boolean;
}

export function StatusDot({
    status,
    size = 8,
    pulse = false,
    className = "",
    style,
    ...rest
}: StatusDotProps) {
    const color = colors[status];
    return (
        <span
            className={`inline-block relative align-middle ${className}`}
            style={{
                width: size,
                height: size,
                ...style,
            }}
            role="status"
            aria-label={`status: ${status}`}
            {...rest}
        >
            <span className="absolute inset-0 rounded-full" style={{ backgroundColor: color }} />
            {pulse && (
                <span
                    className="absolute inset-0 rounded-full motion-reduce:hidden"
                    style={{
                        backgroundColor: color,
                        animation: "ds-status-pulse 1.6s ease-out infinite",
                    }}
                />
            )}
            <style>{`
        @keyframes ds-status-pulse {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.4); opacity: 0; }
        }
      `}</style>
        </span>
    );
}
