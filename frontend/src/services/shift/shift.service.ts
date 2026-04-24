/**
 * Shift service — current production shift metadata.
 */

import { apiFetch } from "../../lib/api";

export function getCurrentShift(): Promise<unknown> {
    return apiFetch<unknown>("/shifts/current");
}
