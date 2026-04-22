import { type ThemeMode, useTheme } from "./ThemeProvider";

const options: { value: ThemeMode; label: string }[] = [
    { value: "system", label: "System" },
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
];

export interface ThemeToggleProps {
    className?: string;
}

/**
 * Segmented control — System / Dark / Light.
 * Meant for the user menu in the topbar (DESIGN_PLAN_v2 §8.1).
 */
export function ThemeToggle({ className = "" }: ThemeToggleProps) {
    const { mode, setMode } = useTheme();

    return (
        <div
            className={`inline-flex items-center gap-0.5 rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-surface)] p-0.5 ${className}`}
        >
            {options.map((opt) => {
                const active = mode === opt.value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        aria-label={`Use ${opt.label.toLowerCase()} theme`}
                        onClick={() => setMode(opt.value)}
                        className={`h-7 rounded-[var(--ds-radius-sm)] px-2.5 text-[var(--ds-text-sm)] font-medium transition-colors duration-[var(--ds-motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)] ${
                            active
                                ? "bg-[var(--ds-bg-elevated)] text-[var(--ds-fg-primary)]"
                                : "text-[var(--ds-fg-muted)] hover:text-[var(--ds-fg-primary)]"
                        }`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
