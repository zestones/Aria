import { useCallback, useEffect, useId, useState } from "react";
import { Outlet } from "react-router-dom";
import {
    AgentConstellation,
    AgentInspector,
    useActivityFeedStream,
    useAgentInspectorStore,
} from "../../features/agents";
import { useAgentTurnsIngest } from "../../features/agents/useAgentTurnsIngest";
import { ChatPanel } from "../../features/chat";
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

export function AppShell() {
    // Singleton bus consumers — keep both buffers (agent turns + activity
    // feed) alive regardless of whether the Inspector or the Activity modal
    // is currently mounted. Without this the feed only starts collecting
    // events the first time the user opens the modal, missing prior handoffs.
    useAgentTurnsIngest();
    useActivityFeedStream();

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
    const [constellationOpen, setConstellationOpen] = useState(false);

    // Hotkey `A` toggles the constellation overlay. Ignored while typing in
    // inputs/textareas/contenteditable so the letter still types normally.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== "a" && e.key !== "A") return;
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
                return;
            }
            e.preventDefault();
            setConstellationOpen((prev) => !prev);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const safeDrawer = sanitizeDrawer(drawer);
    const safeSidebar = sanitizeSidebar(sidebar);
    const drawerId = useId();

    const toggleDrawer = useCallback(() => {
        const next = { ...safeDrawer, open: !safeDrawer.open };
        setDrawer(next);
    }, [setDrawer, safeDrawer]);

    const toggleSidebar = useCallback(() => {
        const next = { collapsed: !safeSidebar.collapsed };
        setSidebar(next);
    }, [setSidebar, safeSidebar.collapsed]);

    const setDrawerWidth = useCallback(
        (width: number) => {
            setDrawer((prev) => ({ ...sanitizeDrawer(prev), width }));
        },
        [setDrawer],
    );

    const sidebarWidth = safeSidebar.collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
            <Sidebar collapsed={safeSidebar.collapsed} />
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
                    sidebarCollapsed={safeSidebar.collapsed}
                    onSidebarToggle={toggleSidebar}
                    kpiSlot={<KpiBar selection={selection} />}
                    onConstellationToggle={() => setConstellationOpen((prev) => !prev)}
                />
                <AnomalyBanner />
                <div
                    className="grid min-h-0 flex-1"
                    style={{
                        gridTemplateColumns: safeDrawer.open
                            ? `minmax(0, 1fr) ${safeDrawer.width}px`
                            : "minmax(0, 1fr) 0",
                        transition: `grid-template-columns var(--motion-base) var(--ease-out-soft)`,
                    }}
                >
                    <main className="relative flex min-h-0 flex-col overflow-hidden">
                        <div
                            className="min-h-0 flex-1 overflow-auto"
                            style={{
                                paddingBottom: inspectorAgent ? INSPECTOR_HEIGHT : undefined,
                                transition:
                                    "padding-bottom var(--motion-base) var(--ease-out-soft)",
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
                        onWidthChange={setDrawerWidth}
                    >
                        <ChatPanel selection={selection} />
                    </Drawer>
                </div>
            </div>
            {import.meta.env.DEV && <DemoReplayButton />}
            <AgentConstellation
                open={constellationOpen}
                onClose={() => setConstellationOpen(false)}
            />
        </div>
    );
}
