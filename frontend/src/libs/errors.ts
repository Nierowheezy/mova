// src/libs/errors.ts
// ---------------------------------------------------------------------------
// Centralized API error extraction.
//
// The backend error contract is: { success: false, error: { code, message } }.
// Some legacy endpoints also use top-level `message` or Python-style `detail`.
// Every page/mutation should surface errors through `getApiErrorMessage` so
// users see the real reason (e.g. "Invalid transaction PIN") instead of a
// generic message or a raw Axios blob.
// ---------------------------------------------------------------------------

import type { AxiosError } from "axios";

interface ApiErrorBody {
    error?: { code?: string; message?: string };
    message?: string;
    detail?: string;
}

export function getApiErrorMessage(
    error: unknown,
    fallback = "Something went wrong. Please try again.",
): string {
    if (!error) return fallback;

    const body = (error as AxiosError<ApiErrorBody>)?.response?.data;
    const candidate =
        body?.error?.message ?? body?.message ?? body?.detail ?? (error as Error | undefined)?.message;

    if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate;
    }
    return fallback;
}