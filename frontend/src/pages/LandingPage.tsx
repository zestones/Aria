/**
 * LandingPage — public marketing + integrated sign-in.
 *
 * This is the first surface a hackathon judge lands on. The design follows
 * the Grandparent Test (see docs/planning/M9-polish-e2e/demo-plant-design.md
 * §0): every label, headline and stat must be understandable to someone
 * who has never been inside a factory.
 *
 * Sections (top → bottom):
 *   1. Sticky nav + theme toggle
 *   2. Hero — pitch + integrated sign-in card
 *   3. The problem — €250k per failure / 95% without predictive maintenance
 *   4. Demo video placeholder (16:9, click-to-play stub)
 *   5. Five agents grid
 *   6. How it works (3 steps: upload → watch → repair)
 *   7. Why it's exceptional (Opus 4.7 + sandbox + MCP)
 *   8. Footer
 *
 * Auth integration: signing in here redirects to `/control-room`; an
 * already-authenticated visitor opening `/` is forwarded straight in.
 */

import { type FormEvent, useId, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AriaMark, Icons, ThemeToggle } from "../components/ui";
import { isAuthenticated, login } from "../services/auth";

const DEV = import.meta.env.DEV;

export default function LandingPage() {
    if (isAuthenticated()) {
        return <Navigate to="/control-room" replace />;
    }
    return (
        <div className="min-h-screen w-full bg-background text-foreground">
            <Nav />
            <main>
                <Hero />
                <ProblemSection />
                <DemoVideoSection />
                <AgentsSection />
                <HowItWorksSection />
                <MoatSection />
            </main>
            <Footer />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────

function Nav() {
    return (
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/70">
            <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
                <a href="#top" className="flex items-center gap-2.5">
                    <AriaMark className="text-foreground" size={22} />
                    <span className="text-base font-semibold tracking-[-0.015em]">ARIA</span>
                    <span className="hidden text-xs text-text-tertiary sm:inline">
                        Industrial AI on Claude Opus 4.7
                    </span>
                </a>
                <nav className="hidden items-center gap-6 md:flex">
                    <NavLink href="#demo">Demo</NavLink>
                    <NavLink href="#how">How it works</NavLink>
                    <NavLink href="#agents">Agents</NavLink>
                    <NavLink href="#moat">Why it's different</NavLink>
                </nav>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <a
                        href="#signin"
                        className="inline-flex h-9 items-center rounded-cta border-[1.5px] border-primary bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-pill transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        Sign in
                    </a>
                </div>
            </div>
        </header>
    );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <a
            href={href}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
            {children}
        </a>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero — pitch + sign-in card
// ─────────────────────────────────────────────────────────────────────────────

function Hero() {
    return (
        <section id="top" className="relative overflow-hidden border-b border-border/60">
            {/* soft radial glow behind the hero */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                    background:
                        "radial-gradient(ellipse 60% 50% at 20% 0%, color-mix(in oklab, var(--primary) 8%, transparent), transparent 60%), radial-gradient(ellipse 50% 40% at 90% 30%, color-mix(in oklab, var(--accent-arc, var(--destructive)) 10%, transparent), transparent 60%)",
                }}
            />
            <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_minmax(360px,420px)] lg:gap-16 lg:px-8 lg:py-24">
                {/* Left — pitch */}
                <div className="flex flex-col justify-center gap-7">
                    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-text-tertiary">
                        <span className="size-1.5 rounded-full bg-success" />
                        Built for the Anthropic Hackathon · April 2026
                    </span>
                    <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.025em] text-foreground sm:text-5xl lg:text-6xl">
                        Stop machines from breaking{" "}
                        <span className="italic text-text-tertiary">before</span> they break.
                    </h1>
                    <p className="max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
                        Upload any machine's PDF manual. ARIA reads it cover-to-cover, learns from
                        your operators, then watches the floor 24/7 — predicting failures hours in
                        advance and printing the repair order before anything stops.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                        <a
                            href="#signin"
                            className="inline-flex h-11 items-center gap-2 rounded-cta border-[1.5px] border-primary bg-primary px-5 text-sm font-medium text-primary-foreground shadow-pill transition-colors hover:bg-primary-hover"
                        >
                            Sign in to the demo
                            <Icons.ArrowRight className="size-4" aria-hidden />
                        </a>
                        <a
                            href="#demo"
                            className="inline-flex h-11 items-center gap-2 rounded-cta border-[1.5px] border-border bg-card px-5 text-sm font-medium text-foreground shadow-pill transition-colors hover:bg-accent"
                        >
                            <Icons.Play className="size-4" aria-hidden />
                            Watch the 3-min demo
                        </a>
                    </div>
                    {/* hero stats */}
                    <dl className="grid grid-cols-2 gap-x-8 gap-y-4 pt-4 sm:grid-cols-4">
                        <Stat value="<2 min" label="From PDF to live monitoring" />
                        <Stat value="~12 h" label="Forecast horizon before a breach" />
                        <Stat value="5" label="Specialised AI agents" />
                        <Stat value="Opus 4.7" label="Adaptive thinking + sandbox" />
                    </dl>
                </div>
                {/* Right — sign-in card */}
                <div className="flex items-center justify-center lg:justify-end">
                    <SignInCard />
                </div>
            </div>
        </section>
    );
}

