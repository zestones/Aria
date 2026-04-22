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
import { Hairline, Icons, KbdKey, Motion, StatusRail } from "../design-system";
import {
    type EquipmentSelection,
    type FlatCell,
    findCell,
    type GroupedLine,
    useFlatHierarchy,
    useHierarchyTree,
} from "../lib/hierarchy";

export interface EquipmentPickerProps {
    selection: EquipmentSelection | null;
    onChange: (selection: EquipmentSelection) => void;
}

const TRIGGER_WIDTH = 320;
const POPOVER_WIDTH = 420;
const POPOVER_MAX_HEIGHT = 480;

function useKeyboardShortcut(onOpen: () => void) {
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const isMac =
                typeof navigator !== "undefined" &&
                navigator.platform.toLowerCase().includes("mac");
            const mod = isMac ? e.metaKey : e.ctrlKey;
            if (!mod || !e.shiftKey) return;
            if (e.key.toLowerCase() !== "e") return;
            const target = e.target;
            if (target instanceof HTMLElement) {
                const tag = target.tagName;
                if (
                    (tag === "INPUT" || tag === "TEXTAREA") &&
                    !target.dataset.equipmentPickerInput
                ) {
                    return;
                }
            }
            e.preventDefault();
            onOpen();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onOpen]);
}

