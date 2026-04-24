import { AnimatePresence, motion } from "framer-motion";
import {
    type KeyboardEvent as ReactKeyboardEvent,
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Hairline, Icons, Motion, StatusRail } from "../../components/ui";
import {
    allContainerKeys,
    ancestorsForCell,
    buildTreeIndex,
    type EquipmentSelection,
    findCell,
    flattenVisible,
    type NodeKey,
    nodeKey,
    searchTree,
    type TreeIndex,
    type TreeLevel,
    type TreeNode,
    useHierarchyTree,
} from "../../lib/hierarchy";

export interface EquipmentPickerProps {
    selection: EquipmentSelection | null;
    onChange: (selection: EquipmentSelection) => void;
}

const TRIGGER_WIDTH = 320;
const POPOVER_WIDTH = 460;
const POPOVER_MAX_HEIGHT = 520;

export function EquipmentPicker({ selection, onChange }: EquipmentPickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeKey, setActiveKey] = useState<NodeKey | null>(null);
    const [expanded, setExpanded] = useState<Set<NodeKey>>(() => new Set());

    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);

    const hierarchy = useHierarchyTree();
    const index = useMemo<TreeIndex>(() => buildTreeIndex(hierarchy.data), [hierarchy.data]);
    const { matchingKeys, visibleKeys } = useMemo(() => searchTree(index, query), [index, query]);
    const hasQuery = query.trim().length > 0;

    const treeId = useId();
    const searchInputId = useId();

    const openPopover = useCallback(() => {
        setOpen(true);
        setQuery("");
    }, []);

    const closePopover = useCallback(() => {
        setOpen(false);
        setQuery("");
    }, []);

    // Auto-select first viable cell when hierarchy loads without a selection.
    useEffect(() => {
        if (selection || !hierarchy.data) return;
        for (const enterprise of hierarchy.data) {
            for (const site of enterprise.sites) {
                for (const area of site.areas) {
                    for (const line of area.lines) {
                        for (const cell of line.cells) {
                            if (
                                !cell.disabled &&
                                !line.disabled &&
                                !area.disabled &&
                                !site.disabled
                            ) {
                                onChange({
                                    cellId: cell.id,
                                    cellName: cell.name,
                                    lineId: line.id,
                                    lineName: line.name,
                                    areaName: area.name,
                                    siteName: site.name,
                                });
                                return;
                            }
                        }
                    }
                }
            }
        }
    }, [hierarchy.data, selection, onChange]);

    // Reconcile stale selection (e.g. cell renamed/removed) with fresh tree.
    useEffect(() => {
        if (!selection || !hierarchy.data) return;
        const fresh = findCell(hierarchy.data, selection.cellId);
        if (!fresh) return;
        if (
            fresh.cellName !== selection.cellName ||
            fresh.lineName !== selection.lineName ||
            fresh.areaName !== selection.areaName ||
            fresh.siteName !== selection.siteName
        ) {
            onChange(fresh);
        }
    }, [hierarchy.data, selection, onChange]);

    // Reset expand state every time the popover opens so the tree always lands
    // in a coherent view: ancestors of the selection expanded, or — when no
    // selection — everything expanded (default "Plant Structure" read).
    useLayoutEffect(() => {
        if (!open) return;
        if (index.byKey.size === 0) {
            setExpanded(new Set());
            return;
        }
        if (selection) {
            const chain = ancestorsForCell(index, selection.cellId);
            setExpanded(new Set(chain));
        } else {
            setExpanded(new Set(allContainerKeys(index)));
        }
    }, [open, index, selection]);

    // When a search is active, auto-expand every container that must remain
    // visible so matches are never trapped behind a collapsed parent.
    useEffect(() => {
        if (!open || !hasQuery) return;
        setExpanded((prev) => {
            const next = new Set(prev);
            for (const k of visibleKeys) {
                const node = index.byKey.get(k);
                if (node && node.level !== "cell") next.add(k);
            }
            return next;
        });
    }, [open, hasQuery, visibleKeys, index]);

    const visibleNodes = useMemo(
        () => flattenVisible(index, expanded, hasQuery ? visibleKeys : null),
        [index, expanded, hasQuery, visibleKeys],
    );

    // Keep activeKey coherent with the visible list + selection.
    useEffect(() => {
        if (!open) {
            setActiveKey(null);
            return;
        }
        if (visibleNodes.length === 0) {
            setActiveKey(null);
            return;
        }
        if (activeKey && visibleNodes.some((n) => n.key === activeKey)) return;
        const selKey = selection ? nodeKey("cell", selection.cellId) : null;
        const match = selKey ? visibleNodes.find((n) => n.key === selKey) : undefined;
        setActiveKey(match ? match.key : visibleNodes[0].key);
    }, [open, visibleNodes, selection, activeKey]);

    // Focus management: input on open.
    useLayoutEffect(() => {
        if (open) {
            const t = window.setTimeout(() => inputRef.current?.focus(), 0);
            return () => window.clearTimeout(t);
        }
    }, [open]);

    // Scroll active node into view.
    useEffect(() => {
        if (!open || !activeKey || !listRef.current) return;
        const el = listRef.current.querySelector<HTMLElement>(
            `[data-node-key="${cssEscape(activeKey)}"]`,
        );
        if (el) el.scrollIntoView({ block: "nearest" });
    }, [activeKey, open]);

    // Escape and outside click.
    useEffect(() => {
        if (!open) return;
        function onDocKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                e.preventDefault();
                closePopover();
                triggerRef.current?.focus();
            }
        }
        function onDocMouse(e: MouseEvent) {
            if (!popoverRef.current || !triggerRef.current) return;
            const target = e.target as Node | null;
            if (!target) return;
            if (popoverRef.current.contains(target) || triggerRef.current.contains(target)) return;
            closePopover();
        }
        window.addEventListener("keydown", onDocKey);
        window.addEventListener("mousedown", onDocMouse);
        return () => {
            window.removeEventListener("keydown", onDocKey);
            window.removeEventListener("mousedown", onDocMouse);
        };
    }, [open, closePopover]);

    const selectedKey = selection ? nodeKey("cell", selection.cellId) : null;
    const totalCells = sumRootCells(index);

    const commit = useCallback(
        (node: TreeNode) => {
            if (node.level !== "cell" || !node.cell) return;
            const c = node.cell;
            onChange({
                cellId: c.cellId,
                cellName: c.cellName,
                lineId: c.lineId,
                lineName: c.lineName,
                areaName: c.areaName,
                siteName: c.siteName,
            });
            closePopover();
            window.setTimeout(() => triggerRef.current?.focus(), 0);
        },
        [onChange, closePopover],
    );

    const toggleExpand = useCallback((key: NodeKey, force?: boolean) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            const shouldBeOpen = force ?? !next.has(key);
            if (shouldBeOpen) next.add(key);
            else next.delete(key);
            return next;
        });
    }, []);

    const moveActive = useCallback(
        (delta: number) => {
            if (visibleNodes.length === 0) return;
            const idx = visibleNodes.findIndex((n) => n.key === activeKey);
            const next = idx === -1 ? 0 : (idx + delta + visibleNodes.length) % visibleNodes.length;
            setActiveKey(visibleNodes[next].key);
        },
        [visibleNodes, activeKey],
    );

    const handleKeyDown = useCallback(
        (e: ReactKeyboardEvent<HTMLDivElement>) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                moveActive(1);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                moveActive(-1);
                return;
            }
            if (e.key === "Home") {
                e.preventDefault();
                if (visibleNodes[0]) setActiveKey(visibleNodes[0].key);
                return;
            }
            if (e.key === "End") {
                e.preventDefault();
                const last = visibleNodes[visibleNodes.length - 1];
                if (last) setActiveKey(last.key);
                return;
            }
            if (e.key === "ArrowRight") {
                if (!activeKey) return;
                const node = index.byKey.get(activeKey);
                if (!node) return;
                e.preventDefault();
                if (node.level === "cell") return;
                if (!expanded.has(activeKey)) {
                    toggleExpand(activeKey, true);
                } else {
                    const kids = index.childrenOf.get(activeKey) ?? [];
                    if (kids.length > 0) setActiveKey(kids[0]);
                }
                return;
            }
            if (e.key === "ArrowLeft") {
                if (!activeKey) return;
                const node = index.byKey.get(activeKey);
                if (!node) return;
                e.preventDefault();
                if (node.level !== "cell" && expanded.has(activeKey)) {
                    toggleExpand(activeKey, false);
                } else if (node.parentKey) {
                    setActiveKey(node.parentKey);
                }
                return;
            }
            if (e.key === "Enter") {
                if (!activeKey) return;
                const node = index.byKey.get(activeKey);
                if (!node) return;
                e.preventDefault();
                if (node.level === "cell") {
                    if (!node.disabled) commit(node);
                } else {
                    toggleExpand(activeKey);
                }
                return;
            }
            if (e.key === "Tab") {
                e.preventDefault();
                if (inputRef.current && document.activeElement !== inputRef.current) {
                    inputRef.current.focus();
                } else if (e.shiftKey && visibleNodes.length > 0) {
                    moveActive(-1);
                } else {
                    moveActive(1);
                }
            }
        },
        [moveActive, activeKey, visibleNodes, commit, index, expanded, toggleExpand],
    );

    const visibleCellCount = useMemo(
        () => visibleNodes.reduce((n, node) => (node.level === "cell" ? n + 1 : n), 0),
        [visibleNodes],
    );

    const triggerLabel = selection?.cellName ?? "Select equipment";
    const triggerContext = selection ? selection.lineName : "";

    return (
        <div className="relative flex-none">
            <button
                ref={triggerRef}
                type="button"
                onClick={() => (open ? closePopover() : openPopover())}
                aria-haspopup="tree"
                aria-expanded={open}
                aria-controls={treeId}
                className="group inline-flex h-8 max-w-full items-center gap-2.5 rounded-lg border border-border bg-card pr-2 pl-3 text-left transition-colors duration-150 hover:border-input hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{ width: TRIGGER_WIDTH }}
            >
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                        {triggerLabel}
                    </span>
                    {triggerContext && (
                        <span className="hidden truncate text-xs text-text-tertiary md:inline">
                            {triggerContext}
                        </span>
                    )}
                </span>
                <Icons.ChevronDown
                    className={`size-4 flex-none text-muted-foreground transition-transform duration-150 ${open ? "rotate-180" : ""}`}
                />
            </button>

            <AnimatePresence>
                {open && (
                    <>
                        <motion.div
                            key="scrim"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.12, ease: "linear" }}
                            className="fixed inset-0 z-40"
                            style={{ backgroundColor: "rgb(0 0 0 / 0.4)" }}
                            aria-hidden
                        />
                        <motion.div
                            key="popover"
                            ref={popoverRef}
                            variants={Motion.fadeInUp}
                            initial="hidden"
                            animate="visible"
                            exit="hidden"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Plant structure"
                            onKeyDown={handleKeyDown}
                            className="absolute top-full left-0 z-50 overflow-hidden rounded-lg border border-border bg-card"
                            style={{
                                width: POPOVER_WIDTH,
                                maxHeight: POPOVER_MAX_HEIGHT,
                                boxShadow: "var(--shadow-overlay)",
                            }}
                        >
                            <PickerHeader
                                inputRef={inputRef}
                                searchInputId={searchInputId}
                                query={query}
                                onQueryChange={setQuery}
                                total={totalCells}
                                shown={visibleCellCount}
                            />
                            <Hairline />
                            <PickerBody
                                treeId={treeId}
                                listRef={listRef}
                                isLoading={hierarchy.isLoading}
                                isError={Boolean(hierarchy.error)}
                                errorMessage={
                                    hierarchy.error instanceof Error
                                        ? hierarchy.error.message
                                        : undefined
                                }
                                onRetry={() => hierarchy.refetch()}
                                visibleNodes={visibleNodes}
                                expanded={expanded}
                                activeKey={activeKey}
                                selectedKey={selectedKey}
                                matchingKeys={matchingKeys}
                                hasQuery={hasQuery}
                                onHover={setActiveKey}
                                onToggle={(k) => toggleExpand(k)}
                                onCommit={commit}
                                query={query}
                                totalCells={totalCells}
                            />
                            <Hairline />
                            <PickerFooter shown={visibleCellCount} total={totalCells} />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

function sumRootCells(index: TreeIndex): number {
    let n = 0;
    for (const k of index.roots) {
        const node = index.byKey.get(k);
        if (node) n += node.cellCount;
    }
    return n;
}

// CSS.escape is widely supported; fall back to a stub keyed on `:`.
function cssEscape(value: string): string {
    if (typeof window !== "undefined" && typeof window.CSS?.escape === "function") {
        return window.CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

interface PickerHeaderProps {
    inputRef: React.RefObject<HTMLInputElement | null>;
    searchInputId: string;
    query: string;
    onQueryChange: (q: string) => void;
    total: number;
    shown: number;
}

function PickerHeader({
    inputRef,
    searchInputId,
    query,
    onQueryChange,
    total,
    shown,
}: PickerHeaderProps) {
    return (
        <div className="flex flex-col gap-2 px-3 pt-3 pb-2">
            <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-foreground">Plant structure</span>
                <span className="text-xs text-text-tertiary">
                    {total === 0 ? "—" : `${shown} of ${total} cells`}
                </span>
            </div>
            <label htmlFor={searchInputId} className="sr-only">
                Filter plant structure
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
                <Icons.Search className="size-4 flex-none text-text-tertiary" />
                <input
                    ref={inputRef}
                    id={searchInputId}
                    data-equipment-picker-input
                    type="text"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder="Filter by site, area, line, or cell…"
                    spellCheck={false}
                    autoComplete="off"
                    className="h-8 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-text-tertiary focus:outline-none"
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => onQueryChange("")}
                        aria-label="Clear filter"
                        className="text-text-tertiary transition-colors duration-150 hover:text-muted-foreground"
                    >
                        <Icons.X className="size-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}

interface PickerBodyProps {
    treeId: string;
    listRef: React.RefObject<HTMLDivElement | null>;
    isLoading: boolean;
    isError: boolean;
    errorMessage?: string;
    onRetry: () => void;
    visibleNodes: TreeNode[];
    expanded: Set<NodeKey>;
    activeKey: NodeKey | null;
    selectedKey: NodeKey | null;
    matchingKeys: Set<NodeKey>;
    hasQuery: boolean;
    onHover: (key: NodeKey) => void;
    onToggle: (key: NodeKey) => void;
    onCommit: (node: TreeNode) => void;
    query: string;
    totalCells: number;
}

function PickerBody({
    treeId,
    listRef,
    isLoading,
    isError,
    errorMessage,
    onRetry,
    visibleNodes,
    expanded,
    activeKey,
    selectedKey,
    matchingKeys,
    hasQuery,
    onHover,
    onToggle,
    onCommit,
    query,
    totalCells,
}: PickerBodyProps) {
    if (isLoading) {
        return (
            <div
                ref={listRef}
                className="flex min-h-[220px] items-center justify-center px-4 py-6"
                aria-busy
            >
                <span className="text-sm text-text-tertiary">Loading plant structure…</span>
            </div>
        );
    }

    if (isError) {
        return (
            <div
                ref={listRef}
                role="alert"
                className="flex min-h-[220px] flex-col items-start justify-center gap-2 px-4 py-6"
            >
                <span className="text-sm font-medium text-destructive">
                    Plant structure unavailable
                </span>
                <span className="text-sm text-muted-foreground">
                    {errorMessage ?? "Failed to load plant structure."}
                </span>
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-1 inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-muted px-2.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:border-input hover:text-foreground"
                >
                    <Icons.RefreshCw className="size-3.5" />
                    Retry
                </button>
            </div>
        );
    }

    if (totalCells === 0) {
        return (
            <div
                ref={listRef}
                className="flex min-h-[220px] flex-col items-center justify-center gap-1.5 px-4 py-6 text-center"
            >
                <span className="text-sm font-medium text-muted-foreground">No equipment yet</span>
                <span className="text-sm text-text-tertiary">The plant structure is empty.</span>
            </div>
        );
    }

    if (visibleNodes.length === 0) {
        return (
            <div
                ref={listRef}
                className="flex min-h-[220px] flex-col items-center justify-center gap-1.5 px-4 py-6 text-center"
            >
                <span className="text-sm font-medium text-muted-foreground">No match</span>
                <span className="text-sm text-text-tertiary">
                    Nothing matches <span className="text-foreground">“{query}”</span>.
                </span>
            </div>
        );
    }

    return (
        <div
            id={treeId}
            ref={listRef}
            role="tree"
            aria-label="Plant structure"
            aria-activedescendant={activeKey ? treeItemId(treeId, activeKey) : undefined}
            tabIndex={-1}
            className="max-h-[360px] overflow-y-auto py-1"
        >
            {visibleNodes.map((node) => (
                <TreeItem
                    key={node.key}
                    treeId={treeId}
                    node={node}
                    expanded={expanded.has(node.key)}
                    active={node.key === activeKey}
                    selected={node.key === selectedKey}
                    matched={hasQuery && matchingKeys.has(node.key)}
                    dimmed={hasQuery && !matchingKeys.has(node.key)}
                    onHover={onHover}
                    onToggle={onToggle}
                    onCommit={onCommit}
                />
            ))}
        </div>
    );
}

function treeItemId(treeId: string, key: NodeKey): string {
    return `${treeId}-${key.replace(/:/g, "-")}`;
}

interface TreeItemProps {
    treeId: string;
    node: TreeNode;
    expanded: boolean;
    active: boolean;
    selected: boolean;
    matched: boolean;
    dimmed: boolean;
    onHover: (key: NodeKey) => void;
    onToggle: (key: NodeKey) => void;
    onCommit: (node: TreeNode) => void;
}

function TreeItem({
    treeId,
    node,
    expanded,
    active,
    selected,
    matched,
    dimmed,
    onHover,
    onToggle,
    onCommit,
}: TreeItemProps) {
    const isLeaf = node.level === "cell";
    const disabled = node.disabled;
    const indentPx = 8 + (node.depth - 1) * 14;

    const handleClick = () => {
        if (disabled) return;
        if (isLeaf) onCommit(node);
        else onToggle(node.key);
    };

    const handleChevronClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggle(node.key);
    };

    const bg = active ? "var(--accent)" : "transparent";
    const nameColor = dimmed ? "text-text-tertiary" : "text-foreground";

    return (
        <div
            id={treeItemId(treeId, node.key)}
            data-node-key={node.key}
            role="treeitem"
            aria-level={node.depth}
            aria-expanded={isLeaf ? undefined : expanded}
            aria-selected={selected}
            aria-disabled={disabled}
            tabIndex={-1}
            onMouseEnter={() => !disabled && onHover(node.key)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={handleClick}
            className={`group relative mx-2 flex cursor-pointer items-center gap-1.5 rounded-md py-1.5 pr-2 transition-colors duration-150 ${
                disabled ? "cursor-not-allowed opacity-40" : ""
            }`}
            style={{ backgroundColor: bg, paddingLeft: indentPx }}
        >
            {selected && !disabled && <StatusRail tone="accent" weight={2} />}

            {isLeaf ? (
                <span className="inline-block w-4 flex-none" aria-hidden />
            ) : (
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={handleChevronClick}
                    onMouseDown={(e) => e.preventDefault()}
                    aria-label={expanded ? "Collapse" : "Expand"}
                    className="inline-flex size-4 flex-none items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:text-foreground"
                >
                    <Icons.ChevronRight
                        className={`size-3.5 transition-transform duration-150 ${
                            expanded ? "rotate-90" : ""
                        }`}
                    />
                </button>
            )}

            <LevelIcon
                level={node.level}
                className={
                    dimmed
                        ? "size-4 flex-none text-text-tertiary"
                        : "size-4 flex-none text-muted-foreground"
                }
            />

            <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span
                    className={`truncate text-sm ${
                        matched ? "font-semibold" : "font-medium"
                    } ${nameColor}`}
                >
                    {node.name}
                </span>
                {isLeaf ? (
                    <span className="truncate text-xs text-text-tertiary">#{node.id}</span>
                ) : (
                    <span className="text-xs text-text-tertiary tabular-nums">
                        {node.cellCount}
                    </span>
                )}
            </span>

            {isLeaf && disabled && <span className="text-xs text-text-tertiary">Disabled</span>}
            {isLeaf && selected && !disabled && (
                <Icons.Check className="size-4 flex-none text-primary" />
            )}
        </div>
    );
}

const LEVEL_ICON: Record<
    TreeLevel,
    React.ComponentType<{ className?: string; strokeWidth?: number }>
> = {
    enterprise: Icons.Building2,
    site: Icons.MapPin,
    area: Icons.Layers,
    line: Icons.GitBranch,
    cell: Icons.Cpu,
};

function LevelIcon({ level, className }: { level: TreeLevel; className?: string }) {
    const Icon = LEVEL_ICON[level];
    return <Icon className={className} strokeWidth={1.75} />;
}

interface PickerFooterProps {
    shown: number;
    total: number;
}

function PickerFooter({ shown, total }: PickerFooterProps) {
    return (
        <div className="flex items-center justify-end gap-3 px-3 py-2">
            <span className="text-xs text-text-tertiary">
                {total > 0 ? `${shown} cell${shown === 1 ? "" : "s"}` : "—"}
            </span>
        </div>
    );
}
