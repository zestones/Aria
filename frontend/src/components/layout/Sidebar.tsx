import { NavLink } from "react-router-dom";
import { AriaMark, Icons } from "../ui";
import { UserMenu } from "./UserMenu";

/**
 * Primary navigation rail.
 *
 * Anatomy
 *   ┌──────────────┐
 *   │ Brand        │  (h-14, hairline divider)
 *   ├──────────────┤
 *   │ GROUP LABEL  │  (10px, uppercase, wide tracking)
 *   │ ▌ Item·····  │  (h-10, 2.5px primary left rail when active)
 *   │   Item·····  │
 *   ├──────────────┤
 *   │ User row     │  (edge-to-edge, hover-tints the bottom strip)
 *   └──────────────┘
 *
 * Collapsing the sidebar is exposed through a 6px-wide hover rail on the right
 * edge. Click the rail to toggle.
 */
export const SIDEBAR_WIDTH_EXPANDED = 240;
export const SIDEBAR_WIDTH_COLLAPSED = 64;

interface NavItem {
    to: string;
    label: string;
    icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
    /** When true, only render in DEV builds (internal tooling). */
    devOnly?: boolean;
    /** When true, NavLink uses `end` so only the exact path matches. */
    exact?: boolean;
}

interface NavGroup {
    id: string;
    label: string;
    items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
    {
        id: "operations",
        label: "Operations",
        items: [
            { to: "/control-room", label: "Control room", icon: Icons.Gauge },
            { to: "/work-orders", label: "Work orders", icon: Icons.Wrench },
            { to: "/onboarding", label: "Onboarding", icon: Icons.Upload },
        ],
    },
    {
        id: "internal",
        label: "Internal",
        items: [
            { to: "/data", label: "Data inspector", icon: Icons.Database, devOnly: true },
            { to: "/design", label: "Design system", icon: Icons.Layers, devOnly: true },
        ],
    },
];

export interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const isDev = import.meta.env.DEV;
    const visibleGroups = NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.devOnly || isDev),
    })).filter((group) => group.items.length > 0);

    return (
        <div className="relative flex-none">
            <aside
                aria-label="Primary navigation"
                className="flex h-full flex-col bg-sidebar"
                style={{
                    width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
                    transition: "width var(--motion-base) var(--ease-out-soft)",
                }}
            >
                <SidebarHeader collapsed={collapsed} />

                <nav
                    aria-label="Sections"
                    className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto py-4"
                >
                    {visibleGroups.map((group, idx) => (
                        <SidebarSection
                            key={group.id}
                            group={group}
                            collapsed={collapsed}
                            isFirst={idx === 0}
                        />
                    ))}
                </nav>

                <SidebarFooter collapsed={collapsed} />
            </aside>

            {/* Hover-to-toggle rail along the right edge. */}
            <SidebarRail collapsed={collapsed} onToggle={onToggle} />
        </div>
    );
}

// ─── Header ─────────────────────────────────────────────────────────────────

function SidebarHeader({ collapsed }: { collapsed: boolean }) {
    return (
        <div
            className={[
                "flex h-14 flex-none items-center border-b border-sidebar-border/40",
                "transition-[padding] duration-150",
                collapsed ? "justify-center px-3" : "gap-2.5 px-4",
            ].join(" ")}
        >
            <NavLink
                to="/control-room"
                className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                aria-label="ARIA — Control room"
            >
                <AriaMark size={20} className="text-sidebar-foreground" />
                {!collapsed && (
                    <span className="text-base font-semibold tracking-[-0.01em] text-sidebar-foreground">
                        ARIA
                    </span>
                )}
            </NavLink>
        </div>
    );
}

// ─── Section ────────────────────────────────────────────────────────────────

interface SidebarSectionProps {
    group: NavGroup;
    collapsed: boolean;
    isFirst: boolean;
}

function SidebarSection({ group, collapsed, isFirst }: SidebarSectionProps) {
    return (
        <div>
            {!collapsed ? (
                <div className="mb-2 px-4">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-muted-foreground">
                        {group.label}
                    </span>
                </div>
            ) : (
                !isFirst && (
                    <div
                        aria-hidden
                        className="mx-auto mb-2 w-5 border-t border-sidebar-border/40"
                    />
                )
            )}
            <ul className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                    <li key={item.to}>
                        <SidebarLink item={item} collapsed={collapsed} />
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ─── Item ───────────────────────────────────────────────────────────────────

interface SidebarLinkProps {
    item: NavItem;
    collapsed: boolean;
}

function SidebarLink({ item, collapsed }: SidebarLinkProps) {
    const Icon = item.icon;

    return (
        <NavLink
            to={item.to}
            end={item.exact}
            title={collapsed ? item.label : undefined}
            aria-label={collapsed ? item.label : undefined}
            className={({ isActive }) =>
                [
                    "group relative flex items-center transition-all duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                    collapsed
                        ? "mx-auto h-10 w-10 justify-center rounded-md"
                        : "mx-3 h-10 gap-3 rounded-r-md px-3 border-l-[2.5px]",
                    isActive
                        ? collapsed
                            ? "bg-primary/10 text-primary"
                            : "border-primary bg-primary/10 text-primary font-medium"
                        : collapsed
                          ? "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                          : "border-transparent text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
                ].join(" ")
            }
        >
            {({ isActive }) => (
                <>
                    <Icon
                        className={[
                            "size-[18px] flex-none transition-colors",
                            isActive
                                ? "text-primary"
                                : "text-sidebar-muted-foreground group-hover:text-sidebar-foreground",
                        ].join(" ")}
                        aria-hidden
                    />
                    {!collapsed && <span className="truncate text-sm">{item.label}</span>}
                </>
            )}
        </NavLink>
    );
}

// ─── Rail (hover-to-toggle) ─────────────────────────────────────────────────

function SidebarRail({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
    return (
        <button
            type="button"
            tabIndex={-1}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={onToggle}
            className={[
                "group absolute inset-y-0 -right-3 z-20 w-6 cursor-col-resize",
                "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2",
                "after:bg-transparent after:transition-colors after:duration-150",
                "hover:after:bg-primary/40",
            ].join(" ")}
        />
    );
}

// ─── Footer ─────────────────────────────────────────────────────────────────

function SidebarFooter({ collapsed }: { collapsed: boolean }) {
    return (
        <div className="flex flex-none flex-col border-t border-sidebar-border/40">
            <UserMenu compact={collapsed} />
        </div>
    );
}
