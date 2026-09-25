import { prisma } from "../config/database";
import { getLimitsForTier } from "../config/limits";
import { AppError } from "../shared/utils/AppError";
import { TransactionType } from "@prisma/client";

/**
 * Enforce per-transaction and rolling 24h aggregate limits for a user.
 * Limits come from the user's KYC tier (BASIC / VERIFIED / PREMIUM) — see
 * src/config/limits.ts for the per-tier table.
 *
 * Counts SUCCESSFUL + PENDING transactions so a pending withdrawal reserves
 * the daily budget.
 *
 * A single transfer creates TWO transaction rows (one per wallet) that share
 * the same externalReference — those are deduplicated so the aggregate counts
 * each economic event exactly once.
 */
export async function enforceTransactionLimits(opts: {
  userId: number;
  amount: number;
  types: TransactionType[];
  /** Column that identifies this user as the money mover for these types. */
  actorFilter: "senderId" | "receiverId";
}) {
  const { userId, amount, types, actorFilter } = opts;

  // Resolve the user's tier (cheap PK lookup) and the limits that tier grants.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true },
  });
  const limits = getLimitsForTier(user?.tier);

  if (amount > limits.maxPerTransaction) {
    throw new AppError(
      `Amount exceeds the maximum allowed per transaction for your account tier ($${limits.maxPerTransaction.toLocaleString()} per transaction). Upgrade your KYC tier for higher limits.`,
      400,
      "TX_LIMIT_EXCEEDED",
    );
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.transaction.findMany({
    where: {
      [actorFilter]: userId,
      transactionType: { in: types },
      status: { in: ["SUCCESSFUL", "PENDING"] },
      timestamp: { gte: since },
    },
    select: { amount: true, externalReference: true, transactionType: true },
  });

  const seenRefs = new Set<string>();
  let spentToday = 0;
  for (const tx of rows) {
    // Transfer pairs share one externalReference — count the pair once.
    if (
      tx.transactionType === "TRANSFER" &&
      tx.externalReference &&
      seenRefs.has(tx.externalReference)
    ) {
      continue;
    }
    if (tx.transactionType === "TRANSFER" && tx.externalReference) {
      seenRefs.add(tx.externalReference);
    }
    spentToday += Math.abs(Number(tx.amount));
  }

  const projected = spentToday + amount;

  if (projected > limits.dailyLimit) {
    const remaining = Math.max(0, limits.dailyLimit - spentToday);
    throw new AppError(
      `Daily transaction limit reached for your account tier. You have $${remaining.toLocaleString()} remaining in the last 24 hours.`,
      400,
      "DAILY_LIMIT_EXCEEDED",
    );
  }
}