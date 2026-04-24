/**
 * OnboardingPage — Scene 1 entry point.
 *
 * Two phases:
 *   1. **Bootstrap** — pick an existing cell from the live ISA-95 tree,
 *      OR create a new cell under an existing line (full backend CRUD,
 *      no hardcoded IDs).
 *   2. **Wizard** — once a cell is chosen, hand off to `OnboardingWizard`
 *      (Upload → Parse → Calibrate → Ready).
 *
 * The optional `:session_id` URL segment is preserved for deep-linkable
 * bookmarks; when present the page assumes the cell is implied by the
 * existing session and jumps straight into the wizard with a placeholder
 * cellId of `0` until the live wizard reads its session state.
 */

import { useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Hairline, Icons, SectionHeader } from "../components/ui";
import { EquipmentBootstrap, OnboardingWizard } from "../features/onboarding";
import { useHierarchyTree } from "../lib/hierarchy";

export default function OnboardingPage() {
    const { session_id: sessionId } = useParams<{ session_id: string }>();
    const [cellId, setCellId] = useState<number | null>(null);
    const [origin, setOrigin] = useState<"existing" | "created" | null>(null);

    // Hydrate the cell name lazily from the tree so the header is informative
    // without a second round-trip.
    const tree = useHierarchyTree();
    const cellSummary = (() => {
        if (cellId == null) return null;
        for (const e of tree.data ?? []) {
            for (const s of e.sites) {
                for (const a of s.areas) {
                    for (const l of a.lines) {
                        for (const c of l.cells) {
                            if (c.id === cellId) {
                                return { name: c.name, line: l.name, area: a.name };
                            }
                        }
                    }
                }
            }
        }
        return null;
    })();

    const handleSelected = (id: number, source: "existing" | "created") => {
        setCellId(id);
        setOrigin(source);
    };

    const handleReset = () => {
        setCellId(null);
        setOrigin(null);
    };

    return (
        <div className="min-h-full flex flex-col bg-background">
            <main className="flex flex-1 items-start justify-center px-6 py-10">
                <div className="w-full max-w-4xl space-y-6">
                    <SectionHeader
                        label="Enrol equipment"
                        size="lg"
                        meta={
                            <span>
                                {cellSummary
                                    ? `${cellSummary.area} / ${cellSummary.line} / ${cellSummary.name}`
                                    : "Plant hierarchy"}
                                {sessionId ? ` · session ${sessionId.slice(0, 8)}` : ""}
                            </span>
                        }
                    />
                    <p className="text-sm text-muted-foreground">
                        Upload the equipment manual as a PDF. KB Builder extracts thresholds,
                        failure patterns and maintenance procedures, then asks a few calibration
                        questions before ARIA starts monitoring.
                    </p>

                    <Hairline />

                    {cellId == null ? (
                        <EquipmentBootstrap onSelected={handleSelected} />
                    ) : (
                        <div className="space-y-4">
                            <SelectedCellBanner
                                summary={cellSummary}
                                origin={origin}
                                onChange={handleReset}
                            />
                            <OnboardingWizard cellId={cellId} />
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}

interface CellSummary {
    name: string;
    line: string;
    area: string;
}

function SelectedCellBanner({
    summary,
    origin,
    onChange,
}: {
    summary: CellSummary | null;
    origin: "existing" | "created" | null;
    onChange: () => void;
}) {
    return (
        <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
            <Icons.Check className="size-4 text-success" aria-hidden />
            <div className="min-w-0 flex-1">
                <div className="truncate text-foreground">
                    {summary
                        ? `${summary.area} / ${summary.line} / ${summary.name}`
                        : "Cell selected"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                    {origin === "created"
                        ? "Just created — KB Builder will calibrate it now."
                        : "Existing cell — KB Builder will refresh its calibration."}
                </div>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={onChange}>
                Change
            </Button>
        </div>
    );
}
