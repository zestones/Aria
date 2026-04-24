import {
    Children,
    isValidElement,
    type ReactNode,
    type SelectHTMLAttributes,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import { ChevronDown } from "./icons";

export type NativeSelectProps = SelectHTMLAttributes<HTMLSelectElement>;

interface OptionData {
    value: string;
    label: string;
    disabled?: boolean;
}

function parseOptions(children: ReactNode): OptionData[] {
    const opts: OptionData[] = [];
    Children.forEach(children, (child) => {
        if (!isValidElement(child) || child.type !== "option") return;
        const p = child.props as {
            value?: string | number;
            children?: ReactNode;
            disabled?: boolean;
        };
        opts.push({
            value: String(p.value ?? ""),
            label: typeof p.children === "string" ? p.children : String(p.children ?? ""),
            disabled: p.disabled,
        });
    });
    return opts;
}

/**
 * Fully custom dropdown — same API as a native `<select>` element.
 * Renders a design-system-styled trigger + listbox so the open
 * dropdown matches the app's colour palette instead of the OS chrome.
 */
export function NativeSelect({
    id,
    className = "",
    value,
    onChange,
    disabled,
    children,
}: NativeSelectProps) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);
    const listId = useId();

    const options = parseOptions(children);
    const current = options.find((o) => o.value === String(value ?? ""));

    // Close on outside click / Escape
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const commit = (val: string) => {
        onChange?.({ target: { value: val } } as React.ChangeEvent<HTMLSelectElement>);
        setOpen(false);
    };

    return (
        <div ref={wrapRef} className="relative">
            <button
                id={id}
                type="button"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={open ? listId : undefined}
                onClick={() => !disabled && setOpen((v) => !v)}
                className={`flex items-center justify-between gap-2 ${className} disabled:cursor-not-allowed disabled:opacity-60`}
            >
                <span className={current ? "text-foreground" : "text-muted-foreground"}>
                    {current?.label ?? "Select…"}
                </span>
                <ChevronDown
                    className={`size-3.5 flex-none text-muted-foreground transition-transform duration-150 ${open ? "rotate-180" : ""}`}
                    aria-hidden
                />
            </button>

            {open && (
                <ul
                    id={listId}
                    className="absolute top-full left-0 z-50 mt-1 min-w-full overflow-hidden rounded-lg border border-border bg-card shadow-(--shadow-overlay)"
                >
                    {options.map((opt) => (
                        <li
                            key={opt.value}
                            aria-disabled={opt.disabled}
                            onMouseDown={(e) => {
                                e.preventDefault(); // keep focus on trigger
                                if (!opt.disabled) commit(opt.value);
                            }}
                            className={[
                                "cursor-pointer select-none px-3 py-1.5 text-sm transition-colors duration-100",
                                opt.value === String(value ?? "")
                                    ? "bg-accent font-medium text-foreground"
                                    : "text-foreground hover:bg-accent",
                                opt.disabled ? "pointer-events-none opacity-40" : "",
                            ].join(" ")}
                        >
                            {opt.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
