// src/hooks/useApiData.ts
// Generic data-fetching hook: manages `data`, `loading`, `error` and a
// `reload`/`setData` escape hatch for pages that mutate data after loading.
//
// Usage:
//   const { data, loading, error, reload } = useApiData(async () => (await getTransactions()).data);

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiErrorMessage } from "@/libs/errors";

export interface UseApiDataResult<T> {
    data: T | null;
    loading: boolean;
    error: string | null;
    /** Manually overwrite data (optimistic updates, local edits). */
    setData: React.Dispatch<React.SetStateAction<T | null>>;
    /** Re-run the fetcher (used by "Try again" on error states). */
    reload: () => Promise<void>;
}

export function useApiData<T>(fetcher: () => Promise<T>, deps: React.DependencyList = []): UseApiDataResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Keep the latest fetcher without re-triggering the effect.
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;

    // Deps pin when the fetch re-runs (e.g. a URL param change on detail pages).
    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await fetcherRef.current();
            setData(result);
        } catch (e) {
            setError(getApiErrorMessage(e));
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);

    useEffect(() => {
        void reload();
    }, [reload]);

    return { data, loading, error, setData, reload };
}