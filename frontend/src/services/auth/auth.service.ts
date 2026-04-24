import { apiFetch } from "../../lib/api";

export interface User {
    id: number;
    username: string;
    email?: string;
    full_name?: string;
    role: "admin" | "operator" | "viewer";
    is_active: boolean;
    created_at: string;
    last_login?: string;
}

export function getUser(): User | null {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    try {
        return JSON.parse(raw) as User;
    } catch {
        localStorage.removeItem("user");
        return null;
    }
}

export function isAuthenticated(): boolean {
    return getUser() !== null;
}

export function clearAuth() {
    localStorage.removeItem("user");
}

export async function login(username: string, password: string): Promise<User> {
    const data = await apiFetch<{ user: User }>("/auth/login", {
        method: "POST",
        body: { username, password },
    });
    localStorage.setItem("user", JSON.stringify(data.user));
    return data.user;
}

export async function logout(): Promise<void> {
    try {
        await apiFetch("/auth/logout", { method: "POST" });
    } finally {
        clearAuth();
    }
}
