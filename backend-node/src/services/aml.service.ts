import { prisma } from "../config/database";
import { logger } from "../shared/utils/logger";
import { getLimitsForTier } from "../config/limits";

/**
 * ─── AML transaction monitoring (anti-money-laundering) ─────────────────────
 *
 * After every money movement (transfer, deposit credit, withdrawal) the caller
 * invokes `evaluateTransaction(...)`. It runs a small rules engine that spots
 * classic money-laundering patterns and records them as `AmlFlag` rows for the
 * ops team to review in the admin dashboard.
 *
 * Policy:
 *   - NON-CRITICAL flags never block a transaction (payment latency stays
 *     predictable); ops reviews them and may freeze accounts.
 *   - CRITICAL severity ⇒ the account is AUTOMATICALLY FROZEN so no further
 *     money moves until an operator reviews and unfreezes (admin endpoints).
 *     Sanctions screening failures also raise CRITICAL flags (kyc.service).
 *
 * Rules (order matters for severity):
 *   1. LARGE_SINGLE_TX   — one movement at/above half of the tier daily limit
 *   2. VELOCITY_24H      — rolling 24h movement (sent+received) ≥ dailyLimit
 *   3. STRUCTURING_24H   — ≥3 cash-out movements under the threshold in 24h
 *      (classic "smurfing" pattern: breaking one payment into many small ones)
 *   4. NEW_ACCOUNT_MOVES — money moved within N days of sign-up
 *   5. ROUND_AMOUNT      — heavy use of round numbers (heuristic, LOW)
 */
export interface AmlEvaluationInput {
  userId: number;
  /** Signed amount: use the money-mover's perspective (positive number). */
  amount: number;
  /** Absolute value in USD of the movement. */
  absAmount: number;
  transactionType: "TRANSFER" | "DEPOSIT" | "WITHDRAWAL" | "SAVINGS" | "REFUND";
  transactionRef: string;
  transactionId?: number | null;
  /** When the movement happened / is recorded (default: now). */
  occurredAt?: Date;
}

const ACCOUNT_AGE_DAYS = 14;
const STRUCTURING_MIN_MOVES = 3;

function makeFlag(
  input: AmlEvaluationInput,
  rule: string,
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  details: Record<string, unknown>,
) {
  return {
    userId: input.userId,
    rule,
    severity,
    status: "OPEN" as const,
    transactionId: input.transactionId ?? null,
    details: {
      ...details,
      transactionRef: input.transactionRef,
      transactionType: input.transactionType,
      amount: input.absAmount,
      occurredAt: (input.occurredAt ?? new Date()).toISOString(),
    },
  };
}

/**
 * Evaluate a single money movement for AML risk and persist any flag it
 * triggers. Safe to call fire-and-forget: it never throws into the money
 * flow, and every unexpected error is caught + logged.
 */
