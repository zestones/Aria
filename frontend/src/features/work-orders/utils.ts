/**
 * Coerces one of the loosely-typed list fields from the backend
 * (`required_parts`, `required_skills`, `recommended_actions` — all declared
 * as `Any` in `work_order/schemas.py`) into a flat array of display strings.
 *
 * Handles the four shapes we've seen in the wild:
 * - `string[]`                        → as-is
 * - `Array<{key: value, ...}>`        → each object flattened to `v1 · v2 · …`
 * - comma-separated `"a, b, c"`       → split + trim
 * - JSON-encoded string of any of the above
 */
export function parseList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map((v) => {
                if (v === null || v === undefined) return "";
                if (typeof v === "object") {
                    return Object.values(v as Record<string, unknown>)
                        .filter((x) => x !== undefined && x !== null && x !== "")
                        .map((x) => String(x))
                        .join(" · ");
                }
                return String(v);
            })
            .filter(Boolean);
    }
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parseList(parsed);
        } catch {
            // not JSON — treat as comma-separated
        }
        return value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
    }
    if (value && typeof value === "object") {
        const arr = value as Array<Record<string, unknown>>;
        return arr
            .map((it) =>
                Object.values(it)
                    .filter((v) => v !== undefined && v !== null)
                    .map((v) => String(v))
                    .join(" · "),
            )
            .filter(Boolean);
    }
    return [];
}
