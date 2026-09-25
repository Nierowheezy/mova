// src/hooks/useAsyncAction.ts
// Generic async-action hook with `pending` state plus consistent toast
// notifications (success/error) so every mutation surfaces feedback the
// same way across the app.
//
// Usage:
//   const { run: handleFund, pending } = useAsyncAction(
//       async () => (await verifyWalletFunding({ paymentId, amount })).data,
//       { successMessage: "Wallet funded", showSuccessToast: true },
//   );

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { getApiErrorMessage } from "@/libs/errors";

export interface UseAsyncActionOptions {
    /** Text shown in the success toast. Requires `showSuccessToast: true`. */
    successMessage?: string;
    /** Fire a success toast when the action resolves. */
    showSuccessToast?: boolean;
    /** Fallback used when the API error has no readable message. */
    errorMessage?: string;
}

export function useAsyncAction<Args extends unknown[] = unknown[], Result = unknown>(
    action: (...args: Args) => Promise<Result>,
    { successMessage = "Done", showSuccessToast = false, errorMessage }: UseAsyncActionOptions = {},
) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const run = useCallback(
        async (...args: Args): Promise<Result | undefined> => {
            setPending(true);
            setError(null);
            try {
                const result = await action(...args);
                if (showSuccessToast) toast.success(successMessage);
                return result;
            } catch (e) {
                const message = getApiErrorMessage(e, errorMessage);
                setError(message);
                toast.error(message);
                return undefined;
            } finally {
                setPending(false);
            }
        },
        [action, successMessage, showSuccessToast, errorMessage],
    );

    const clearError = useCallback(() => setError(null), []);

    return { run, pending, error, clearError };
}