export function EquipmentPicker({ selection, onChange }: EquipmentPickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeCellId, setActiveCellId] = useState<number | null>(null);

    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const popoverRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);

    const hierarchy = useHierarchyTree();
    const { isLoading, error, all, filtered, groups, refetch } = useFlatHierarchy(query);

    const listboxId = useId();
    const searchInputId = useId();

    const openPopover = useCallback(() => {
        setOpen(true);
        setQuery("");
    }, []);

    const closePopover = useCallback(() => {
        setOpen(false);
        setQuery("");
    }, []);

    useKeyboardShortcut(openPopover);

    // Auto-select a fallback once hierarchy loads, if caller has no selection.
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

    // Keep activeCellId coherent with the current filtered list + selection.
    useEffect(() => {
        if (!open) return;
        const enabled = filtered.filter((c) => !c.cellDisabled);
        if (enabled.length === 0) {
            setActiveCellId(null);
            return;
        }
        const current = enabled.find((c) => c.cellId === activeCellId);
        if (current) return;
        const match = enabled.find((c) => c.cellId === selection?.cellId);
        setActiveCellId(match ? match.cellId : enabled[0].cellId);
    }, [open, filtered, selection, activeCellId]);

    // Focus management: input on open, trigger on close.
    useLayoutEffect(() => {
        if (open) {
            const t = window.setTimeout(() => inputRef.current?.focus(), 0);
            return () => window.clearTimeout(t);
        }
    }, [open]);

    // Scroll active option into view.
    useEffect(() => {
        if (!open || activeCellId == null || !listRef.current) return;
        const el = listRef.current.querySelector<HTMLElement>(`[data-cell-id="${activeCellId}"]`);
        if (el) {
            el.scrollIntoView({ block: "nearest" });
        }
    }, [activeCellId, open]);

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

    const enabledOrder = useMemo(() => filtered.filter((c) => !c.cellDisabled), [filtered]);

    const commit = useCallback(
        (cell: FlatCell) => {
            onChange({
                cellId: cell.cellId,
                cellName: cell.cellName,
                lineId: cell.lineId,
                lineName: cell.lineName,
                areaName: cell.areaName,
                siteName: cell.siteName,
            });
            closePopover();
            window.setTimeout(() => triggerRef.current?.focus(), 0);
        },
        [onChange, closePopover],
    );

    const moveActive = useCallback(
        (delta: number) => {
            if (enabledOrder.length === 0) return;
            const idx = enabledOrder.findIndex((c) => c.cellId === activeCellId);
            const next = idx === -1 ? 0 : (idx + delta + enabledOrder.length) % enabledOrder.length;
            setActiveCellId(enabledOrder[next].cellId);
        },
        [enabledOrder, activeCellId],
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
                if (enabledOrder[0]) setActiveCellId(enabledOrder[0].cellId);
                return;
            }
            if (e.key === "End") {
                e.preventDefault();
                const last = enabledOrder[enabledOrder.length - 1];
                if (last) setActiveCellId(last.cellId);
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                const cell = enabledOrder.find((c) => c.cellId === activeCellId);
                if (cell) commit(cell);
                return;
            }
            if (e.key === "Tab") {
                e.preventDefault();
                if (inputRef.current && document.activeElement !== inputRef.current) {
                    inputRef.current.focus();
                } else if (e.shiftKey && enabledOrder.length > 0) {
                    moveActive(-1);
                } else {
                    moveActive(1);
                }
            }
        },
        [moveActive, activeCellId, enabledOrder, commit],
    );

    const triggerLabel = selection?.cellName ?? "NO EQUIPMENT";
    const triggerContext = selection
        ? `${selection.siteName} · ${selection.areaName} · ${selection.lineName}`
        : "—";

    return (
        <div className="relative flex-none">
            <button
                ref={triggerRef}
                type="button"
                onClick={() => (open ? closePopover() : openPopover())}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listboxId}
                className="group inline-flex h-8 max-w-full items-center gap-2.5 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-bg-surface)] pr-2 pl-2.5 text-left transition-colors duration-[var(--ds-motion-fast)] hover:border-[var(--ds-border-strong)] focus-visible:border-[var(--ds-accent)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ds-accent-glow)]"
                style={{ width: TRIGGER_WIDTH }}
            >
                <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--ds-fg-subtle)]">
                    [EQ]
                </span>
                <span className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="truncate font-mono text-[13px] font-medium text-[var(--ds-fg-primary)]">
                        {triggerLabel}
                    </span>
                    <span className="hidden truncate font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--ds-fg-subtle)] md:inline">
                        {triggerContext}
                    </span>
                </span>
                <KbdKey className="flex-none">⌘⇧E</KbdKey>
                <Icons.ChevronDown
                    className={`size-4 flex-none text-[var(--ds-fg-muted)] transition-transform duration-[var(--ds-motion-fast)] ${open ? "rotate-180" : ""}`}
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
                            style={{ backgroundColor: "rgb(5 8 13 / 0.55)" }}
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
                            aria-label="Select equipment"
                            onKeyDown={handleKeyDown}
                            className="absolute top-full left-0 z-50 mt-1 overflow-hidden rounded-[var(--ds-radius-md)] border border-[var(--ds-border-strong)] bg-[var(--ds-bg-surface)]"
                            style={{
                                width: POPOVER_WIDTH,
                                maxHeight: POPOVER_MAX_HEIGHT,
                                boxShadow: "0 1px 0 0 var(--ds-accent-glow)",
                            }}
                        >
                            <PickerHeader
                                inputRef={inputRef}
                                searchInputId={searchInputId}
                                query={query}
                                onQueryChange={setQuery}
                                total={all.length}
                                shown={enabledOrder.length}
                            />
                            <Hairline />
                            <PickerBody
                                listboxId={listboxId}
                                listRef={listRef}
                                isLoading={isLoading}
                                isError={Boolean(error)}
                                errorMessage={error instanceof Error ? error.message : undefined}
                                onRetry={() => refetch()}
                                groups={groups}
                                total={all.length}
                                activeCellId={activeCellId}
                                selectedCellId={selection?.cellId ?? null}
                                onHover={setActiveCellId}
                                onCommit={commit}
                                query={query}
                            />
                            <Hairline />
                            <PickerFooter shown={enabledOrder.length} total={all.length} />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
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
                <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--ds-fg-muted)]">
                    [ EQUIPMENT / SELECT ]
                </span>
                <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--ds-fg-subtle)]">
                    {total === 0 ? "—" : `${shown} / ${total}`}
                </span>
            </div>
            <label htmlFor={searchInputId} className="sr-only">
                Search equipment
            </label>
            <div className="flex items-center gap-2 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-bg-base)] px-2.5 focus-within:border-[var(--ds-accent)] focus-within:ring-1 focus-within:ring-[var(--ds-accent-glow)]">
                <Icons.Search className="size-4 flex-none text-[var(--ds-fg-subtle)]" />
                <input
                    ref={inputRef}
                    id={searchInputId}
                    data-equipment-picker-input
                    type="text"
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder="Filter by site, line, or cell…"
                    spellCheck={false}
                    autoComplete="off"
                    className="h-8 min-w-0 flex-1 bg-transparent font-mono text-[13px] text-[var(--ds-fg-primary)] placeholder:text-[var(--ds-fg-subtle)] focus:outline-none"
                />
                {query && (
                    <button
                        type="button"
                        onClick={() => onQueryChange("")}
                        aria-label="Clear search"
                        className="text-[var(--ds-fg-subtle)] transition-colors duration-[var(--ds-motion-fast)] hover:text-[var(--ds-fg-muted)]"
                    >
                        <Icons.X className="size-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}

interface PickerBodyProps {
    listboxId: string;
    listRef: React.RefObject<HTMLDivElement | null>;
    isLoading: boolean;
    isError: boolean;
    errorMessage?: string;
    onRetry: () => void;
    groups: GroupedLine[];
    total: number;
    activeCellId: number | null;
    selectedCellId: number | null;
    onHover: (cellId: number) => void;
    onCommit: (cell: FlatCell) => void;
    query: string;
}

function PickerBody({
    listboxId,
    listRef,
    isLoading,
    isError,
    errorMessage,
    onRetry,
    groups,
    total,
    activeCellId,
    selectedCellId,
    onHover,
    onCommit,
    query,
}: PickerBodyProps) {
    if (isLoading) {
        return (
            <div
                ref={listRef}
                className="flex min-h-[180px] items-center justify-center px-4 py-6"
                aria-busy
            >
                <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--ds-fg-subtle)]">
                    Loading hierarchy…
                </span>
            </div>
        );
    }

    if (isError) {
        return (
            <div
                ref={listRef}
                role="alert"
                className="flex min-h-[180px] flex-col items-start justify-center gap-2 px-4 py-6"
            >
                <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--ds-status-critical)]">
                    [ TREE / UNAVAILABLE ]
                </span>
                <span className="font-mono text-[12px] text-[var(--ds-fg-muted)]">
                    {errorMessage ?? "Failed to load equipment tree."}
                </span>
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-1 inline-flex h-7 items-center gap-1.5 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] px-2 font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--ds-fg-muted)] transition-colors duration-[var(--ds-motion-fast)] hover:border-[var(--ds-border-strong)] hover:text-[var(--ds-fg-primary)]"
                >
                    <Icons.RefreshCw className="size-3.5" />
                    Retry
                </button>
            </div>
        );
    }

    if (total === 0) {
        return (
            <div
                ref={listRef}
                className="flex min-h-[180px] flex-col items-center justify-center gap-1.5 px-4 py-6 text-center"
            >
                <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--ds-fg-subtle)]">
                    [ TREE / EMPTY ]
                </span>
                <span className="font-mono text-[12px] text-[var(--ds-fg-muted)]">
                    No equipment hierarchy defined yet.
                </span>
            </div>
        );
    }

    if (groups.length === 0) {
        return (
            <div
                ref={listRef}
                className="flex min-h-[180px] flex-col items-center justify-center gap-1.5 px-4 py-6 text-center"
            >
                <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--ds-fg-subtle)]">
                    [ NO MATCH ]
                </span>
                <span className="font-mono text-[12px] text-[var(--ds-fg-muted)]">
                    Nothing matches <span className="text-[var(--ds-fg-primary)]">“{query}”</span>.
                </span>
            </div>
        );
    }

    return (
        <div
            id={listboxId}
            ref={listRef}
            role="listbox"
            aria-label="Equipment cells, grouped by production line"
            aria-activedescendant={activeCellId ? `equip-cell-${activeCellId}` : undefined}
            tabIndex={-1}
            className="max-h-[320px] overflow-y-auto py-1.5"
        >
            {groups.map((group) => (
                <LineGroup
                    key={group.lineId}
                    group={group}
                    activeCellId={activeCellId}
                    selectedCellId={selectedCellId}
                    onHover={onHover}
                    onCommit={onCommit}
                />
            ))}
        </div>
    );
}

