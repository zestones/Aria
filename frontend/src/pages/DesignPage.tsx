import { motion } from "framer-motion";
import { useState } from "react";
import {
    type AgentId,
    AriaMark,
    Badge,
    Button,
    Card,
    CardDescription,
    CardHeader,
    CardTitle,
    Drawer,
    Hairline,
    Icons,
    KbdKey,
    MetaStrip,
    Motion,
    SectionHeader,
    type Status,
    StatusDot,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    ThemeToggle,
} from "../design-system";

const agents: { id: AgentId; label: string }[] = [
    { id: "sentinel", label: "Sentinel" },
    { id: "investigator", label: "Investigator" },
    { id: "kb_builder", label: "KB Builder" },
    { id: "work_order", label: "Work Order" },
    { id: "qa", label: "QA" },
];

const statuses: Status[] = ["nominal", "warning", "critical", "unknown"];

export default function DesignPage() {
    const [drawerOpen, setDrawerOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[var(--ds-bg-base)] text-[var(--ds-fg-primary)] font-sans">
            <div className="max-w-5xl mx-auto px-8 py-10 space-y-10">
                {/* Page header — operator-calm meta-line */}
                <header className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <AriaMark size={22} />
                            <span className="text-[var(--ds-text-md)] font-semibold tracking-[-0.01em]">
                                ARIA
                            </span>
                            <span className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                                Design system
                            </span>
                        </div>
                        <ThemeToggle />
                    </div>
                    <SectionHeader
                        label="Operator-calm"
                        size="lg"
                        meta={
                            <MetaStrip
                                items={[
                                    { label: "Build", value: "M6.3" },
                                    { value: "Apr 22, 2026" },
                                ]}
                            />
                        }
                    />
                    <p className="max-w-2xl text-[var(--ds-text-base)] text-[var(--ds-fg-muted)]">
                        The v2 design register — dark-first with a real light mode, warm neutrals,
                        one calm product blue. Linear / Vercel / Stripe cousin. See
                        <code className="mx-1 rounded-[var(--ds-radius-sm)] bg-[var(--ds-bg-elevated)] px-1 py-0.5 font-mono text-[12px] text-[var(--ds-fg-primary)]">
                            DESIGN_PLAN_v2.md
                        </code>
                        for the full spec.
                    </p>
                </header>

                <Hairline />

                <section className="space-y-4">
                    <SectionHeader label="Brand mark" size="md" marker="§5.6" />
                    <div className="flex flex-wrap items-end gap-10">
                        <AriaMark size={16} className="text-[var(--ds-fg-muted)]" />
                        <AriaMark size={24} />
                        <AriaMark size={40} />
                        <AriaMark size={64} />
                        <AriaMark size={40} className="text-[var(--ds-accent)]" />
                    </div>
                    <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-subtle)]">
                        Default color is primary fg. Accent tone is opt-in only.
                    </p>
                </section>

                <Hairline />

                <section className="space-y-5">
                    <SectionHeader label="Surface" size="md" marker="§2.1" />
                    <Palette
                        swatches={[
                            ["bg-base", "var(--ds-bg-base)"],
                            ["bg-surface", "var(--ds-bg-surface)"],
                            ["bg-elevated", "var(--ds-bg-elevated)"],
                            ["bg-hover", "var(--ds-bg-hover)"],
                            ["border", "var(--ds-border)"],
                            ["border-strong", "var(--ds-border-strong)"],
                        ]}
                    />
                </section>

                <section className="space-y-5">
                    <SectionHeader label="Text" size="md" marker="§2.1" />
                    <Palette
                        swatches={[
                            ["fg-primary", "var(--ds-fg-primary)"],
                            ["fg-muted", "var(--ds-fg-muted)"],
                            ["fg-subtle", "var(--ds-fg-subtle)"],
                        ]}
                    />
                </section>

                <section className="space-y-5">
                    <SectionHeader label="Accent & status" size="md" marker="§2.2" />
                    <Palette
                        swatches={[
                            ["accent", "var(--ds-accent)"],
                            ["accent-hover", "var(--ds-accent-hover)"],
                            ["nominal", "var(--ds-status-nominal)"],
                            ["warning", "var(--ds-status-warning)"],
                            ["critical", "var(--ds-status-critical)"],
                        ]}
                    />
                </section>

                <section className="space-y-5">
                    <SectionHeader label="Agents" size="md" marker="§2.4" />
                    <Palette
                        swatches={[
                            ["sentinel", "var(--ds-agent-sentinel)"],
                            ["investigator", "var(--ds-agent-investigator)"],
                            ["kb-builder", "var(--ds-agent-kb-builder)"],
                            ["work-order", "var(--ds-agent-work-order)"],
                            ["qa", "var(--ds-agent-qa)"],
                        ]}
                    />
                </section>

                <Hairline />

                <section className="space-y-4">
                    <SectionHeader label="Typography" size="md" marker="§3" />
                    <div className="space-y-3">
                        <p className="text-[var(--ds-text-3xl)] font-bold tracking-[-0.02em] leading-tight">
                            Inter — 30/700. Display only.
                        </p>
                        <p className="text-[var(--ds-text-2xl)] font-semibold tracking-[-0.01em] leading-tight">
                            Inter — 24/600. Page header.
                        </p>
                        <p className="text-[var(--ds-text-xl)] font-semibold leading-tight">
                            Inter — 20/600. Section header.
                        </p>
                        <p className="text-[var(--ds-text-lg)] font-semibold">
                            Inter — 17/600. Card title.
                        </p>
                        <p className="text-[var(--ds-text-md)] font-medium">
                            Inter — 15/500. Primary UI controls.
                        </p>
                        <p className="text-[var(--ds-text-base)]">
                            Inter — 14/400. Default body. The app runs on this.
                        </p>
                        <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                            Inter — 13/400–500. Captions, labels.
                        </p>
                        <p className="text-[var(--ds-text-xs)] text-[var(--ds-fg-subtle)]">
                            Inter — 11/500. Fine print, metadata.
                        </p>
                        <p className="font-mono text-[13px] text-[var(--ds-fg-muted)]">
                            JetBrains Mono — 13. Rare: numerics, kbd, code.
                        </p>
                    </div>
                </section>

                <Hairline />

                <section className="space-y-3">
                    <SectionHeader label="Buttons" size="md" marker="01" />
                    <div className="flex flex-wrap items-center gap-3">
                        <Button>Default</Button>
                        <Button variant="accent">Accent</Button>
                        <Button variant="ghost">Ghost</Button>
                        <Button variant="danger">Danger</Button>
                        <Button disabled>Disabled</Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <Button size="sm">Small</Button>
                        <Button size="md">Medium</Button>
                        <Button size="lg">Large</Button>
                        <Button variant="accent">
                            <Icons.Play className="size-4" />
                            Replay scenario
                        </Button>
                    </div>
                </section>

                <section className="space-y-3">
                    <SectionHeader label="Cards" size="md" marker="02" />
                    <div className="grid grid-cols-2 gap-3">
                        <Card>
                            <CardHeader>
                                <SectionHeader
                                    label="Pump overview"
                                    size="sm"
                                    meta={<span>P-02 · Apr 22</span>}
                                />
                                <CardTitle className="mt-2">Grundfos CR 32-120</CardTitle>
                                <CardDescription>
                                    Vibration calibrated from operator feedback.
                                </CardDescription>
                            </CardHeader>
                            <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                                Nominal read — no rail. Absence is the default state.
                            </p>
                        </Card>
                        <Card rail="critical">
                            <CardHeader>
                                <SectionHeader
                                    label="Temperature spike"
                                    size="sm"
                                    accent
                                    meta={<span>P-04 · 00:42 ago</span>}
                                />
                                <CardTitle className="mt-2">Critical threshold</CardTitle>
                                <CardDescription>
                                    84°C &gt; 72°C (+17%). Rail pulses on critical.
                                </CardDescription>
                            </CardHeader>
                        </Card>
                    </div>
                </section>

                <section className="space-y-3">
                    <SectionHeader label="Badges" size="md" marker="03" />
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge>Default</Badge>
                        <Badge variant="accent">Monitored</Badge>
                        <Badge variant="nominal">Running</Badge>
                        <Badge variant="warning">Drift detected</Badge>
                        <Badge variant="critical">Alarm</Badge>
                        <Badge variant="code">v0.12.4</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {agents.map((a) => (
                            <Badge key={a.id} variant="agent" agent={a.id}>
                                {a.label}
                            </Badge>
                        ))}
                    </div>
                </section>

                <section className="space-y-3">
                    <SectionHeader label="Status" size="md" marker="04" />
                    <div className="flex flex-wrap items-center gap-6 text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                        {statuses.map((s) => (
                            <div key={s} className="flex items-center gap-2">
                                <StatusDot status={s} />
                                <span>{s}</span>
                            </div>
                        ))}
                        <div className="flex items-center gap-2">
                            <StatusDot status="critical" pulse />
                            <span>critical · pulse</span>
                        </div>
                    </div>
                </section>

                <section className="space-y-3">
                    <SectionHeader label="Keyboard keys" size="md" marker="05" />
                    <div className="flex items-center gap-2 text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                        <span>Toggle chat drawer</span>
                        <KbdKey>⌘</KbdKey>
                        <KbdKey>K</KbdKey>
                    </div>
                </section>

                <section className="space-y-3">
                    <SectionHeader
                        label="Tabs"
                        size="md"
                        marker="06"
                        meta={<span>Underline 2px accent</span>}
                    />
                    <Tabs defaultValue="thinking">
                        <TabsList>
                            <TabsTrigger value="thinking">Thinking</TabsTrigger>
                            <TabsTrigger value="tools">Tools used</TabsTrigger>
                            <TabsTrigger value="io">Inputs · outputs</TabsTrigger>
                            <TabsTrigger value="memory">Memory</TabsTrigger>
                        </TabsList>
                        <div className="mt-4">
                            <TabsContent value="thinking">
                                <Card padding="sm">
                                    <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)] leading-relaxed">
                                        The vibration spike at t-4h correlates with the bearing
                                        temperature increase at t-3h30. Both signals deviated from
                                        nominal at…
                                    </p>
                                </Card>
                            </TabsContent>
                            <TabsContent value="tools">
                                <Card padding="sm">
                                    <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                                        get_signal_trends · get_failure_history · ask_kb_builder ·
                                        submit_rca
                                    </p>
                                </Card>
                            </TabsContent>
                            <TabsContent value="io">
                                <Card padding="sm">
                                    <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                                        Raw JSON inputs/outputs dev view.
                                    </p>
                                </Card>
                            </TabsContent>
                            <TabsContent value="memory">
                                <Card padding="sm">
                                    <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                                        Failure history entries consulted during this turn.
                                    </p>
                                </Card>
                            </TabsContent>
                        </div>
                    </Tabs>
                </section>

                <section className="space-y-3">
                    <SectionHeader label="Drawer" size="md" marker="07" />
                    <Button onClick={() => setDrawerOpen(true)}>Open drawer</Button>
                    <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                        <div className="flex h-full flex-col gap-3 p-4">
                            <SectionHeader
                                label="Chat"
                                size="sm"
                                meta={
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setDrawerOpen(false)}
                                    >
                                        <Icons.X className="size-4" />
                                    </Button>
                                }
                            />
                            <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                                Placeholder drawer — the real chat panel lands in M6.5.
                            </p>
                        </div>
                    </Drawer>
                </section>

                <Hairline />

                <section className="space-y-3">
                    <SectionHeader label="Motion" size="md" marker="§6" />
                    <div className="grid grid-cols-3 gap-3">
                        <MotionDemo label="fadeInUp" variants={Motion.fadeInUp} />
                        <MotionDemo label="artifactReveal" variants={Motion.artifactReveal} />
                        <MotionDemo label="handoffSweep" variants={Motion.handoffSweep} />
                    </div>
                </section>

                <Hairline weight={2} />

                <footer className="flex items-baseline justify-between pb-10">
                    <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-subtle)]">
                        End of design system
                    </p>
                    <MetaStrip
                        items={[
                            { label: "Version", value: "v2 · operator-calm" },
                            { label: "PR", value: "#36" },
                        ]}
                    />
                </footer>
            </div>
        </div>
    );
}

