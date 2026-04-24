/**
 * TanStack Query wrappers around the Logbook REST endpoints.
 *
 * - {@link useLogbookEntries} — paginated/filtered list, 10s stale.
 * - {@link useCreateLogbookEntry} — POST mutation that invalidates the
 *   list cache so the new entry appears at the top without manual refetch.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
    createLogbookEntry,
    type LogbookEntry,
    type LogbookEntryCreatePayload,
    type LogbookQuery,
    listLogbookEntries,
} from "../../services/logbook";

export const LOGBOOK_LIST_KEY = ["logbook", "list"] as const;

export function useLogbookEntries(query: LogbookQuery = {}) {
    return useQuery<LogbookEntry[]>({
        queryKey: [...LOGBOOK_LIST_KEY, query],
        queryFn: () => listLogbookEntries(query),
        staleTime: 10_000,
    });
}

export function useCreateLogbookEntry() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: LogbookEntryCreatePayload) => createLogbookEntry(payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: LOGBOOK_LIST_KEY });
        },
    });
}