interface LineGroupProps {
    group: GroupedLine;
    activeCellId: number | null;
    selectedCellId: number | null;
    onHover: (cellId: number) => void;
    onCommit: (cell: FlatCell) => void;
}

function LineGroup({ group, activeCellId, selectedCellId, onHover, onCommit }: LineGroupProps) {
    return (
        <div className="pb-1.5">
            <div className="flex items-baseline justify-between px-3 pt-2 pb-1">
                <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--ds-fg-muted)]">
                    LINE / {group.lineName}
                </span>
                <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--ds-fg-subtle)]">
                    {group.siteName} · {group.areaName}
                </span>
            </div>
            <div role="presentation" className="flex flex-col">
                {group.cells.map((cell) => (
                    <CellRow
                        key={cell.cellId}
                        cell={cell}
                        active={cell.cellId === activeCellId}
                        selected={cell.cellId === selectedCellId}
                        onHover={onHover}
                        onCommit={onCommit}
                    />
                ))}
            </div>
        </div>
    );
}

interface CellRowProps {
    cell: FlatCell;
    active: boolean;
    selected: boolean;
    onHover: (cellId: number) => void;
    onCommit: (cell: FlatCell) => void;
}

function CellRow({ cell, active, selected, onHover, onCommit }: CellRowProps) {
    const disabled = cell.cellDisabled;
    const tone = disabled ? "idle" : selected ? "accent" : "nominal";
    const bg = active ? "var(--ds-bg-elevated)" : "transparent";

    return (
        <div
            id={`equip-cell-${cell.cellId}`}
            data-cell-id={cell.cellId}
            role="option"
            tabIndex={-1}
            aria-selected={selected}
            aria-disabled={disabled}
            onMouseEnter={() => !disabled && onHover(cell.cellId)}
            // mouseDown default would steal focus from the search input before click fires
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => !disabled && onCommit(cell)}
            className={`relative mx-2 flex cursor-pointer items-center gap-3 rounded-[var(--ds-radius-sm)] px-2.5 py-1.5 transition-colors duration-[var(--ds-motion-fast)] ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
            style={{ backgroundColor: bg }}
        >
            <StatusRail tone={tone} weight={2} />
            <span className="flex min-w-0 flex-1 items-baseline gap-2 pl-2">
                <span className="truncate font-mono text-[13px] font-medium text-[var(--ds-fg-primary)]">
                    {cell.cellName}
                </span>
                <span className="truncate font-mono text-[11px] tracking-[0.08em] uppercase text-[var(--ds-fg-subtle)]">
                    CELL · #{cell.cellId}
                </span>
            </span>
            {disabled && (
                <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--ds-fg-subtle)]">
                    DISABLED
                </span>
            )}
            {selected && !disabled && (
                <Icons.Check className="size-4 flex-none text-[var(--ds-accent)]" />
            )}
        </div>
    );
}

interface PickerFooterProps {
    shown: number;
    total: number;
}

function PickerFooter({ shown, total }: PickerFooterProps) {
    return (
        <div className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--ds-fg-subtle)]">
                <span className="flex items-center gap-1">
                    <KbdKey>↑</KbdKey>
                    <KbdKey>↓</KbdKey>
                    <span>nav</span>
                </span>
                <span className="flex items-center gap-1">
                    <KbdKey>↵</KbdKey>
                    <span>select</span>
                </span>
                <span className="flex items-center gap-1">
                    <KbdKey>esc</KbdKey>
                    <span>close</span>
                </span>
            </div>
            <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--ds-fg-subtle)]">
                {total > 0 ? `${shown} CELL${shown === 1 ? "" : "S"}` : "—"}
            </span>
        </div>
    );
}
