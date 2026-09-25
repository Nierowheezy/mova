// Central fraud-control limits. Tune per KYC tier in production.
//
// Every user is assigned an AccountTier (BASIC / VERIFIED / PREMIUM) and the
// per-transaction + rolling-24h aggregate limits come from their tier, NOT a
// single global number. `LIMITS_BY_TIER` is the single source of truth for:
//   - maxPerTransaction : largest single transfer/deposit/withdrawal (USD)
//   - dailyLimit        : rolling 24h aggregate of all money movement (USD)
//
// Raise a tier (e.g. VERIFIED → PREMIUM) only after enhanced due diligence;
// grenade global limits and a fintech breaks. Tiers live in the DB on `users`.

export type TierLimits = {
  maxPerTransaction: number;
  dailyLimit: number;
};

export const LIMITS_BY_TIER: Record<"BASIC" | "VERIFIED" | "PREMIUM", TierLimits> =
  {
    // Default tier: newly registered user, before KYC approval. Enough to
    // test the product, small enough to cap fraud blast radius.
    BASIC: {
      maxPerTransaction: 1_000,
      dailyLimit: 5_000,
    },
    // Standard user: KYC approved (identity verified). Default production tier.
    VERIFIED: {
      maxPerTransaction: 10_000,
      dailyLimit: 25_000,
    },
    // Ops-promoted tier for high-trust, high-volume customers.
    PREMIUM: {
      maxPerTransaction: 50_000,
      dailyLimit: 150_000,
    },
  } as const;

/** Fallback when reading an unknown tier from the DB. */
export const DEFAULT_TIER = "BASIC";

export const LIMITS = {
  /** Consecutive wrong transaction-PIN attempts before the PIN locks. */
  PIN_MAX_ATTEMPTS: 5,
  /** How long the transaction PIN stays locked. */
  PIN_LOCKOUT_MINUTES: 15,
  /** TTL for stored idempotency responses. */
  IDEMPOTENCY_TTL_HOURS: 24,
} as const;

/** Convenience: tier limits with the legacy constant names kept for imports. */
export function getLimitsForTier(
  tier?: string | null,
): TierLimits & { tier: "BASIC" | "VERIFIED" | "PREMIUM" } {
  const key = (tier ?? DEFAULT_TIER) as "BASIC" | "VERIFIED" | "PREMIUM";
  const limits = LIMITS_BY_TIER[key] ?? LIMITS_BY_TIER[DEFAULT_TIER];
  return { ...limits, tier: (limits === LIMITS_BY_TIER[key] ? key : DEFAULT_TIER) };
}