function Palette({ swatches }: { swatches: [string, string][] }) {
    return (
        <div className="grid grid-cols-6 gap-3">
            {swatches.map(([name, color]) => (
                <div key={name}>
                    <div
                        className="h-14 rounded-[var(--ds-radius-md)] border border-[var(--ds-border)]"
                        style={{ backgroundColor: color }}
                    />
                    <div className="mt-1.5 text-[var(--ds-text-xs)] text-[var(--ds-fg-muted)]">
                        {name}
                    </div>
                </div>
            ))}
        </div>
    );
}

function MotionDemo({
    label,
    variants,
}: {
    label: string;
    variants: import("framer-motion").Variants;
}) {
    const [key, setKey] = useState(0);
    return (
        <div>
            <Card padding="sm">
                <motion.div
                    key={key}
                    variants={variants}
                    initial="hidden"
                    animate="visible"
                    className="flex h-16 items-center justify-center rounded-[var(--ds-radius-sm)] border text-[var(--ds-text-sm)] font-medium"
                    style={{
                        backgroundColor: "var(--ds-accent-soft)",
                        borderColor: "color-mix(in oklab, var(--ds-accent), transparent 70%)",
                        color: "var(--ds-accent)",
                    }}
                >
                    {label}
                </motion.div>
            </Card>
            <button
                type="button"
                onClick={() => setKey((k) => k + 1)}
                className="mt-1.5 text-[var(--ds-text-sm)] text-[var(--ds-fg-subtle)] hover:text-[var(--ds-fg-muted)]"
            >
                Replay →
            </button>
        </div>
    );
}
