import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { Card, Hairline, Icons, SectionHeader } from "../../design-system";

/**
 * Minimal node descriptor surfaced by the diagram when a node is clicked.
 * Live signals / KB / WO data lands in M8.x — this is the shell only.
 */
export interface InspectorNode {
    id: string;
    kind: string;
    label: string;
    /**
     * Optional human-readable caption shown under the label (e.g. parent line
     * name). When absent, no caption is rendered — we deliberately avoid the
     * `kind · id` fallback which reads as "cell · cell:3" for generic cells.
     */
    subLabel?: string;
}

export interface EquipmentInspectorProps {
    open: boolean;
    node: InspectorNode | null;
    onClose: () => void;
}

export const INSPECTOR_DRAWER_WIDTH = 320;

/**
 * Left-docked inspector drawer. Positioned `absolute` inside the diagram
 * container (not over the whole app shell). Slides from the left using the
 * existing `drawerSlide` motion variant family — we mirror its easing and
 * duration for consistency, but the x translation is left-handed.
 *
 * Content is placeholder cards until M8.x wires live data. Each section
 * corresponds to a later slot (signals, KB badge, recent work orders).
 */
export function EquipmentInspector({ open, node, onClose }: EquipmentInspectorProps) {
    useEffect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    return (
        <AnimatePresence>
            {open && node && (
                <motion.aside
                    key={node.id}
                    data-testid="equipment-inspector"
                    role="dialog"
                    aria-label={`${node.label} inspector`}
                    className="absolute left-0 top-0 bottom-0 z-20 flex flex-col border-r border-[var(--ds-border)] bg-[var(--ds-bg-surface)]"
                    style={{ width: `${INSPECTOR_DRAWER_WIDTH}px` }}
                    variants={drawerSlideLeft}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                >
                    <header className="flex items-start justify-between gap-3 border-b border-[var(--ds-border)] px-4 py-3">
                        <div className="min-w-0">
                            <SectionHeader label={node.label} size="sm" />
                            {node.subLabel && (
                                <p
                                    className="mt-1 truncate text-[var(--ds-text-xs)]"
                                    style={{ color: "var(--ds-fg-subtle)" }}
                                    title={node.subLabel}
                                >
                                    {node.subLabel}
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close inspector"
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--ds-radius-sm)] text-[var(--ds-fg-muted)] transition-colors duration-[var(--ds-motion-fast)] hover:bg-[var(--ds-bg-hover)] hover:text-[var(--ds-fg-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)]"
                        >
                            <Icons.X className="size-4" />
                        </button>
                    </header>
                    <div className="flex flex-1 flex-col gap-3 overflow-auto p-4">
                        <InspectorSection label="Signals (last 10)">
                            Live data coming in M8.
                        </InspectorSection>
                        <Hairline />
                        <InspectorSection label="Knowledge base">
                            Live data coming in M8.
                        </InspectorSection>
                        <Hairline />
                        <InspectorSection label="Recent work orders">
                            Live data coming in M8.
                        </InspectorSection>
                    </div>
                </motion.aside>
            )}
        </AnimatePresence>
    );
}

const drawerSlideLeft = {
    hidden: { x: "-100%" },
    visible: {
        x: 0,
        transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
    },
    exit: {
        x: "-100%",
        transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
    },
};

interface InspectorSectionProps {
    label: string;
    children: React.ReactNode;
}

function InspectorSection({ label, children }: InspectorSectionProps) {
    return (
        <section>
            <h3
                className="mb-2 text-[var(--ds-text-sm)] font-medium"
                style={{ color: "var(--ds-fg-muted)" }}
            >
                {label}
            </h3>
            <Card padding="md" elevated>
                <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-subtle)]">{children}</p>
            </Card>
        </section>
    );
}
