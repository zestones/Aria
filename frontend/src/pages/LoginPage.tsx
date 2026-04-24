import { type FormEvent, useId, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AriaMark, ThemeToggle } from "../components/ui";
import { login } from "../services/auth";

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
        <div className="min-h-full flex flex-col bg-ds-bg-base">
            <header className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-2.5">
                    <AriaMark size={20} />
                    <span className="text-ds-md font-semibold tracking-[-0.01em] text-ds-fg-primary">
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
                    className="w-full max-w-sm rounded-ds-md border border-ds-border bg-ds-bg-surface p-6 space-y-5"
                >
                    <div className="space-y-1">
                        <h1 className="text-ds-2xl font-semibold leading-tight tracking-[-0.01em] text-ds-fg-primary">
                            Sign in
                        </h1>
                        <p className="text-ds-sm text-ds-fg-muted">
                            Operator console for water-treatment telemetry.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <label
                            htmlFor={usernameId}
                            className="block text-ds-sm font-medium text-ds-fg-muted"
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
                            className="h-9 w-full rounded-ds-md border border-ds-border bg-ds-bg-elevated px-3 text-ds-sm text-ds-fg-primary placeholder:text-ds-fg-subtle transition-colors duration-ds-fast hover:border-ds-border-strong focus:border-ds-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-ring disabled:opacity-50"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label
                            htmlFor={passwordId}
                            className="block text-ds-sm font-medium text-ds-fg-muted"
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
                            className="h-9 w-full rounded-ds-md border border-ds-border bg-ds-bg-elevated px-3 text-ds-sm text-ds-fg-primary placeholder:text-ds-fg-subtle transition-colors duration-ds-fast hover:border-ds-border-strong focus:border-ds-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-ring disabled:opacity-50"
                        />
                    </div>

                    {error && (
                        <div
                            id={errorId}
                            role="alert"
                            className="rounded-ds-md border px-3 py-2 text-ds-sm"
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
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-ds-md bg-ds-accent px-3.5 text-ds-sm font-medium text-ds-accent-fg transition-colors duration-ds-fast hover:bg-ds-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent-ring disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {loading ? "Signing in…" : "Sign in"}
                    </button>

                    {DEV && (
                        <p className="text-center text-ds-xs text-ds-fg-subtle">
                            Dev seed: admin / admin123 · operator / operator123 · viewer / viewer123
                        </p>
                    )}
                </form>
            </main>
        </div>
    );
}
