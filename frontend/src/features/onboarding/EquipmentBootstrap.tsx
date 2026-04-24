/**
 * EquipmentBootstrap — onboarding entry pane.
 *
 * Two compact, flat modes (no nested trees — cells only ever attach to a
 * line, so a tree is overkill):
 *
 *   ┌─ Pick existing cell ───────────┐    ┌─ Create new cell ─────────────┐
 *   │ [search ─────────────────────] │    │ Parent line  [Site / Area /…▾]│
 *   │ ▢ Cell-01    Site / Area / L1  │    │ Cell name    [Cell-04]        │
 *   │ ▣ Cell-02    Site / Area / L1  │    │ Cycle (s)    [12]    optional │
 *   │ ▢ Cell-03    Site / Area / L2  │    │                  [Create cell]│
 *   │            [Continue →]         │    └───────────────────────────────┘
 *   └────────────────────────────────┘
 *
 * On a successful pick or create, calls `onSelected(cellId, source)` so
 * the parent page can hand off to `OnboardingWizard`.
 */

import { useMemo, useState } from "react";
import { Badge, Button, Card, Hairline, Icons, NativeSelect } from "../../components/ui";
import { type HierarchyTree, useCreateCell, useHierarchyTree } from "../../lib/hierarchy";

const labelClass = "text-xs font-medium text-muted-foreground";
const inputClass =
    "h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
    "disabled:cursor-not-allowed disabled:opacity-60";

type Mode = "pick" | "create";

export interface EquipmentBootstrapProps {
    onSelected: (cellId: number, source: "existing" | "created") => void;
}

// ─── Flat, denormalised projections of the hierarchy ────────────────────

interface FlatLine {
    id: number;
    name: string;
    path: string; // "Site / Area / Line"
    disabled: boolean;
}

interface FlatCell {
    id: number;
    name: string;
    path: string; // "Site / Area / Line"
    disabled: boolean;
}

function flattenTree(tree: HierarchyTree | undefined): {
    lines: FlatLine[];
    cells: FlatCell[];
} {
    const lines: FlatLine[] = [];
    const cells: FlatCell[] = [];
    if (!tree) return { lines, cells };
    for (const e of tree) {
        for (const s of e.sites) {
            for (const a of s.areas) {
                for (const l of a.lines) {
                    const path = `${s.name} / ${a.name} / ${l.name}`;
                    lines.push({
                        id: l.id,
                        name: l.name,
                        path,
                        disabled: Boolean(l.disabled),
                    });
                    for (const c of l.cells) {
                        cells.push({
                            id: c.id,
                            name: c.name,
                            path,
                            disabled: Boolean(c.disabled),
                        });
                    }
                }
            }
        }
    }
    return { lines, cells };
}

export function EquipmentBootstrap({ onSelected }: EquipmentBootstrapProps) {
    const [mode, setMode] = useState<Mode>("pick");
    const tree = useHierarchyTree();
    const flat = useMemo(() => flattenTree(tree.data), [tree.data]);
    const isEmpty = !tree.isLoading && flat.lines.length === 0 && flat.cells.length === 0;
    const noLines = !tree.isLoading && flat.lines.length === 0;

    // If the user lands on "pick" but there are no existing cells (and at
    // least one line), default to "create". Conversely, if they pick
    // "create" with no lines, fall back to "pick".
    const effectiveMode: Mode =
        mode === "pick" && flat.cells.length === 0 && flat.lines.length > 0
            ? "create"
            : mode === "create" && noLines
              ? "pick"
              : mode;

    return (
        <Card padding="md" className="space-y-4">
            <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                    <h3 className="text-base font-medium tracking-[-0.02em] text-foreground">
                        Choose where ARIA will start
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Onboard an existing cell from your plant hierarchy, or add a brand-new cell
                        under an existing line.
                    </p>
                </div>
                <Badge variant="default" size="sm">
                    Step 1 · Select cell
                </Badge>
            </div>

            <ModeTabs
                mode={effectiveMode}
                onChange={setMode}
                disabled={isEmpty}
                pickDisabled={flat.cells.length === 0}
                createDisabled={noLines}
            />

            <Hairline />

            {tree.isLoading && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                    Loading plant hierarchy…
                </p>
            )}
            {tree.isError && (
                <p className="py-6 text-center text-sm text-destructive">
                    Couldn't load the plant hierarchy. Refresh and try again.
                </p>
            )}

            {!tree.isLoading && !tree.isError && isEmpty && <EmptyHierarchyState />}

            {!tree.isLoading && !tree.isError && !isEmpty && effectiveMode === "pick" && (
                <PickExistingCell cells={flat.cells} onPick={(id) => onSelected(id, "existing")} />
            )}
            {!tree.isLoading && !tree.isError && !isEmpty && effectiveMode === "create" && (
                <CreateNewCell lines={flat.lines} onCreated={(id) => onSelected(id, "created")} />
            )}
        </Card>
    );
}

