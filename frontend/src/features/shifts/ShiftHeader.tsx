/**
 * Shift page header — current shift, operator, time remaining.
 *
 * Sits at the top of the Shifts page. Replaces the stale local-clock
 * logic that used to live in `TopBar` by reading `/shifts/current`
 * directly. The same hook is consumed by the TopBar pill, so the two
 * surfaces stay in lock-step.
 */

import { useEffect, useState } from "react";
import { Card, Icons, StatusDot } from "../../components/ui";
import type { CurrentShift } from "../../services/shift";
import { formatShiftRange, formatTimeRemaining, operatorDisplay, pickOperator } from "./utils";

interface ShiftHeaderProps {
    data: CurrentShift | undefined;
    isLoading: boolean;
    isError: boolean;
}

export function ShiftHeader({ data, isLoading, isError }: ShiftHeaderProps) {
    // Tick the "remaining" label once a minute so it counts down without the
    // operator having to refresh.
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
        return () => window.clearInterval(id);
    }, []);

    if (isLoading) {
        return (
            <Card padding="lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icons.Loader2 className="size-4 animate-spin" aria-hidden />
                    Loading current shift…
                </div>
            </Card>
        );
    }

    if (isError || !data) {
        return (
            <Card padding="lg">
                <div className="text-sm text-destructive">
                    Could not load the current shift. The plant clock may be between shifts; try
                    again in a minute.
                </div>
            </Card>
        );
    }

    const shift = data.shift;
    const operator = pickOperator(data.assignments);
    const operatorName = operatorDisplay(data.assignments);
    const remaining = formatTimeRemaining(data, nowMs);

    if (!shift) {
        return (
            <Card padding="lg">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Icons.Clock className="size-4" aria-hidden />
                    No shift is currently active. Rota continues below.
                </div>
            </Card>
        );
    }

    return (
        <Card padding="lg" rail="nominal" railPulse={false}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
                <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        <StatusDot status="nominal" /> Current shift
                    </div>
                    <h2
                        className="text-2xl font-medium tracking-[-0.02em] text-foreground"
                        data-testid="shift-header-name"
                    >
                        {shift.name}
                    </h2>
                    <p className="font-mono text-xs text-muted-foreground">
                        {formatShiftRange(shift)} · {remaining}
                    </p>
                </div>
                <div className="flex min-w-0 flex-col items-start gap-1 text-right sm:items-end">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        Operator on duty
                    </div>
                    <div
                        className="truncate text-lg font-medium tracking-[-0.01em] text-foreground"
                        data-testid="shift-header-operator"
                    >
                        {operatorName}
                    </div>
                    {operator.username && operator.fullName && (
                        <div className="font-mono text-xs text-muted-foreground">
                            @{operator.username}
                        </div>
                    )}
                </div>
            </div>
        </Card>
    );
}
