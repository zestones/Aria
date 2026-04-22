import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Generic, typed localStorage hook. SSR-safe (no window at module init),
 * syncs across tabs via the `storage` event, and swallows JSON/quota errors
 * rather than crashing the UI.
 */
export function useLocalStorage<T>(
    key: string,
    initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
    const readValue = useCallback((): T => {
        if (typeof window === "undefined") return initialValue;
        try {
            const raw = window.localStorage.getItem(key);
            if (raw === null) return initialValue;
            return JSON.parse(raw) as T;
        } catch {
            return initialValue;
        }
    }, [key, initialValue]);

    const [stored, setStored] = useState<T>(readValue);
    const keyRef = useRef(key);
    keyRef.current = key;

    const setValue = useCallback((value: T | ((prev: T) => T)) => {
        setStored((prev) => {
            const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
            try {
                window.localStorage.setItem(keyRef.current, JSON.stringify(next));
            } catch {
                // quota exceeded / unavailable — keep in-memory state only
            }
            return next;
        });
    }, []);

    useEffect(() => {
        function onStorage(e: StorageEvent) {
            if (e.key !== keyRef.current || e.newValue === null) return;
            try {
                setStored(JSON.parse(e.newValue) as T);
            } catch {
                // ignore
            }
        }
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    return [stored, setValue];
}
