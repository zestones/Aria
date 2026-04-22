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
            <div className="max-w-6xl mx-auto px-8 py-10 space-y-12">
                {/* Page header — the editorial industrial vibe, stated */}
                <header className="space-y-4">
                    <div className="flex items-center gap-3">
                        <AriaMark size={24} className="text-[var(--ds-accent)]" />
                        <span
                            className="font-mono text-[11px] tracking-[0.08em] uppercase"
                            style={{ color: "var(--ds-fg-subtle)" }}
                        >
                            ARIA / DESIGN SYSTEM
                        </span>
                    </div>
                    <h1 className="text-[clamp(28px,3vw,40px)] font-semibold tracking-[-0.02em] leading-[1.05]">
                        Editorial industrial telemetry — v1
                    </h1>
                    <p className="text-sm max-w-2xl" style={{ color: "var(--ds-fg-muted)" }}>
                        Hybrid of modern-design editorial rigor and industrial-brutalist-ui tactical
                        telemetry, adapted for a data-dense control-room app. See DESIGN_PLAN.md for
                        the full visual law.
                    </p>
                    <MetaStrip
                        items={[
                            { label: "REV", value: "2026.04.22" },
                            { label: "UNIT", value: "D-02" },
                            { label: "BUILD", value: "M6.2" },
                        ]}
                    />
                </header>

                <Hairline label="Brand mark" />

                <section>
                    <div className="flex items-end gap-10 flex-wrap">
                        <AriaMark size={16} className="text-[var(--ds-fg-muted)]" />
                        <AriaMark size={24} className="text-[var(--ds-accent)]" />
                        <AriaMark size={40} className="text-[var(--ds-accent)]" />
                        <AriaMark size={64} className="text-[var(--ds-accent)]" />
                    </div>
                </section>

                <Hairline label="Tokens" />

                <SectionHeader label="Surface" bracketed marker="§2.1" />
                <Palette
                    swatches={[
                        ["bg-base", "var(--ds-bg-base)"],
                        ["bg-surface", "var(--ds-bg-surface)"],
                        ["bg-elevated", "var(--ds-bg-elevated)"],
                        ["border", "var(--ds-border)"],
                        ["border-strong", "var(--ds-border-strong)"],
                    ]}
                />

                <SectionHeader label="Text" bracketed marker="§2.2" />
                <Palette
                    swatches={[
                        ["fg-primary", "var(--ds-fg-primary)"],
                        ["fg-muted", "var(--ds-fg-muted)"],
                        ["fg-subtle", "var(--ds-fg-subtle)"],
                    ]}
                />

                <SectionHeader label="Accent & status" bracketed marker="§2.3" />
                <Palette
                    swatches={[
                        ["accent", "var(--ds-accent)"],
                        ["accent-hover", "var(--ds-accent-hover)"],
                        ["nominal", "var(--ds-status-nominal)"],
                        ["warning", "var(--ds-status-warning)"],
                        ["critical", "var(--ds-status-critical)"],
                    ]}
                />

                <SectionHeader label="Agents" bracketed marker="§2.4" />
                <Palette
                    swatches={[
                        ["sentinel", "var(--ds-agent-sentinel)"],
                        ["investigator", "var(--ds-agent-investigator)"],
                        ["kb-builder", "var(--ds-agent-kb-builder)"],
                        ["work-order", "var(--ds-agent-work-order)"],
                        ["qa", "var(--ds-agent-qa)"],
                    ]}
                />

                <Hairline label="Typography" />

                <section className="space-y-4">
                    <p className="font-sans text-[clamp(24px,2vw,28px)] font-semibold leading-[1.05] tracking-[-0.015em]">
                        Inter — section header, tracking −0.015em
                    </p>
                    <p className="font-sans text-base leading-[1.5]">
                        Inter body — default reading size, 14px, line-height 1.5. The quick brown
                        fox jumps over the lazy dog.
                    </p>
                    <p
                        className="font-mono text-[13px] leading-[1.35] tracking-[0.02em]"
                        style={{ color: "var(--ds-fg-muted)" }}
                    >
                        JetBrains Mono — data · vibration 3.42 mm/s · OEE 74.2%
                    </p>
                    <p
                        className="font-mono text-[11px] tracking-[0.08em] uppercase"
                        style={{ color: "var(--ds-fg-subtle)" }}
                    >
                        micro-label · +0.08em · uppercase · signature
                    </p>
                </section>

                <Hairline label="Primitives" />

                <SectionHeader label="Button" marker="01" />
                <div className="flex items-center gap-3 flex-wrap">
                    <Button>Default</Button>
                    <Button variant="accent">Accent</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="danger">Danger</Button>
                    <Button disabled>Disabled</Button>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <Button size="sm">Small</Button>
                    <Button size="md">Medium</Button>
                    <Button size="lg">Large</Button>
                    <Button variant="accent">
                        <Icons.Play className="size-4" /> Replay scenario
                    </Button>
                </div>

                <SectionHeader label="Card — with status rails" marker="02" />
                <div className="grid grid-cols-2 gap-4">
                    <Card rail="nominal">
                        <CardHeader>
                            <SectionHeader
                                label="Pump / P-02"
                                meta={
                                    <MetaStrip
                                        items={[
                                            { label: "CELL", value: "02" },
                                            { label: "SIG", value: "vib" },
                                        ]}
                                    />
                                }
                            />
                            <CardTitle className="mt-1">Grundfos CR 32-120</CardTitle>
                            <CardDescription>Site Guedila</CardDescription>
                        </CardHeader>
                        <p className="text-sm text-[var(--ds-fg-muted)]">
                            Vibration threshold calibrated from operator feedback (2.8 mm/s vs
                            constructor 4.5).
                        </p>
                    </Card>
                    <Card rail="critical" elevated>
                        <CardHeader>
                            <SectionHeader
                                label="Pump / P-04"
                                accent
                                meta={
                                    <MetaStrip
                                        items={[
                                            { label: "CELL", value: "04" },
                                            { label: "SIG", value: "temp" },
                                        ]}
                                    />
                                }
                            />
                            <CardTitle className="mt-1">Temperature spike</CardTitle>
                            <CardDescription>Detected 00:42 ago</CardDescription>
                        </CardHeader>
                        <p className="text-sm text-[var(--ds-fg-muted)]">
                            Rail pulses on critical — silent on nominal. Signals: temperature 84°C
                            &gt; 72°C (+17%).
                        </p>
                    </Card>
                </div>

                <SectionHeader label="Badge" marker="03" />
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge>default</Badge>
                    <Badge variant="accent">accent</Badge>
                    <Badge variant="nominal">nominal</Badge>
                    <Badge variant="warning">warning</Badge>
                    <Badge variant="critical">critical</Badge>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
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
                <div className="flex items-center gap-2 flex-wrap">
                    {agents.map((a) => (
                        <Badge key={a.id} tag variant="agent" agent={a.id}>
                            {a.label}
                        </Badge>
                    ))}
                </div>

                <SectionHeader label="StatusDot" marker="04" />
                <div className="flex items-center gap-6 flex-wrap text-sm">
                    {statuses.map((s) => (
                        <div
                            key={s}
                            className="flex items-center gap-2"
                            style={{ color: "var(--ds-fg-muted)" }}
                        >
                            <StatusDot status={s} />
                            <span>{s}</span>
                        </div>
                    ))}
                    <div
                        className="flex items-center gap-2"
                        style={{ color: "var(--ds-fg-muted)" }}
                    >
                        <StatusDot status="critical" pulse />
                        <span>critical · pulse</span>
                    </div>
                </div>

                <SectionHeader label="KbdKey" marker="05" />
                <div
                    className="flex items-center gap-2 text-sm"
                    style={{ color: "var(--ds-fg-muted)" }}
                >
                    <span>Toggle chat drawer</span>
                    <KbdKey>⌘</KbdKey>
                    <KbdKey>K</KbdKey>
                </div>

                <SectionHeader label="Tabs — accent bottom rail" marker="06" />
                <Tabs defaultValue="thinking">
                    <TabsList>
                        <TabsTrigger value="thinking">Thinking</TabsTrigger>
                        <TabsTrigger value="tools">Tools used</TabsTrigger>
                        <TabsTrigger value="io">Inputs · outputs</TabsTrigger>
                        <TabsTrigger value="memory">Memory</TabsTrigger>
                    </TabsList>
                    <div className="mt-4">
                        <TabsContent value="thinking">
                            <Card padding="sm" rail="investigator">
                                <p
                                    className="font-mono text-[13px] leading-[1.5]"
                                    style={{ color: "var(--ds-fg-muted)" }}
                                >
                                    The vibration spike at t-4h correlates with the bearing
                                    temperature increase at t-3h30. Both signals deviated from
                                    nominal at…
                                </p>
                            </Card>
                        </TabsContent>
                        <TabsContent value="tools">
                            <Card padding="sm">
                                <p className="text-sm text-[var(--ds-fg-muted)]">
                                    get_signal_trends · get_failure_history · ask_kb_builder ·
                                    submit_rca
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
                        <TabsContent value="memory">
                            <Card padding="sm">
                                <p className="text-sm text-[var(--ds-fg-muted)]">
                                    Failure history entries consulted during this turn.
                                </p>
                            </Card>
                        </TabsContent>
                    </div>
                </Tabs>

                <SectionHeader label="Drawer" marker="07" />
                <Button onClick={() => setDrawerOpen(true)}>Open drawer</Button>
                <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                    <div className="p-4 h-full flex flex-col gap-3">
                        <SectionHeader
                            label="Chat / ARIA"
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
                        <p className="text-sm" style={{ color: "var(--ds-fg-muted)" }}>
                            Placeholder drawer — the real chat panel lands in M6.5.
                        </p>
                    </div>
                </Drawer>

                <Hairline label="Motion" />

                <div className="grid grid-cols-3 gap-3">
                    <MotionDemo label="fadeInUp" variants={Motion.fadeInUp} />
                    <MotionDemo label="artifactReveal" variants={Motion.artifactReveal} />
                    <MotionDemo label="handoffSweep" variants={Motion.handoffSweep} />
                </div>

                <Hairline weight={2} />

                <footer className="flex items-baseline justify-between">
                    <p
                        className="font-mono text-[11px] tracking-[0.08em] uppercase"
                        style={{ color: "var(--ds-fg-subtle)" }}
                    >
                        END / DESIGN SYSTEM
                    </p>
                    <MetaStrip
                        items={[
                            { label: "M6.2", value: "identity pass" },
                            { label: "PR", value: "#66" },
                        ]}
                    />
                </footer>
            </div>
        </div>
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
                    <div
                        className="mt-1.5 font-mono text-[11px] tracking-[0.05em] uppercase"
                        style={{ color: "var(--ds-fg-muted)" }}
                    >
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
                    className="h-16 rounded-[var(--ds-radius-xs)] border flex items-center justify-center font-mono text-[11px] tracking-[0.08em] uppercase"
                    style={{
                        backgroundColor: "color-mix(in oklab, var(--ds-accent), transparent 88%)",
                        borderColor: "color-mix(in oklab, var(--ds-accent), transparent 60%)",
                        color: "var(--ds-accent)",
                    }}
                >
                    {label}
                </motion.div>
            </Card>
            <button
                type="button"
                onClick={() => setKey((k) => k + 1)}
                className="mt-1.5 font-mono text-[11px] tracking-[0.08em] uppercase hover:text-[var(--ds-fg-muted)]"
                style={{ color: "var(--ds-fg-subtle)" }}
            >
                replay →
            </button>
        </div>
    );
}