function Stat({ value, label }: { value: string; label: string }) {
    return (
        <div className="flex flex-col gap-1">
            <dt className="text-2xl font-semibold tracking-[-0.02em] text-foreground">{value}</dt>
            <dd className="text-xs leading-snug text-text-tertiary">{label}</dd>
        </div>
    );
}

function SignInCard() {
    const navigate = useNavigate();
    const usernameId = useId();
    const passwordId = useId();
    const errorId = useId();

    const [username, setUsername] = useState(DEV ? "admin" : "");
    const [password, setPassword] = useState(DEV ? "admin123" : "");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await login(username, password);
            navigate("/control-room", { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed");
        } finally {
            setLoading(false);
        }
    }

    function quickFill(role: "admin" | "operator" | "viewer") {
        setUsername(role);
        setPassword(`${role}123`);
        setError(null);
    }

    return (
        <form
            id="signin"
            onSubmit={onSubmit}
            aria-busy={loading}
            noValidate
            className="w-full max-w-md scroll-mt-24 rounded-2xl border border-border bg-card p-7 shadow-card"
        >
            <header className="mb-5 flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-xl font-semibold tracking-[-0.015em] text-foreground">
                        Operator console
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Step into the control room of a small bottling plant.
                    </p>
                </div>
                <span className="inline-flex flex-none items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-text-tertiary">
                    <span className="size-1.5 rounded-full bg-success" />
                    Live
                </span>
            </header>

            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label
                        htmlFor={usernameId}
                        className="text-xs font-medium uppercase tracking-wide text-text-tertiary"
                    >
                        Username
                    </label>
                    <input
                        id={usernameId}
                        name="username"
                        type="text"
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        disabled={loading}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground transition-colors hover:border-input focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label
                        htmlFor={passwordId}
                        className="text-xs font-medium uppercase tracking-wide text-text-tertiary"
                    >
                        Password
                    </label>
                    <input
                        id={passwordId}
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={loading}
                        aria-describedby={error ? errorId : undefined}
                        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground transition-colors hover:border-input focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    />
                </div>

                {error && (
                    <div
                        id={errorId}
                        role="alert"
                        className="rounded-md border px-3 py-2 text-sm"
                        style={{
                            backgroundColor:
                                "color-mix(in oklab, var(--destructive), transparent 88%)",
                            borderColor: "color-mix(in oklab, var(--destructive), transparent 70%)",
                            color: "var(--destructive)",
                        }}
                    >
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-cta border-[1.5px] border-primary bg-primary text-sm font-medium text-primary-foreground shadow-pill transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {loading ? (
                        <>
                            <Icons.Loader2 className="size-4 animate-spin" aria-hidden />
                            Signing in…
                        </>
                    ) : (
                        <>
                            Enter the control room
                            <Icons.ArrowRight className="size-4" aria-hidden />
                        </>
                    )}
                </button>

                <div className="flex flex-col gap-2 rounded-md border border-dashed border-border bg-background/60 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                        Try a role
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {(["admin", "operator", "viewer"] as const).map((role) => (
                            <button
                                key={role}
                                type="button"
                                onClick={() => quickFill(role)}
                                className="inline-flex h-7 items-center rounded-full border border-border bg-card px-3 text-xs font-medium capitalize text-foreground transition-colors hover:border-input hover:bg-accent"
                            >
                                {role}
                            </button>
                        ))}
                    </div>
                    <p className="text-[11px] text-text-tertiary">
                        Each role is seeded with the password{" "}
                        <code className="font-mono">role123</code> (e.g.{" "}
                        <code className="font-mono">admin123</code>).
                    </p>
                </div>
            </div>
        </form>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Problem
// ─────────────────────────────────────────────────────────────────────────────

function ProblemSection() {
    return (
        <section className="border-b border-border/60 bg-card/40">
            <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
                <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
                    <div className="flex flex-col gap-4">
                        <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                            The problem
                        </span>
                        <h2 className="text-3xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-4xl">
                            Predictive maintenance has been{" "}
                            <span className="italic">out of reach</span> for almost everyone.
                        </h2>
                        <p className="text-base leading-relaxed text-muted-foreground">
                            Configuring a system that can predict failures used to take six months
                            and a six-figure budget. Ninety-five percent of industrial sites can't
                            afford it — so they wait for things to break, then pay the bill.
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                        <BigStat value="95%" label="of sites have no predictive maintenance" />
                        <BigStat
                            value="€250k"
                            label="average cost of one unplanned machine failure"
                            tone="destructive"
                        />
                        <BigStat value="6 months" label="typical setup time for legacy systems" />
                        <BigStat
                            value="<15 min"
                            label="setup time with ARIA — from PDF to live"
                            tone="success"
                        />
                        <BigStat value="Opus 4.7" label="extended thinking on every diagnosis" />
                        <BigStat value="MCP" label="hosted tool servers, no glue code" />
                    </div>
                </div>
            </div>
        </section>
    );
}

function BigStat({
    value,
    label,
    tone,
}: {
    value: string;
    label: string;
    tone?: "success" | "destructive";
}) {
    const accent =
        tone === "success"
            ? "text-success"
            : tone === "destructive"
              ? "text-destructive"
              : "text-foreground";
    return (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-5">
            <span className={`text-2xl font-semibold tracking-[-0.02em] ${accent}`}>{value}</span>
            <span className="text-xs leading-snug text-text-tertiary">{label}</span>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Demo video placeholder
// ─────────────────────────────────────────────────────────────────────────────

function DemoVideoSection() {
    const [playing, setPlaying] = useState(false);
    return (
        <section id="demo" className="border-b border-border/60">
            <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
                <div className="mx-auto mb-8 max-w-3xl text-center">
                    <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                        See it in action
                    </span>
                    <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-4xl">
                        Three minutes from anomaly to printable repair order.
                    </h2>
                    <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                        Watch the five agents pass the problem between themselves — investigate, run
                        real Python in Anthropic's sandbox, recall last January's incident, and ship
                        the work order to the technician.
                    </p>
                </div>
                <div className="mx-auto max-w-5xl">
                    <div
                        className="group relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-card shadow-feature"
                        style={{
                            background:
                                "linear-gradient(135deg, color-mix(in oklab, var(--primary) 4%, var(--card)) 0%, var(--card) 50%, color-mix(in oklab, var(--accent-arc, var(--destructive)) 4%, var(--card)) 100%)",
                        }}
                    >
                        {!playing ? (
                            <button
                                type="button"
                                onClick={() => setPlaying(true)}
                                aria-label="Play demo video"
                                className="absolute inset-0 flex flex-col items-center justify-center gap-4 transition-transform duration-300 hover:scale-[1.01] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <span
                                    className="flex size-20 items-center justify-center rounded-full border border-border bg-card shadow-card transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
                                    aria-hidden
                                >
                                    <Icons.Play className="size-8 translate-x-0.5" />
                                </span>
                                <span className="flex flex-col items-center gap-1">
                                    <span className="text-base font-medium text-foreground">
                                        Demo video coming soon
                                    </span>
                                    <span className="text-xs text-text-tertiary">
                                        3:00 · narrated walkthrough · Opus 4.7
                                    </span>
                                </span>
                            </button>
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
                                <Icons.Sparkles className="size-8 text-primary" aria-hidden />
                                <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                                    The video will be embedded here for the submission. In the
                                    meantime, sign in above and trigger the demo scene from the
                                    control room.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setPlaying(false)}
                                    className="inline-flex h-8 items-center rounded-cta border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                                >
                                    Close
                                </button>
                            </div>
                        )}
                        {/* Decorative grid lines */}
                        <div
                            aria-hidden
                            className="pointer-events-none absolute inset-0 opacity-[0.03]"
                            style={{
                                backgroundImage:
                                    "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
                                backgroundSize: "40px 40px",
                            }}
                        />
                    </div>
                    <p className="mt-4 text-center text-xs text-text-tertiary">
                        Or jump straight into the live console — sign in above with the{" "}
                        <code className="font-mono">admin / admin123</code> demo account.
                    </p>
                </div>
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Agents
// ─────────────────────────────────────────────────────────────────────────────

interface AgentCard {
    name: string;
    role: string;
    blurb: string;
    color: string;
    icon: React.ReactNode;
}

const AGENTS: AgentCard[] = [
    {
        name: "Sentinel",
        role: "The watcher",
        blurb: "Watches every signal in real time and catches threshold breaches the moment they happen.",
        color: "#3f6fb8",
        icon: <Icons.Eye className="size-5" aria-hidden />,
    },
    {
        name: "Investigator",
        role: "The thinker",
        blurb: "Runs Python in Anthropic's sandbox to compute trends, correlations and time-to-failure. You watch it think live.",
        color: "#7858c4",
        icon: <Icons.Sparkles className="size-5" aria-hidden />,
    },
    {
        name: "KB Builder",
        role: "The reader",
        blurb: "Reads any machine manual cover-to-cover with vision, then asks the operator a few questions to calibrate the alerts.",
        color: "#10a877",
        icon: <Icons.BookOpen className="size-5" aria-hidden />,
    },
    {
        name: "Work Order",
        role: "The writer",
        blurb: "Turns the diagnosis into a printable repair order — parts list, procedure, time estimate.",
        color: "#a77318",
        icon: <Icons.FileText className="size-5" aria-hidden />,
    },
    {
        name: "Q&A",
        role: "The voice",
        blurb: "Talks to the operator in plain English. Answers any question about the plant, in real time.",
        color: "#a34e81",
        icon: <Icons.MessageCircle className="size-5" aria-hidden />,
    },
];

function AgentsSection() {
    return (
        <section id="agents" className="border-b border-border/60 bg-card/40">
            <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
                <div className="mx-auto mb-12 max-w-3xl text-center">
                    <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                        Five agents, one mission
                    </span>
                    <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-4xl">
                        A team of specialists, not one big prompt.
                    </h2>
                    <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                        Each agent has one job. They pass the problem between themselves over an MCP
                        server — exactly like a real maintenance team passes a ticket between
                        technicians.
                    </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {AGENTS.map((a) => (
                        <article
                            key={a.name}
                            className="group relative flex flex-col gap-3 overflow-hidden rounded-xl border border-border bg-card p-6 transition-colors hover:border-input"
                        >
                            <span
                                aria-hidden
                                className="absolute inset-x-0 top-0 h-0.5"
                                style={{ background: a.color }}
                            />
                            <div
                                className="flex size-10 items-center justify-center rounded-lg"
                                style={{
                                    background: `color-mix(in oklab, ${a.color} 14%, transparent)`,
                                    color: a.color,
                                }}
                            >
                                {a.icon}
                            </div>
                            <div className="flex flex-col gap-1">
                                <h3 className="text-base font-semibold tracking-[-0.01em] text-foreground">
                                    {a.name}
                                </h3>
                                <span
                                    className="text-xs font-medium uppercase tracking-wide"
                                    style={{ color: a.color }}
                                >
                                    {a.role}
                                </span>
                            </div>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                {a.blurb}
                            </p>
                        </article>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// How it works
// ─────────────────────────────────────────────────────────────────────────────

const STEPS: { n: string; title: string; body: string; icon: React.ReactNode }[] = [
    {
        n: "01",
        title: "Upload the manual",
        body: "Drag in any PDF — pump, filler, any machine. ARIA reads it cover-to-cover with vision and extracts the thresholds, procedures and parts.",
        icon: <Icons.Upload className="size-5" aria-hidden />,
    },
    {
        n: "02",
        title: "Calibrate to your floor",
        body: "ARIA asks the operator a handful of questions about how this specific machine is actually used. Hybrid intelligence: documentation + tacit floor knowledge.",
        icon: <Icons.MessageCircle className="size-5" aria-hidden />,
    },
    {
        n: "03",
        title: "Watch and ship",
        body: "ARIA watches 24/7. When a failure is forming, you see the agents reason live — and the technician walks away with a printed repair order.",
        icon: <Icons.Wrench className="size-5" aria-hidden />,
    },
];

function HowItWorksSection() {
    return (
        <section id="how" className="border-b border-border/60">
            <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
                <div className="mx-auto mb-12 max-w-3xl text-center">
                    <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                        How it works
                    </span>
                    <h2 className="mt-2 text-3xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-4xl">
                        From a paper manual to a live AI watchdog — in three steps.
                    </h2>
                </div>
                <ol className="grid gap-6 lg:grid-cols-3">
                    {STEPS.map((s) => (
                        <li
                            key={s.n}
                            className="relative flex flex-col gap-4 rounded-xl border border-border bg-card p-6"
                        >
                            <div className="flex items-center justify-between">
                                <span className="font-mono text-sm text-text-tertiary">{s.n}</span>
                                <span className="flex size-10 items-center justify-center rounded-lg bg-background text-foreground">
                                    {s.icon}
                                </span>
                            </div>
                            <h3 className="text-lg font-semibold tracking-[-0.01em] text-foreground">
                                {s.title}
                            </h3>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                {s.body}
                            </p>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Moat — Why this is exceptional
// ─────────────────────────────────────────────────────────────────────────────

const MOATS: { title: string; body: React.ReactNode; icon: React.ReactNode }[] = [
    {
        title: "Forecasts before failure, not after",
        body: (
            <>
                A second loop runs least-squares regression on every monitored signal and emits a
                warning when the projected trajectory will cross a threshold inside a{" "}
                <strong className="text-foreground">12-hour horizon</strong>, with an explicit ETA
                and an R² confidence score. The operator gets time to plan a maintenance window —
                not a 3 a.m. phone call.
            </>
        ),
        icon: <Icons.Activity className="size-5" aria-hidden />,
    },
    {
        title: "Real Python in a real sandbox",
        body: (
            <>
                The Investigator writes Python —{" "}
                <code className="rounded bg-background px-1 py-0.5 font-mono text-[12px] text-foreground">
                    np.polyfit
                </code>
                , Pearson correlation — and runs it inside Anthropic's cloud container. The work
                order cites the actual numbers it got back, not LLM token-math.
            </>
        ),
        icon: <Icons.Cpu className="size-5" aria-hidden />,
    },
    {
        title: "Adaptive thinking, on screen",
        body: (
            <>
                Opus 4.7 runs in{" "}
                <code className="rounded bg-background px-1 py-0.5 font-mono text-[12px] text-foreground">
                    adaptive
                </code>{" "}
                thinking mode and the summarised reasoning streams live to the operator's inspector
                as the agent works. Every turn keeps its signed thinking blocks, so the next turn
                picks up exactly where the last one left off.
            </>
        ),
        icon: <Icons.Sparkles className="size-5" aria-hidden />,
    },
    {
        title: "MCP-native architecture",
        body: (
            <>
                All tools — signals, KB, work orders — sit behind one MCP server. Adding a new agent
                is a contract change, not a rewrite.
            </>
        ),
        icon: <Icons.GitBranch className="size-5" aria-hidden />,
    },
    {
        title: "Pattern memory",
        body: (
            <>
                ARIA remembers the last time it saw the same vibration trace. The technician sees:{" "}
                <em>“we fixed this on the Capper in January with a torque adjustment.”</em>
            </>
        ),
        icon: <Icons.Database className="size-5" aria-hidden />,
    },
];

function MoatSection() {
    return (
        <section id="moat" className="border-b border-border/60 bg-card/40">
            <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
                <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
                    <div className="flex flex-col gap-4">
                        <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
                            Why it's exceptional
                        </span>
                        <h2 className="text-3xl font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-4xl">
                            What you cannot build on a Messages-API alone.
                        </h2>
                        <p className="text-base leading-relaxed text-muted-foreground">
                            ARIA leans on the parts of Claude Opus 4.7 that competitors can't access
                            through a chat completion endpoint — Managed Agents, the cloud sandbox,
                            extended thinking and hosted MCP. That's the moat.
                        </p>
                        <a
                            href="#signin"
                            className="mt-2 inline-flex h-10 w-fit items-center gap-2 rounded-cta border-[1.5px] border-primary bg-primary px-4 text-sm font-medium text-primary-foreground shadow-pill transition-colors hover:bg-primary-hover"
                        >
                            See it for yourself
                            <Icons.ArrowRight className="size-4" aria-hidden />
                        </a>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {MOATS.map((m) => (
                            <article
                                key={m.title}
                                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
                            >
                                <span className="flex size-10 items-center justify-center rounded-lg bg-background text-primary">
                                    {m.icon}
                                </span>
                                <h3 className="text-base font-semibold tracking-[-0.01em] text-foreground">
                                    {m.title}
                                </h3>
                                <p className="text-sm leading-relaxed text-muted-foreground">
                                    {m.body}
                                </p>
                            </article>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Footer
// ─────────────────────────────────────────────────────────────────────────────

function Footer() {
    return (
        <footer className="bg-background">
            <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
                <div className="flex items-center gap-2.5">
                    <AriaMark className="text-foreground" size={20} />
                    <span className="text-sm font-medium tracking-[-0.01em] text-foreground">
                        ARIA
                    </span>
                    <span className="text-xs text-text-tertiary">
                        · Anthropic Hackathon · April 2026
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-text-tertiary">
                    <span>Built on Claude Opus 4.7 · Managed Agents · MCP</span>
                    <a href="#signin" className="transition-colors hover:text-foreground">
                        Sign in
                    </a>
                    <a
                        href="https://www.anthropic.com/claude/opus"
                        target="_blank"
                        rel="noreferrer"
                        className="transition-colors hover:text-foreground"
                    >
                        About Claude Opus
                    </a>
                </div>
            </div>
        </footer>
    );
}