// ─── Mode toggle ────────────────────────────────────────────────────────

function ModeTabs({
    mode,
    onChange,
    disabled,
    pickDisabled,
    createDisabled,
}: {
    mode: Mode;
    onChange: (m: Mode) => void;
    disabled?: boolean;
    pickDisabled?: boolean;
    createDisabled?: boolean;
}) {
    const Tab = ({
        value,
        label,
        tabDisabled,
    }: {
        value: Mode;
        label: string;
        tabDisabled?: boolean;
    }) => {
        const active = value === mode;
        return (
            <button
                type="button"
                onClick={() => onChange(value)}
                disabled={disabled || tabDisabled}
                aria-pressed={active}
                className={[
                    "inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium transition-colors duration-150",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    active
                        ? "border-primary bg-accent-soft text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                ].join(" ")}
            >
                {label}
            </button>
        );
    };
    return (
        <div role="tablist" aria-label="Cell source" className="flex gap-2">
            <Tab value="pick" label="Pick existing cell" tabDisabled={pickDisabled} />
            <Tab value="create" label="Create new cell" tabDisabled={createDisabled} />
        </div>
    );
}

function EmptyHierarchyState() {
    return (
        <div className="rounded-md border border-dashed border-border bg-sidebar/40 p-4 text-sm">
            <p className="font-medium text-foreground">No plant hierarchy yet.</p>
            <p className="mt-1 text-muted-foreground">
                Ask an admin to seed an enterprise, site, area and line first. Once at least one
                line exists you can add cells here.
            </p>
        </div>
    );
}

// ─── Pick existing cell ─────────────────────────────────────────────────

function PickExistingCell({
    cells,
    onPick,
}: {
    cells: FlatCell[];
    onPick: (cellId: number) => void;
}) {
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<number | null>(null);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return cells;
        return cells.filter(
            (c) => c.name.toLowerCase().includes(q) || c.path.toLowerCase().includes(q),
        );
    }, [search, cells]);

    return (
        <div className="space-y-3">
            <div className="relative">
                <Icons.Search
                    className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-text-tertiary"
                    aria-hidden
                />
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by cell name, line, area or site"
                    className={`${inputClass} pl-8`}
                />
            </div>

            <div className="max-h-[320px] overflow-y-auto rounded-md border border-border bg-sidebar/40">
                {filtered.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                        No cells match &ldquo;{search}&rdquo;.
                    </p>
                ) : (
                    <ul className="divide-y divide-border">
                        {filtered.map((c) => {
                            const isSelected = selected === c.id;
                            const disabled = c.disabled;
                            return (
                                <li key={c.id}>
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => setSelected(c.id)}
                                        aria-pressed={isSelected}
                                        className={[
                                            "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                            isSelected
                                                ? "bg-accent-soft text-primary"
                                                : "text-foreground hover:bg-accent",
                                            disabled ? "cursor-not-allowed opacity-60" : "",
                                        ].join(" ")}
                                    >
                                        <Icons.Cpu
                                            className="size-4 flex-none text-text-tertiary"
                                            aria-hidden
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium">
                                                {c.name}
                                            </div>
                                            <div className="truncate text-[11px] text-muted-foreground">
                                                {c.path}
                                            </div>
                                        </div>
                                        {disabled && (
                                            <Badge variant="default" size="sm">
                                                disabled
                                            </Badge>
                                        )}
                                        {isSelected && (
                                            <Icons.Check
                                                className="size-4 flex-none text-primary"
                                                aria-hidden
                                            />
                                        )}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-xs text-muted-foreground">
                    {filtered.length} of {cells.length} cell{cells.length === 1 ? "" : "s"}
                </span>
                <Button
                    type="button"
                    variant="default"
                    size="md"
                    disabled={selected == null}
                    onClick={() => selected != null && onPick(selected)}
                >
                    <span>Continue</span>
                    <Icons.ArrowRight className="size-4" aria-hidden />
                </Button>
            </div>
        </div>
    );
}

// ─── Create new cell under existing line ────────────────────────────────

function CreateNewCell({
    lines,
    onCreated,
}: {
    lines: FlatLine[];
    onCreated: (cellId: number) => void;
}) {
    const enabledLines = useMemo(() => lines.filter((l) => !l.disabled), [lines]);
    const [parentLineId, setParentLineId] = useState<number | null>(
        enabledLines.length === 1 ? enabledLines[0].id : null,
    );
    const [name, setName] = useState("");
    const [cycleStr, setCycleStr] = useState("");

    const createMutation = useCreateCell();

    const trimmedName = name.trim();
    const cycleParsed = parseOptionalFloat(cycleStr);
    const cycleInvalid = cycleStr.length > 0 && cycleParsed == null;
    const canSubmit =
        parentLineId != null &&
        trimmedName.length > 0 &&
        !cycleInvalid &&
        !createMutation.isPending;

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit || parentLineId == null) return;
        createMutation.mutate(
            {
                name: trimmedName,
                parentid: parentLineId,
                ideal_cycle_time_seconds: cycleParsed ?? undefined,
            },
            {
                onSuccess: (cell) => {
                    onCreated(cell.id);
                },
            },
        );
    };

    const errorMessage =
        createMutation.isError && createMutation.error instanceof Error
            ? createMutation.error.message
            : createMutation.isError
              ? "Couldn't create the cell."
              : null;

    return (
        <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)] sm:items-end">
                <div className="flex flex-col gap-1.5">
                    <label className={labelClass} htmlFor="cell-line">
                        Parent line
                    </label>
                    <NativeSelect
                        id="cell-line"
                        value={parentLineId ?? ""}
                        onChange={(e) => {
                            const v = e.target.value;
                            setParentLineId(v === "" ? null : Number(v));
                        }}
                        className={inputClass}
                        required
                    >
                        <option value="" disabled>
                            Select a line…
                        </option>
                        {enabledLines.map((l) => (
                            <option key={l.id} value={l.id}>
                                {l.path}
                            </option>
                        ))}
                    </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className={labelClass} htmlFor="cell-name">
                        Cell name
                    </label>
                    <input
                        id="cell-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={45}
                        placeholder="e.g. Cell-04"
                        className={inputClass}
                        required
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className={labelClass} htmlFor="cell-cycle">
                        Cycle time (s)
                        <span className="ml-1 text-text-tertiary">opt.</span>
                    </label>
                    <input
                        id="cell-cycle"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.1"
                        value={cycleStr}
                        onChange={(e) => setCycleStr(e.target.value)}
                        placeholder="e.g. 12"
                        aria-invalid={cycleInvalid || undefined}
                        className={inputClass}
                    />
                </div>
            </div>

            {cycleInvalid && (
                <p className="text-xs text-destructive">
                    Cycle time must be a positive number, or empty.
                </p>
            )}
            {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

            <div className="flex items-center justify-end gap-2">
                <Button type="submit" variant="default" size="md" disabled={!canSubmit}>
                    {createMutation.isPending ? "Creating…" : "Create cell"}
                    <Icons.ArrowRight className="size-4" aria-hidden />
                </Button>
            </div>
        </form>
    );
}

function parseOptionalFloat(s: string): number | null {
    if (s.trim().length === 0) return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
}
