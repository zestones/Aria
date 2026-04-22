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
    Icons,
    KbdKey,
    Motion,
    type Status,
    StatusDot,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "../design-system";

const agents: { id: AgentId; label: string }[] = [
    { id: "sentinel", label: "Sentinel" },
    { id: "investigator", label: "Investigator" },
    { id: "kb_builder", label: "KB Builder" },
    { id: "work_order", label: "Work Order Gen" },
    { id: "qa", label: "Q&A" },
];

const statuses: Status[] = ["nominal", "warning", "critical", "unknown"];

export default function DesignPage() {
    const [drawerOpen, setDrawerOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[var(--ds-bg-base)] text-[var(--ds-fg-primary)] font-sans">
            <div className="max-w-5xl mx-auto px-8 py-10 space-y-10">
                <header>
                    <div className="flex items-center gap-3">
                        <AriaMark className="size-6 text-[var(--ds-accent)]" />
                        <h1 className="text-2xl font-semibold tracking-tight">
                            ARIA Design System
                        </h1>
                    </div>
                    <p className="text-sm text-[var(--ds-fg-muted)] mt-1">
                        Dark-only industrial control-room primitives. M6.2 reference route.
                    </p>
                </header>

                {/* Mark */}
                <Section title="Brand mark">
                    <div className="flex items-end gap-8">
                        <AriaMark size={16} className="text-[var(--ds-fg-muted)]" />
                        <AriaMark size={24} className="text-[var(--ds-accent)]" />
                        <AriaMark size={40} className="text-[var(--ds-accent)]" />
                        <AriaMark size={64} className="text-[var(--ds-accent)]" />
                    </div>
                </Section>

                {/* Tokens */}
                <Section title="Tokens · Surface">
                    <Palette
                        swatches={[
                            ["bg-base", "var(--ds-bg-base)"],
                            ["bg-surface", "var(--ds-bg-surface)"],
                            ["bg-elevated", "var(--ds-bg-elevated)"],
                            ["border", "var(--ds-border)"],
                            ["border-strong", "var(--ds-border-strong)"],
                        ]}
                    />
                </Section>

                <Section title="Tokens · Text">
                    <Palette
                        swatches={[
                            ["fg-primary", "var(--ds-fg-primary)"],
                            ["fg-muted", "var(--ds-fg-muted)"],
                            ["fg-subtle", "var(--ds-fg-subtle)"],
                        ]}
                    />
                </Section>

                <Section title="Tokens · Accent & status">
                    <Palette
                        swatches={[
                            ["accent", "var(--ds-accent)"],
                            ["accent-hover", "var(--ds-accent-hover)"],
                            ["nominal", "var(--ds-status-nominal)"],
                            ["warning", "var(--ds-status-warning)"],
                            ["critical", "var(--ds-status-critical)"],
                        ]}
                    />
                </Section>

                <Section title="Tokens · Agents">
                    <Palette
                        swatches={[
                            ["sentinel", "var(--ds-agent-sentinel)"],
                            ["investigator", "var(--ds-agent-investigator)"],
                            ["kb-builder", "var(--ds-agent-kb-builder)"],
                            ["work-order", "var(--ds-agent-work-order)"],
                            ["qa", "var(--ds-agent-qa)"],
                        ]}
                    />
                </Section>

                {/* Typography */}
                <Section title="Typography">
                    <div className="space-y-3">
                        <p className="font-sans text-2xl">Sans · Inter — The quick brown fox</p>
                        <p className="font-mono text-sm text-[var(--ds-fg-muted)]">
                            Mono · JetBrains Mono — OEE 74.2% · MTBF 1842h · vibration 3.42 mm/s
                        </p>
                    </div>
                </Section>

                {/* Button */}
                <Section title="Button">
                    <div className="flex items-center gap-3 flex-wrap">
                        <Button>Default</Button>
                        <Button variant="accent">Accent</Button>
                        <Button variant="ghost">Ghost</Button>
                        <Button variant="danger">Danger</Button>
                        <Button disabled>Disabled</Button>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap mt-3">
                        <Button size="sm">Small</Button>
                        <Button size="md">Medium</Button>
                        <Button size="lg">Large</Button>
                        <Button variant="accent">
                            <Icons.Play className="size-4" /> Replay scenario
                        </Button>
                    </div>
                </Section>

                {/* Card */}
                <Section title="Card">
                    <div className="grid grid-cols-2 gap-4">
                        <Card>
                            <CardHeader>
                                <CardTitle>Pump P-02</CardTitle>
                                <CardDescription>Grundfos CR 32-120 · Site Guedila</CardDescription>
                            </CardHeader>
                            <p className="text-sm text-[var(--ds-fg-muted)]">
                                Vibration threshold calibrated from operator feedback (2.8 mm/s vs
                                constructor 4.5).
                            </p>
                        </Card>
                        <Card elevated>
                            <CardHeader>
                                <CardTitle>Elevated card</CardTitle>
                                <CardDescription>For overlays and chat artifacts.</CardDescription>
                            </CardHeader>
                            <p className="text-sm text-[var(--ds-fg-muted)]">
                                Uses{" "}
                                <code className="font-mono text-[var(--ds-accent)]">
                                    bg-elevated
                                </code>{" "}
                                surface.
                            </p>
                        </Card>
                    </div>
                </Section>

                {/* Badge */}
                <Section title="Badge">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge>default</Badge>
                        <Badge variant="accent">accent</Badge>
                        <Badge variant="nominal">nominal</Badge>
                        <Badge variant="warning">warning</Badge>
                        <Badge variant="critical">critical</Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-3">
                        <Badge tag variant="accent">
                            Monitored
                        </Badge>
                        <Badge tag variant="nominal">
                            Running
                        </Badge>
                        <Badge tag variant="warning">
                            Drift detected
                        </Badge>
                        <Badge tag variant="critical">
                            Alarm
                        </Badge>
                        <Badge tag>Idle</Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-3">
                        {agents.map((a) => (
                            <Badge key={a.id} variant="agent" agent={a.id}>
                                {a.label}
                            </Badge>
                        ))}
                    </div>
                </Section>

                {/* StatusDot */}
                <Section title="StatusDot">
                    <div className="flex items-center gap-6 flex-wrap">
                        {statuses.map((s) => (
                            <div key={s} className="flex items-center gap-2 text-sm">
                                <StatusDot status={s} />
                                <span className="text-[var(--ds-fg-muted)]">{s}</span>
                            </div>
                        ))}
                        <div className="flex items-center gap-2 text-sm">
                            <StatusDot status="critical" pulse />
                            <span className="text-[var(--ds-fg-muted)]">critical · pulse</span>
                        </div>
                    </div>
                </Section>

                {/* KbdKey */}
                <Section title="KbdKey">
                    <div className="flex items-center gap-2 text-sm text-[var(--ds-fg-muted)]">
                        <span>Toggle chat drawer</span>
                        <KbdKey>⌘</KbdKey>
                        <KbdKey>K</KbdKey>
                    </div>
                </Section>

                {/* Tabs */}
                <Section title="Tabs">
                    <Tabs defaultValue="thinking">
                        <TabsList>
                            <TabsTrigger value="thinking">Thinking</TabsTrigger>
                            <TabsTrigger value="tools">Tools used</TabsTrigger>
                            <TabsTrigger value="io">Inputs &amp; outputs</TabsTrigger>
                        </TabsList>
                        <div className="mt-3">
                            <TabsContent value="thinking">
                                <Card padding="sm">
                                    <p className="font-mono text-xs text-[var(--ds-fg-muted)]">
                                        The vibration spike at t-4h correlates with the bearing
                                        temperature increase...
                                    </p>
                                </Card>
                            </TabsContent>
                            <TabsContent value="tools">
                                <Card padding="sm">
                                    <p className="text-sm text-[var(--ds-fg-muted)]">
                                        get_signal_trends · get_failure_history · ask_kb_builder
                                    </p>
                                </Card>
                            </TabsContent>
                            <TabsContent value="io">
                                <Card padding="sm">
                                    <p className="text-sm text-[var(--ds-fg-muted)]">
                                        Raw JSON inputs/outputs dev view.
                                    </p>
                                </Card>
                            </TabsContent>
                        </div>
                    </Tabs>
                </Section>

                {/* Drawer */}
                <Section title="Drawer">
                    <Button onClick={() => setDrawerOpen(true)}>Open right drawer</Button>
                    <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                        <div className="p-4 h-full flex flex-col gap-3">
                            <div className="flex items-center justify-between">
                                <h2 className="font-semibold text-[var(--ds-fg-primary)]">
                                    Chat ARIA
                                </h2>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDrawerOpen(false)}
                                >
                                    <Icons.X className="size-4" />
                                </Button>
                            </div>
                            <p className="text-sm text-[var(--ds-fg-muted)]">
                                Placeholder drawer — the real chat panel lands in M6.5.
                            </p>
                        </div>
                    </Drawer>
                </Section>

                {/* Motion */}
                <Section title="Motion variants">
                    <div className="grid grid-cols-3 gap-3">
                        <MotionDemo label="fadeInUp" variants={Motion.fadeInUp} />
                        <MotionDemo label="artifactReveal" variants={Motion.artifactReveal} />
                        <MotionDemo label="handoffSweep" variants={Motion.handoffSweep} />
                    </div>
                </Section>

                <footer className="pt-6 text-xs text-[var(--ds-fg-subtle)]">
                    Tokens, primitives, motion · M6.2 · dark-only for v1
                </footer>
            </div>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h2 className="text-xs font-mono uppercase tracking-wider text-[var(--ds-fg-subtle)]">
                {title}
            </h2>
            {children}
        </section>
    );
}

function Palette({ swatches }: { swatches: [string, string][] }) {
    return (
        <div className="grid grid-cols-5 gap-3">
            {swatches.map(([name, color]) => (
                <div key={name}>
                    <div
                        className="h-14 rounded-[var(--ds-radius-md)] border border-[var(--ds-border)]"
                        style={{ backgroundColor: color }}
                    />
                    <div className="mt-1.5 text-[11px] font-mono text-[var(--ds-fg-muted)]">
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
                    className="h-16 rounded-[var(--ds-radius-sm)] bg-[var(--ds-accent)]/10 border border-[var(--ds-accent)]/30 flex items-center justify-center text-xs font-mono text-[var(--ds-accent)]"
                >
                    {label}
                </motion.div>
            </Card>
            <button
                type="button"
                onClick={() => setKey((k) => k + 1)}
                className="mt-1.5 text-[11px] font-mono text-[var(--ds-fg-subtle)] hover:text-[var(--ds-fg-muted)]"
            >
                replay →
            </button>
        </div>
    );
}
