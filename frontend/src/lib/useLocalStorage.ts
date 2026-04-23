import { useCallback, useEffect, useRef, useState } from "react";

const LOCAL_STORAGE_SYNC_EVENT = "aria:local-storage-sync";

interface LocalStorageSyncDetail {
    key: string;
    /** JSON-serialised value, matching what `localStorage.setItem` wrote. */
    value: string | null;
}

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
 * syncs across tabs via the `storage` event and across hook instances in
 * the same tab via a custom event, and swallows JSON/quota errors rather
 * than crashing the UI.
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
                const serialised = JSON.stringify(next);
                window.localStorage.setItem(keyRef.current, serialised);
                // Notify other instances in the same tab — the native `storage`
                // event only fires across tabs.
                window.dispatchEvent(
                    new CustomEvent<LocalStorageSyncDetail>(LOCAL_STORAGE_SYNC_EVENT, {
                        detail: { key: keyRef.current, value: serialised },
                    }),
                );
            } catch {
                // quota exceeded / unavailable — keep in-memory state only
            }
            return next;
        });
    }, []);

    useEffect(() => {
        function applyExternal(rawKey: string, rawValue: string | null) {
            if (rawKey !== keyRef.current || rawValue === null) return;
            try {
                const parsed = JSON.parse(rawValue) as unknown;
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

        function onStorage(e: StorageEvent) {
            applyExternal(e.key ?? "", e.newValue);
        }
        function onLocal(e: Event) {
            const custom = e as CustomEvent<LocalStorageSyncDetail>;
            if (!custom.detail) return;
            applyExternal(custom.detail.key, custom.detail.value);
        }

        window.addEventListener("storage", onStorage);
        window.addEventListener(LOCAL_STORAGE_SYNC_EVENT, onLocal as EventListener);
        return () => {
            window.removeEventListener("storage", onStorage);
            window.removeEventListener(LOCAL_STORAGE_SYNC_EVENT, onLocal as EventListener);
        };
    }, []);

    return [stored, setValue];
}
