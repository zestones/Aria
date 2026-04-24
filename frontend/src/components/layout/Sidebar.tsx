import { NavLink } from "react-router-dom";
import { AriaMark, Icons, KbdKey } from "../ui";
import { UserMenu } from "./UserMenu";

export const SIDEBAR_WIDTH_EXPANDED = 224;
export const SIDEBAR_WIDTH_COLLAPSED = 56;

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

    return (
        <aside
            aria-label="Primary navigation"
            className="flex h-full flex-none flex-col border-r border-border bg-card"
            style={{
                width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
                transition: "width var(--motion-base) var(--ease-out-soft)",
            }}
        >
            {/* Brand */}
            <div
                className={`flex h-14 flex-none items-center border-b border-border ${
                    collapsed ? "justify-center px-0" : "px-3"
                }`}
            >
                <NavLink
                    to="/control-room"
                    className="inline-flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="ARIA — Control room"
                >
                    <AriaMark size={20} className="text-foreground" />
                    {!collapsed && (
                        <span className="text-base font-semibold tracking-[-0.01em] text-foreground">
                            ARIA
                        </span>
                    )}
                </NavLink>
            </div>

            {/* Navigation groups */}
            <nav
                aria-label="Sections"
                className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-3"
            >
                {NAV_GROUPS.map((group) => {
                    const items = group.items.filter((item) => !item.devOnly || isDev);
                    if (items.length === 0) return null;
                    return (
                        <div key={group.id} className="flex flex-col gap-0.5">
                            {!collapsed && (
                                <div className="px-2 pb-1 text-xs font-medium uppercase tracking-wider text-text-tertiary">
                                    {group.label}
                                </div>
                            )}
                            {collapsed && group.id !== NAV_GROUPS[0].id && (
                                <div aria-hidden className="mx-auto mb-1 h-px w-6 bg-border" />
                            )}
                            <ul className="flex flex-col gap-0.5">
                                {items.map((item) => (
                                    <li key={item.to}>
                                        <SidebarLink item={item} collapsed={collapsed} />
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}
            </nav>

            {/* Bottom: collapse toggle + user menu */}
            <div className="flex flex-none flex-col gap-1 border-t border-border p-2">
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    aria-pressed={!collapsed}
                    title={collapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
                    className={[
                        "flex h-8 items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors",
                        "hover:bg-accent hover:text-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        collapsed ? "w-full justify-center" : "w-full px-2",
                    ].join(" ")}
                >
                    {collapsed ? (
                        <Icons.ChevronRight className="size-4" aria-hidden />
                    ) : (
                        <>
                            <Icons.ChevronLeft className="size-4" aria-hidden />
                            <span className="flex-1 text-left">Collapse</span>
                            <KbdKey>⌘B</KbdKey>
                        </>
                    )}
                </button>
                <UserMenu compact={collapsed} />
            </div>
        </aside>
    );
}

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
                    "group flex h-9 items-center gap-2.5 rounded-md text-sm font-medium transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    collapsed ? "justify-center px-0" : "px-2.5",
                    isActive
                        ? "bg-accent-soft text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                ].join(" ")
            }
        >
            <Icon className="size-4 flex-none" aria-hidden />
            {!collapsed && <span className="truncate">{item.label}</span>}
        </NavLink>
    );
}
