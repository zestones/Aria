import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../lib/auth";

export default function LoginPage() {
    const navigate = useNavigate();
    const [username, setUsername] = useState("admin");
    const [password, setPassword] = useState("admin123");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            await login(username, password);
            navigate("/data", { replace: true });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-full flex items-center justify-center bg-slate-50 p-4">
            <form
                onSubmit={onSubmit}
                className="w-full max-w-sm bg-white rounded-lg shadow p-6 space-y-4"
            >
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">ARIA</h1>
                    <p className="text-sm text-slate-500">Sign in to continue</p>
                </div>

                <div className="space-y-1">
                    <label className="block text-sm font-medium text-slate-700">
                        Username
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                        />
                    </label>
                </div>

                <div className="space-y-1">
                    <label className="block text-sm font-medium text-slate-700">
                        Password
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-900 focus:outline-none"
                        />
                    </label>
                </div>

                {error && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                        {error}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded bg-slate-900 text-white text-sm font-medium py-2 hover:bg-slate-800 disabled:opacity-50"
                >
                    {loading ? "Signing in..." : "Sign in"}
                </button>

                <p className="text-xs text-slate-400 text-center">
                    Default seed users: admin/admin123, operator/operator123, viewer/viewer123
                </p>
            </form>
        </div>
    );
}
