import {
    type KeyboardEvent as ReactKeyboardEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useId,
    useRef,
} from "react";

export const DRAWER_MIN_WIDTH = 360;
export const DRAWER_MAX_WIDTH = 640;
export const DRAWER_DEFAULT_WIDTH = 420;
const KEYBOARD_STEP = 10;

export interface DrawerProps {
    open: boolean;
    width: number;
    onWidthChange: (width: number) => void;
    children?: ReactNode;
    /** DOM id used by the topbar toggle `aria-controls`. */
    id?: string;
}

function clampWidth(width: number) {
    return Math.max(DRAWER_MIN_WIDTH, Math.min(DRAWER_MAX_WIDTH, Math.round(width)));
}

/**
 * Docked, resizable chat drawer. The drawer is intentionally chrome-less —
 * it contributes only the resize handle and the left hairline. The `ChatPanel`
 * inside owns its own single header so we don't stack two title bars.
 */
export function Drawer({ open, width, onWidthChange, children, id }: DrawerProps) {
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
                    {children}
                </div>
            )}
        </aside>
    );
}
