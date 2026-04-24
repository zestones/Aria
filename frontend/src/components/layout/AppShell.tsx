import { useCallback, useEffect, useId, useRef } from "react";
import { Outlet } from "react-router-dom";
import { AgentInspector, useAgentInspectorStore } from "../../features/agents";
import { useAgentTurnsIngest } from "../../features/agents/useAgentTurnsIngest";
import { ChatPanel, useChatStore } from "../../features/chat";
import {
    AnomalyBanner,
    EQUIPMENT_KEY,
    KpiBar,
    validateEquipmentSelection,
} from "../../features/control-room";
import { DemoReplayButton } from "../../features/demo";
import type { EquipmentSelection } from "../../lib/hierarchy";
import { useLocalStorage } from "../../lib/useLocalStorage";
import { DRAWER_DEFAULT_WIDTH, DRAWER_MAX_WIDTH, DRAWER_MIN_WIDTH, Drawer } from "./Drawer";
import { SIDEBAR_WIDTH_COLLAPSED, SIDEBAR_WIDTH_EXPANDED, Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface ChatDrawerState {
    open: boolean;
    width: number;
}

const CHAT_DRAWER_KEY = "aria.chatDrawer";
const SIDEBAR_KEY = "aria.sidebar";
const INSPECTOR_HEIGHT = "40vh";

interface SidebarState {
    collapsed: boolean;
}

const DEFAULT_SIDEBAR_STATE: SidebarState = { collapsed: false };

function sanitizeSidebar(state: SidebarState | null | undefined): SidebarState {
    return { collapsed: Boolean(state?.collapsed) };
}

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

function isTypingTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    return false;
}

export function AppShell() {
    // Singleton bus consumer — keeps the agent turn buffer alive regardless
    // of the Inspector's open/close state.
    useAgentTurnsIngest();

    const [drawer, setDrawer] = useLocalStorage<ChatDrawerState>(
        CHAT_DRAWER_KEY,
        DEFAULT_DRAWER_STATE,
    );
    const [sidebar, setSidebar] = useLocalStorage<SidebarState>(SIDEBAR_KEY, DEFAULT_SIDEBAR_STATE);
    const [selection, setSelection] = useLocalStorage<EquipmentSelection | null>(
        EQUIPMENT_KEY,
        null,
        { validator: validateEquipmentSelection },
    );
    const inspectorAgent = useAgentInspectorStore((s) => s.agent);

    const safeDrawer = sanitizeDrawer(drawer);
    const safeSidebar = sanitizeSidebar(sidebar);
    const drawerOpenRef = useRef(safeDrawer.open);
    drawerOpenRef.current = safeDrawer.open;
    const drawerId = useId();

    const toggleDrawer = useCallback(() => {
        setDrawer((prev) => ({ ...sanitizeDrawer(prev), open: !prev.open }));
    }, [setDrawer]);

    const toggleSidebar = useCallback(() => {
        setSidebar((prev) => ({ collapsed: !sanitizeSidebar(prev).collapsed }));
    }, [setSidebar]);

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
            const modPressed = isMac ? e.metaKey : e.ctrlKey;
            if (!modPressed) return;
            const key = e.key.toLowerCase();
            if (isTypingTarget(e.target)) return;

            if (key === "k") {
                e.preventDefault();
                if (drawerOpenRef.current) {
                    useChatStore.getState().requestFocus();
                } else {
                    toggleDrawer();
                    window.setTimeout(() => {
                        useChatStore.getState().requestFocus();
                    }, 240);
                }
                return;
            }

            if (key === "b") {
                e.preventDefault();
                toggleSidebar();
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [toggleDrawer, toggleSidebar]);

    const sidebarWidth = safeSidebar.collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-[var(--ds-bg-base)] text-[var(--ds-fg-primary)]">
            <Sidebar collapsed={safeSidebar.collapsed} onToggle={toggleSidebar} />
            <div
                className="flex min-w-0 flex-1 flex-col"
                style={{
                    width: `calc(100% - ${sidebarWidth}px)`,
                }}
            >
                <TopBar
                    selection={selection}
                    onSelectionChange={setSelection}
                    drawerOpen={safeDrawer.open}
                    drawerControlsId={drawerId}
                    onDrawerToggle={toggleDrawer}
                    kpiSlot={<KpiBar selection={selection} />}
                />
                <AnomalyBanner />
                <div
                    className="grid min-h-0 flex-1"
                    style={{
                        gridTemplateColumns: safeDrawer.open
                            ? `minmax(0, 1fr) ${safeDrawer.width}px`
                            : "minmax(0, 1fr) 0",
                        transition: `grid-template-columns var(--ds-motion-base) var(--ds-ease-out)`,
                    }}
                >
                    <main className="relative flex min-h-0 flex-col overflow-hidden">
                        <div
                            className="min-h-0 flex-1 overflow-auto"
                            style={{
                                paddingBottom: inspectorAgent ? INSPECTOR_HEIGHT : undefined,
                                transition:
                                    "padding-bottom var(--ds-motion-base) var(--ds-ease-out)",
                            }}
                        >
                            <Outlet />
                        </div>
                        <AgentInspector />
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
            {import.meta.env.DEV && <DemoReplayButton />}
        </div>
    );
}