export async function evaluateTransaction(
  input: AmlEvaluationInput,
): Promise<void> {
  try {
    const flags: Array<ReturnType<typeof makeFlag>> = [];
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, tier: true, createdAt: true },
    });
    if (!user) return;

    const limits = getLimitsForTier(user.tier);
    const now = input.occurredAt ?? new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Rule 1 — LARGE_SINGLE_TX: movement at/above half the tier daily cap.
    const largeThreshold = limits.dailyLimit / 2;
    if (input.absAmount >= largeThreshold) {
      flags.push(
        makeFlag(
          input,
          "LARGE_SINGLE_TX",
          input.absAmount >= limits.dailyLimit ? "HIGH" : "MEDIUM",
          { largeThreshold, tierDailyLimit: limits.dailyLimit },
        ),
      );
    }

    // Aggregate rolling 24h volume across ALL of the user's movements so
    // different instrument types combine (this catches layering).
    const volume = await prisma.transaction.aggregate({
      where: {
        OR: [{ senderId: user.id }, { receiverId: user.id }],
        status: { in: ["SUCCESSFUL", "PENDING"] },
        timestamp: { gte: since24h },
      },
      _sum: { amount: true },
    });

    const rollingVolume = Math.abs(Number(volume._sum.amount ?? 0));
    const projectedVolume = rollingVolume + input.absAmount;

    // Rule 2 — VELOCITY_24H: projected 24h volume crosses the tier cap.
    if (projectedVolume >= limits.dailyLimit && rollingVolume > 0) {
      flags.push(
        makeFlag(
          input,
          "VELOCITY_24H",
          projectedVolume >= limits.dailyLimit * 2 ? "CRITICAL" : "HIGH",
          {
            rolling24h: rollingVolume,
            projected: projectedVolume,
            tierDailyLimit: limits.dailyLimit,
          },
        ),
      );
    }

    // Rule 3 — STRUCTURING_24H: several small cash-out movements below the
    // per-tx limit inside 24h (classic smurfing signature).
    if (
      (input.transactionType === "TRANSFER" ||
        input.transactionType === "WITHDRAWAL") &&
      input.absAmount < limits.maxPerTransaction
    ) {
      const smallMoves = await prisma.transaction.count({
        where: {
          OR: [{ senderId: user.id }],
          transactionType: { in: ["TRANSFER", "WITHDRAWAL"] },
          status: { in: ["SUCCESSFUL", "PENDING"] },
          timestamp: { gte: since24h },
          amount: { lt: limits.maxPerTransaction },
        },
      });
      // +1 for this movement itself
      if (smallMoves + 1 >= STRUCTURING_MIN_MOVES) {
        flags.push(
          makeFlag(
            input,
            "STRUCTURING_24H",
            smallMoves + 1 >= 6 ? "HIGH" : "MEDIUM",
            { movesIn24h: smallMoves + 1, thresholdPerMove: limits.maxPerTransaction },
          ),
        );
      }
    }

    // Rule 4 — NEW_ACCOUNT_MOVES: money moved within days of sign-up.
    const accountAgeDays =
      (now.getTime() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (accountAgeDays <= ACCOUNT_AGE_DAYS) {
      flags.push(
        makeFlag(input, "NEW_ACCOUNT_MOVES", "MEDIUM", {
          accountAgeDays: Math.round(accountAgeDays * 10) / 10,
          thresholdDays: ACCOUNT_AGE_DAYS,
        }),
      );
    }

    // Rule 5 — ROUND_AMOUNT: whole-dollar amounts are common in structuring.
    if (input.absAmount >= 100 && input.absAmount % 100 === 0) {
      flags.push(
        makeFlag(input, "ROUND_AMOUNT", "LOW", { amount: input.absAmount }),
      );
    }

    if (flags.length > 0) {
      // CRITICAL severity ⇒ AUTOMATIC account freeze so no further money can
      // move until ops reviews (admin can unfreeze). This is the enforcement
      // upgrade: flags still never block the *current* movement (latency),
      // but a CRITICAL pattern stops the NEXT one.
      if (flags.some((f) => f.severity === "CRITICAL")) {
        await prisma.user.update({
          where: { id: input.userId },
          data: { isFrozen: true },
        });
        logger.warn(
          { userId: input.userId, rules: flags.map((f) => f.rule) },
          "CRITICAL AML rule hit — account auto-frozen (ops review required)",
        );
      }
      await prisma.amlFlag.createMany({ data: flags });
      logger.warn(
        { userId: input.userId, flags: flags.map((f) => f.rule) },
        "AML flags raised",
      );
    }
  } catch (err: any) {
    // AML monitoring must NEVER break the money movement itself.
    logger.error({ err: err.message }, "AML evaluation failed");
  }
}

/**
 * Convenience wrapper for services that only track one side of a movement
 * (transfer sender, withdrawal, deposit receiver, refund).
 */
export function sandboxAml(input: AmlEvaluationInput): void {
  void evaluateTransaction(input);
}