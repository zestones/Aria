import { QueryClient } from "@tanstack/react-query";

/**
 * App-level React Query client.
 * - retry: 1 (one re-attempt on transient failures)
 * - staleTime: 5s (small cache window for live ops dashboards)
 * - refetchOnWindowFocus: false (avoid demo flicker on tab focus)
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: 1, staleTime: 5_000, refetchOnWindowFocus: false },
    },
});
