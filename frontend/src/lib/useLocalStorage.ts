import { useCallback, useEffect, useRef, useState } from "react";

export interface UseLocalStorageOptions<T> {
    /**
     * Narrow an arbitrary parsed payload down to `T`. When it returns `null`,
     * the hook falls back to `initialValue` and purges the key — useful for
     * dropping legacy shapes after a schema change without crashing the UI.
     */
    validator?: (raw: unknown) => T | null;
}

/**
 * Generic, typed localStorage hook. SSR-safe (no window at module init),
 * syncs across tabs via the `storage` event, and swallows JSON/quota errors
 * rather than crashing the UI.
 */
export function useLocalStorage<T>(
    key: string,
    initialValue: T,
    options?: UseLocalStorageOptions<T>,
): [T, (value: T | ((prev: T) => T)) => void] {
    const validatorRef = useRef(options?.validator);
    validatorRef.current = options?.validator;

    const readValue = useCallback((): T => {
        if (typeof window === "undefined") return initialValue;
        try {
            const raw = window.localStorage.getItem(key);
            if (raw === null) return initialValue;
            const parsed = JSON.parse(raw) as unknown;
            const validator = validatorRef.current;
            if (validator) {
                const valid = validator(parsed);
                if (valid === null) {
                    window.localStorage.removeItem(key);
                    return initialValue;
                }
                return valid;
            }
            return parsed as T;
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
                const parsed = JSON.parse(e.newValue) as unknown;
                const validator = validatorRef.current;
                if (validator) {
                    const valid = validator(parsed);
                    if (valid === null) return;
                    setStored(valid);
                    return;
                }
                setStored(parsed as T);
            } catch {
                // ignore
            }
        }
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    return [stored, setValue];
}
