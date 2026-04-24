import { type ThemeMode, useTheme } from "../../providers/theme.provider";

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
            className={`inline-flex items-center gap-0.5 rounded-ds-md border border-ds-border bg-ds-bg-surface p-0.5 ${className}`}
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
                        className={`h-7 rounded-ds-sm px-2.5 text-ds-sm font-medium transition-colors duration-ds-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-ring ${
                            active
                                ? "bg-ds-bg-elevated text-ds-fg-primary"
                                : "text-ds-fg-muted hover:text-ds-fg-primary"
                        }`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
