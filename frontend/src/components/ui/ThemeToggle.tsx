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
            className={`inline-flex items-center gap-0.5 rounded-lg border border-border bg-card p-0.5 ${className}`}
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
                        className={`h-7 rounded-md px-2.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            active
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
