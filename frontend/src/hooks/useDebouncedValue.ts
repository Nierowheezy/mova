// src/hooks/useDebouncedValue.ts
// Returns a debounced copy of `value` that only updates after `delay` ms of
// quiet. Used for live field validation: checks run on the trailing value
// instead of on every keystroke.
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delay = 400): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebounced(value), delay);
        return () => window.clearTimeout(timer);
    }, [value, delay]);

    return debounced;
}