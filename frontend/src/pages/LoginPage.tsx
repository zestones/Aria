import { type FormEvent, useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AriaMark, ThemeToggle } from "../design-system";
import { login } from "../lib/auth";

const DEV = import.meta.env.DEV;

interface LocationState {
    from?: { pathname?: string };
}

export default function LoginPage() {
    const navigate = useNavigate();
    const location = useLocation();
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
            const from = (location.state as LocationState | null)?.from?.pathname;
            const target = from && from !== "/login" ? from : "/control-room";
            navigate(target, { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-full flex flex-col bg-[var(--ds-bg-base)]">
            <header className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-2.5">
                    <AriaMark size={20} />
                    <span className="text-[var(--ds-text-md)] font-semibold tracking-[-0.01em] text-[var(--ds-fg-primary)]">
                        ARIA
                    </span>
                </div>
                <ThemeToggle />
            </header>

            <main className="flex flex-1 items-center justify-center px-4 py-8">
                <form
                    onSubmit={onSubmit}
                    aria-busy={loading}
                    noValidate
                    className="w-full max-w-sm rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-surface)] p-6 space-y-5"
                >
                    <div className="space-y-1">
                        <h1 className="text-[var(--ds-text-2xl)] font-semibold leading-tight tracking-[-0.01em] text-[var(--ds-fg-primary)]">
                            Sign in
                        </h1>
                        <p className="text-[var(--ds-text-sm)] text-[var(--ds-fg-muted)]">
                            Operator console for water-treatment telemetry.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <label
                            htmlFor={usernameId}
                            className="block text-[var(--ds-text-sm)] font-medium text-[var(--ds-fg-muted)]"
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
                            className="h-9 w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] px-3 text-[var(--ds-text-sm)] text-[var(--ds-fg-primary)] placeholder:text-[var(--ds-fg-subtle)] transition-colors duration-[var(--ds-motion-fast)] hover:border-[var(--ds-border-strong)] focus:border-[var(--ds-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)] disabled:opacity-50"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label
                            htmlFor={passwordId}
                            className="block text-[var(--ds-text-sm)] font-medium text-[var(--ds-fg-muted)]"
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
                            className="h-9 w-full rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-bg-elevated)] px-3 text-[var(--ds-text-sm)] text-[var(--ds-fg-primary)] placeholder:text-[var(--ds-fg-subtle)] transition-colors duration-[var(--ds-motion-fast)] hover:border-[var(--ds-border-strong)] focus:border-[var(--ds-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)] disabled:opacity-50"
                        />
                    </div>

                    {error && (
                        <div
                            id={errorId}
                            role="alert"
                            className="rounded-[var(--ds-radius-md)] border px-3 py-2 text-[var(--ds-text-sm)]"
                            style={{
                                backgroundColor:
                                    "color-mix(in oklab, var(--ds-status-critical), transparent 88%)",
                                borderColor:
                                    "color-mix(in oklab, var(--ds-status-critical), transparent 70%)",
                                color: "var(--ds-status-critical)",
                            }}
                        >
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[var(--ds-radius-md)] bg-[var(--ds-accent)] px-3.5 text-[var(--ds-text-sm)] font-medium text-[var(--ds-accent-fg)] transition-colors duration-[var(--ds-motion-fast)] hover:bg-[var(--ds-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-accent-ring)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {loading ? "Signing in…" : "Sign in"}
                    </button>

                    {DEV && (
                        <p className="text-center text-[var(--ds-text-xs)] text-[var(--ds-fg-subtle)]">
                            Dev seed: admin / admin123 · operator / operator123 · viewer / viewer123
                        </p>
                    )}
                </form>
            </main>
        </div>
    );
}
