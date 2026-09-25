import type { AxiosResponse } from "axios";
import apiClient from "./apiClient";

/**
 * Every endpoint below maps to the Node.js backend (`backend-node/`)
 * which mounts routes under `/api/v1` and wraps responses as
 * `{ success: true, data: ... }`.
 *
 * The existing pages expect Django-style snake_case field names, so each
 * function unwraps `response.data.data` and re-shapes it before returning.
 * This keeps the page components (Overview, Transactions, Savings, etc.)
 * working without changes.
 */

/** Shape of the backend response envelope: `{ success, data }`. */
interface ApiEnvelope<T = JsonRecord> {
    success?: boolean;
    data?: T;
}

/** Untyped JSON from the backend; field access is typed as `unknown`. */
export type JsonRecord = Record<string, unknown>;

const unwrap = <T = JsonRecord>(response: AxiosResponse<ApiEnvelope<T>>): T | undefined =>
    response.data?.data;

const toNumber = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

const asString = (value: unknown): string | undefined =>
    typeof value === "string" ? value : undefined;

/**
 * Fresh v4 UUID used as the backend idempotency key for deposit / withdraw.
 * The backend (deposit + withdraw DTOs) rejects requests without a uuid key,
 * so every call must send one. Callers can pass their own stable key to
 * protect a retry of the same intent from being charged twice (denied at the
 * API level: replaying a key returns the original response).
 */
export const newIdempotencyKey = (): string =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : // Fallback for non-secure contexts, still a valid v4 uuid shape.
          "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0;
              return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
          });

// ---------------------------------------------------------------------------
// Wallet funding (Stripe)
// ---------------------------------------------------------------------------

export const verifyWalletFunding = async (payload: {
    paymentId: string;
    amount: number;
    idempotencyKey?: string;
}) => {
    const response = await apiClient.post<ApiEnvelope>("/deposit", {
        paymentMethodId: payload.paymentId,
        amount: payload.amount,
        idempotencyKey: payload.idempotencyKey ?? newIdempotencyKey(),
    });

    const d = unwrap(response);

    return {
        data: {
            // Prefer the backend's message: it tells the user the wallet is
            // credited only after the payment is confirmed (webhook-driven).
            message: asString(d?.message) ?? "Wallet funded successfully",
            amount: toNumber(d?.amount ?? payload.amount),
            newBalance: d?.newBalance,
            // The backend returns the PENDING deposit reference as `depositId`;
            // keep the old `transactionId` as a fallback for older backends.
            transaction_id: asString(d?.depositId ?? d?.transactionId),
            transactionId: asString(d?.depositId ?? d?.transactionId),
            payment_intent_id: asString(d?.paymentIntentId),
        },
    };
};

export const withdrawFromWallet = async ({
    amount,
    idempotencyKey,
}: {
    amount: number;
    idempotencyKey?: string;
}) => {
    const response = await apiClient.post<ApiEnvelope>("/withdraw", {
        amount,
        idempotencyKey: idempotencyKey ?? newIdempotencyKey(),
    });

    const d = unwrap(response);

    return {
        data: {
            message: asString(d?.message) ?? "Withdrawal initiated",
            amount: toNumber(d?.amount ?? amount),
            status: asString(d?.status),
            withdrawal_id: asString(d?.withdrawalId),
            payout_id: asString(d?.payoutId),
        },
    };
};

/** Sets (or replaces) the 4-digit transaction PIN used for transfers. */
export const setTransactionPin = async ({ pin }: { pin: string }) => {
    const response = await apiClient.post<ApiEnvelope>("/user/set-pin", { pin });
    return { data: unwrap(response) };
};

export const getWalletDetail = async ({ wallet_id }: { wallet_id: string }) => {
    const response = await apiClient.get<ApiEnvelope>(`/wallet/${wallet_id}`);
    const d = unwrap(response);

    return {
        data: {
            wallet_id: asString(d?.walletId) ?? wallet_id,
            full_name: asString(d?.fullName),
            verification_status: asString(d?.verificationStatus) ?? "UNVERIFIED",
        },
    };
};

// ---------------------------------------------------------------------------
// Beneficiaries
// ---------------------------------------------------------------------------

const shapeBeneficiary = (b: JsonRecord | undefined) => ({
    id: b?.id as string | number | undefined,
    name: asString(b?.name),
    email: asString(b?.email),
    wallet_id: asString(b?.walletId),
    created_at: asString(b?.createdAt),
});

export const getBeneficiaries = async () => {
    const response = await apiClient.get<ApiEnvelope<JsonRecord[]>>("/beneficiaries");
    const list = unwrap(response) ?? [];
    return { data: list.map(shapeBeneficiary) };
};

export const addBeneficiary = async ({ wallet_id }: { wallet_id: string }) => {
    const response = await apiClient.post<ApiEnvelope>("/beneficiaries", {
        walletId: wallet_id,
    });
    const d = unwrap(response);
    return { data: d ? shapeBeneficiary(d) : undefined };
};

export const deleteBeneficiary = async (id: number | string) => {
    return apiClient.delete(`/beneficiaries/${id}`);
};

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export const transferFunds = async ({
    wallet_id,
    amount,
    transaction_pin,
    save_beneficiary = false,
}: {
    wallet_id: string;
    amount: string | number;
    transaction_pin: string;
    save_beneficiary?: boolean;
}) => {
    const response = await apiClient.post<ApiEnvelope>("/transfer", {
        walletId: wallet_id,
        amount: Number(amount),
        transactionPin: transaction_pin,
        saveBeneficiary: save_beneficiary,
    });

    const d = unwrap(response);

    return {
        data: {
            // The Node.js backend's transferId is the sender transaction reference
            reference: asString(d?.transferId),
            transfer_id: asString(d?.transferId),
            transferId: asString(d?.transferId),
            amount: toNumber(d?.amount ?? amount),
            status: asString(d?.status),
            timestamp: d?.timestamp,
        },
    };
};

