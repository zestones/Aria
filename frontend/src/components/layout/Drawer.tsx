import {
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useId,
    useRef,
} from "react";
import { Hairline, Icons, SectionHeader } from "../ui";

export const DRAWER_MIN_WIDTH = 360;
export const DRAWER_MAX_WIDTH = 640;
export const DRAWER_DEFAULT_WIDTH = 420;
const KEYBOARD_STEP = 10;

export interface DrawerProps {
    open: boolean;
    width: number;
    onToggle: () => void;
    onWidthChange: (width: number) => void;
    children?: ReactNode;
    /** DOM id used by the topbar toggle `aria-controls`. */
    id?: string;
}

function clampWidth(width: number) {
    return Math.max(DRAWER_MIN_WIDTH, Math.min(DRAWER_MAX_WIDTH, Math.round(width)));
}

/**
 * Docked, resizable chat drawer. Sits inside the app-shell grid — not overlay.
 * The primitive `design-system/Drawer` remains for modal contexts.
 */
export function Drawer({ open, width, onToggle, onWidthChange, children, id }: DrawerProps) {
    const generatedId = useId();
    const drawerId = id ?? `chat-drawer-${generatedId}`;
    const asideRef = useRef<HTMLElement>(null);
    const draggingRef = useRef(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    const onPointerMove = useCallback(
        (e: PointerEvent) => {
            if (!draggingRef.current) return;
            const delta = startXRef.current - e.clientX;
            onWidthChange(clampWidth(startWidthRef.current + delta));
        },
        [onWidthChange],
    );

    const onPointerUp = useCallback(() => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
    }, [onPointerMove]);

    useEffect(
        () => () => {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
        },
        [onPointerMove, onPointerUp],
    );

    const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        draggingRef.current = true;
        startXRef.current = e.clientX;
        startWidthRef.current = width;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
    };

    const onHandleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
        let next: number | null = null;
        switch (e.key) {
            case "ArrowLeft":
                next = clampWidth(width + KEYBOARD_STEP);
                break;
            case "ArrowRight":
                next = clampWidth(width - KEYBOARD_STEP);
                break;
            case "Home":
                next = DRAWER_MIN_WIDTH;
                break;
            case "End":
                next = DRAWER_MAX_WIDTH;
                break;
            default:
                return;
        }
        e.preventDefault();
        onWidthChange(next);
    };

    return (
        <aside
            ref={asideRef}
            id={drawerId}
            aria-label="Chat drawer"
            className="relative h-full overflow-hidden border-l border-border bg-card"
            style={{
                width: open ? `${width}px` : 0,
                transition: `width var(--motion-base) var(--ease-out-soft)`,
            }}
        >
            {open && (
                // biome-ignore lint/a11y/useSemanticElements: separator must be interactive (draggable + keyboard resize) — <hr> cannot carry pointer/keyboard handlers
                <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-valuenow={width}
                    aria-valuemin={DRAWER_MIN_WIDTH}
                    aria-valuemax={DRAWER_MAX_WIDTH}
                    aria-label="Resize chat drawer"
                    tabIndex={0}
                    onPointerDown={onHandlePointerDown}
                    onKeyDown={onHandleKeyDown}
                    className="absolute left-0 top-0 z-10 h-full w-1.5 -translate-x-1/2 cursor-col-resize outline-none focus-visible:bg-primary/60 hover:bg-primary/40"
                    style={{ touchAction: "none" }}
                />
            )}
            {open && (
                <div className="flex h-full w-full flex-col" style={{ width: `${width}px` }}>
                    <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
                        <SectionHeader label="Chat" size="sm" />
                        <button
                            type="button"
                            onClick={onToggle}
                            aria-label="Collapse chat drawer"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <Icons.PanelRightClose className="size-4" />
                        </button>
                    </header>
                    {children ? (
                        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
                    ) : (
                        <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
                            <Hairline label="Awaiting wire" />
                            <p className="text-sm text-muted-foreground">
                                Chat shell mounts here in M6.5.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </aside>
    );
}
