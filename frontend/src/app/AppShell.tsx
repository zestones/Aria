import { useCallback, useEffect, useId, useRef } from "react";
import { Outlet } from "react-router-dom";
import type { EquipmentSelection } from "../lib/hierarchy";
import { useLocalStorage } from "../lib/useLocalStorage";
import { ChatPanel } from "./chat/ChatPanel";
import { useChatStore } from "./chat/chatStore";
import { DRAWER_DEFAULT_WIDTH, DRAWER_MAX_WIDTH, DRAWER_MIN_WIDTH, Drawer } from "./Drawer";
import { TopBar } from "./TopBar";

interface ChatDrawerState {
    open: boolean;
    width: number;
}

const CHAT_DRAWER_KEY = "aria.chatDrawer";
const EQUIPMENT_KEY = "aria.selectedEquipment";

const DEFAULT_DRAWER_STATE: ChatDrawerState = {
    open: true,
    width: DRAWER_DEFAULT_WIDTH,
};

function sanitizeDrawer(state: ChatDrawerState): ChatDrawerState {
    return {
        open: Boolean(state.open),
        width: Math.max(
            DRAWER_MIN_WIDTH,
            Math.min(DRAWER_MAX_WIDTH, Math.round(state.width ?? DRAWER_DEFAULT_WIDTH)),
        ),
    };
}

function validateEquipmentSelection(raw: unknown): EquipmentSelection | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.cellId !== "number" || typeof r.lineId !== "number") return null;
    if (typeof r.cellName !== "string" || typeof r.lineName !== "string") return null;
    if (typeof r.areaName !== "string" || typeof r.siteName !== "string") return null;
    return raw as EquipmentSelection;
}

function isTypingTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    return false;
}

export function AppShell() {
    const [drawer, setDrawer] = useLocalStorage<ChatDrawerState>(
        CHAT_DRAWER_KEY,
        DEFAULT_DRAWER_STATE,
    );
    const [selection, setSelection] = useLocalStorage<EquipmentSelection | null>(
        EQUIPMENT_KEY,
        null,
        { validator: validateEquipmentSelection },
    );

    const safeDrawer = sanitizeDrawer(drawer);
    const drawerOpenRef = useRef(safeDrawer.open);
    drawerOpenRef.current = safeDrawer.open;
    const drawerId = useId();

    const toggleDrawer = useCallback(() => {
        setDrawer((prev) => ({ ...sanitizeDrawer(prev), open: !prev.open }));
    }, [setDrawer]);

    const setDrawerWidth = useCallback(
        (width: number) => {
            setDrawer((prev) => ({ ...sanitizeDrawer(prev), width }));
        },
        [setDrawer],
    );

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const isMac =
                typeof navigator !== "undefined" &&
                navigator.platform.toLowerCase().includes("mac");
            const comboPressed = (isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "k";
            if (!comboPressed) return;
            if (isTypingTarget(e.target)) return;
            e.preventDefault();
            if (drawerOpenRef.current) {
                useChatStore.getState().requestFocus();
            } else {
                toggleDrawer();
                window.setTimeout(() => {
                    useChatStore.getState().requestFocus();
                }, 240);
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [toggleDrawer]);

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--ds-bg-base)] text-[var(--ds-fg-primary)]">
            <TopBar
                selection={selection}
                onSelectionChange={setSelection}
                drawerOpen={safeDrawer.open}
                drawerControlsId={drawerId}
                onDrawerToggle={toggleDrawer}
            />
            <div
                className="grid min-h-0 flex-1"
                style={{
                    gridTemplateColumns: safeDrawer.open
                        ? `minmax(0, 1fr) ${safeDrawer.width}px`
                        : "minmax(0, 1fr) 0",
                    transition: `grid-template-columns var(--ds-motion-base) var(--ds-ease-out)`,
                }}
            >
                <main className="relative min-h-0 overflow-auto">
                    <Outlet />
                </main>
                <Drawer
                    id={drawerId}
                    open={safeDrawer.open}
                    width={safeDrawer.width}
                    onToggle={toggleDrawer}
                    onWidthChange={setDrawerWidth}
                >
                    <ChatPanel />
                </Drawer>
            </div>
        </div>
    );
}