// ---------------------------------------------------------------------------
// Savings goals
// ---------------------------------------------------------------------------

export const createSavingsGoal = async ({
    name,
    target_amount,
    target_date = null,
}: {
    name: string;
    target_amount: number;
    target_date?: string | null;
}) => {
    const response = await apiClient.post<ApiEnvelope>("/savings/create", {
        name,
        targetAmount: Number(target_amount),
        ...(target_date ? { targetDate: target_date } : {}),
    });
    return { data: unwrap(response) };
};

const shapeGoal = (g: JsonRecord | undefined) => ({
    uuid: asString(g?.uuid),
    name: asString(g?.name),
    target_amount: toNumber(g?.targetAmount),
    current_amount: toNumber(g?.currentAmount),
    target_date: asString(g?.targetDate) ?? null,
    progress_percentage: toNumber(g?.progressPercentage),
    created_at: asString(g?.createdAt),
});

export const getSavingsGoals = async () => {
    const response = await apiClient.get<ApiEnvelope<JsonRecord[]>>("/savings");
    const list = unwrap(response) ?? [];
    return { data: list.map(shapeGoal) };
};

export const getSavingsGoal = async (uuid: string) => {
    const response = await apiClient.get<ApiEnvelope>(`/savings/${uuid}`);
    const d = unwrap(response);
    const g = d?.goal as JsonRecord | undefined;

    // The page (SavingsGoalDetail) reads `goal.goal.name`, `goal.wallet`,
    // and `goal.transactions` on the object it sets, so keep `goal` nested.
    return {
        data: g
            ? {
                  goal: shapeGoal(g),
                  wallet: (d?.wallet as JsonRecord | null | undefined) ?? null,
                  transactions: (d?.transactions as JsonRecord[] | undefined) ?? [],
              }
            : null,
    };
};

export const depositToSavingsGoal = async ({
    uuid,
    amount,
}: {
    uuid: string;
    amount: string | number;
}) => {
    const response = await apiClient.post<ApiEnvelope>("/savings/deposit", {
        uuid,
        amount: Number(amount),
    });
    return { data: unwrap(response) };
};

export const withdrawFromSavingsGoal = async ({ uuid }: { uuid: string }) => {
    const response = await apiClient.post<ApiEnvelope>("/savings/withdraw", { uuid });
    return { data: unwrap(response) };
};

// ---------------------------------------------------------------------------
// Dashboard overview
// ---------------------------------------------------------------------------

export const getOverview = async () => {
    const response = await apiClient.get<ApiEnvelope>("/dashboard");
    const d = unwrap(response) ?? {};

    return {
        data: {
            wallet: d.wallet
                ? {
                      balance: toNumber((d.wallet as JsonRecord).balance),
                      wallet_id: asString((d.wallet as JsonRecord).walletId),
                  }
                : null,
            savings_goals: ((d.savingsGoals as JsonRecord[] | undefined) ?? []).map((g) => ({
                id: asString(g?.uuid),
                name: asString(g?.name),
                current: toNumber(g?.currentAmount),
                target: toNumber(g?.targetAmount),
                progress_percentage: toNumber(g?.progressPercentage),
            })),
            beneficiaries: toNumber(d.beneficiariesCount),
            unread_notifications: toNumber(d.unreadNotifications),
            recent_transactions: ((d.recentTransactions as JsonRecord[] | undefined) ?? []).map(
                (t) => ({
                    ...t,
                    id: t?.id,
                    transaction_type: asString(t?.transactionType),
                    amount: toNumber(t?.amount),
                }),
            ),
        },
    };
};

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

const shapeTransaction = (t: JsonRecord | undefined) => ({
    ...t,
    id: t?.id as string | number | undefined,
    transaction_type: asString(t?.transactionType),
    external_reference: asString(t?.externalReference),
    wallet_id: asString((t?.wallet as JsonRecord | undefined)?.walletId),
    amount: toNumber(t?.amount),
});

export const getTransactions = async () => {
    const response = await apiClient.get<ApiEnvelope>("/transactions");
    const d = unwrap(response);
    // Node backend returns `data` as a plain array (`meta` carries pagination),
    // older shape had `{ transactions: [] }` — accept both.
    const list: JsonRecord[] = Array.isArray(d)
        ? d
        : ((d?.transactions as JsonRecord[] | undefined) ?? []);
    return { data: list.map(shapeTransaction) };
};

export const getTransaction = async (reference: string) => {
    const response = await apiClient.get<ApiEnvelope>(`/transactions/${reference}`);
    const t = unwrap(response);
    return { data: t ? shapeTransaction(t) : null };
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const getNotifications = async () => {
    const response = await apiClient.get<ApiEnvelope<JsonRecord[]>>("/notifications");
    const list = unwrap(response) ?? [];
    return {
        data: list.map((n) => ({
            id: n?.id,
            title: asString(n?.title),
            message: asString(n?.message),
            status: asString(n?.status),
            timestamp: asString(n?.timestamp),
            is_read: n?.isRead as boolean | undefined,
            tx_reference: asString(n?.txReference),
        })),
    };
};

export const markNotificationRead = async (id: number) => {
    return apiClient.post(`/notifications/${id}/read`);
};

export const markAllNotificationsRead = async () => {
    return apiClient.post("/notifications/read-all");
};