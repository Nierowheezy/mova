import { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { AppError } from "../shared/utils/AppError";

type Tx = Prisma.TransactionClient;

export const LEDGER_TYPES = {
  CUSTOMER_WALLET: "CUSTOMER_WALLET",
  SAVINGS_GOAL: "SAVINGS_GOAL",
  PLATFORM: "PLATFORM",
} as const;

/** Internal ledger account id for a wallet's locked funds. */
export const walletAccountId = (walletId: number) => `wallet:${walletId}`;
/** Internal ledger account id for a savings goal. */
export const goalAccountId = (uuid: string) => `goal:${uuid}`;
/** Shared platform account used to close deposit/withdrawal double entries. */
export const PLATFORM_ACCOUNT_ID = "platform";

/** Get-or-create a ledger account (upsert is safe under the unique accountId). */
export async function ensureLedgerAccount(
  tx: Tx,
  accountId: string,
  type: string,
) {
  await tx.ledgerAccount.upsert({
    where: { accountId },
    update: {},
    create: { accountId, type },
  });
}

/**
 * Post a double-entry pair (DEBIT + CREDIT) inside the caller's transaction.
 * Locks both ledger accounts in a deterministic order to avoid deadlocks.
 * `amount` must be a positive number.
 */
export async function postDoubleEntry(
  tx: Tx,
  opts: {
    debitAccountId: string;
    debitType: string;
    creditAccountId: string;
    creditType: string;
    amount: number;
    txRef: string;
    currency?: string;
  },
) {
  const {
    debitAccountId,
    debitType,
    creditAccountId,
    creditType,
    amount,
    txRef,
    currency = "usd",
  } = opts;

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError("Ledger amount must be a positive number", 500, "LEDGER_ERROR");
  }

  await ensureLedgerAccount(tx, debitAccountId, debitType);
  await ensureLedgerAccount(tx, creditAccountId, creditType);

  // Lock rows in ascending accountId order — consistent ordering prevents deadlocks
  for (const accountId of [debitAccountId, creditAccountId].sort()) {
    const rows = await tx.$queryRaw<
      Array<{ account_id: string }>
    >`SELECT "accountId" FROM ledger_accounts WHERE "accountId" = ${accountId} FOR UPDATE`;
    if (rows.length === 0) {
      throw new AppError(`Ledger account ${accountId} missing`, 500, "LEDGER_ERROR");
    }
  }

  const [debitAcc, creditAcc] = await Promise.all([
    tx.ledgerAccount.findUniqueOrThrow({ where: { accountId: debitAccountId } }),
    tx.ledgerAccount.findUniqueOrThrow({ where: { accountId: creditAccountId } }),
  ]);

  const newDebitBalance = Number(debitAcc.balance) - amount;
  const newCreditBalance = Number(creditAcc.balance) + amount;

  // Customer-facing accounts must never go negative. The PLATFORM (house)
  // account is the counterparty for external settlement (Stripe) and may go
  // negative — that simply reflects money passing through the platform.
  const customerAccounts: string[] = [
    LEDGER_TYPES.CUSTOMER_WALLET,
    LEDGER_TYPES.SAVINGS_GOAL,
  ];
  if (customerAccounts.includes(debitType) && newDebitBalance < 0) {
    throw new AppError("Insufficient ledger balance", 400, "INSUFFICIENT_FUNDS");
  }

  await tx.ledgerAccount.update({
    where: { accountId: debitAccountId },
    data: { balance: new Prisma.Decimal(newDebitBalance) },
  });
  await tx.ledgerAccount.update({
    where: { accountId: creditAccountId },
    data: { balance: new Prisma.Decimal(newCreditBalance) },
  });

  await tx.ledgerEntry.create({
    data: {
      accountId: debitAccountId,
      direction: "DEBIT",
      amount: new Prisma.Decimal(amount),
      currency,
      balanceAfter: new Prisma.Decimal(newDebitBalance),
      txRef,
    },
  });
  await tx.ledgerEntry.create({
    data: {
      accountId: creditAccountId,
      direction: "CREDIT",
      amount: new Prisma.Decimal(amount),
      currency,
      balanceAfter: new Prisma.Decimal(newCreditBalance),
      txRef,
    },
  });
}

/**
 * Get the authoritative ledger balance for the given wallet.
 * Ensures the account exists (so a brand-new wallet reports 0).
 */
export async function getWalletLedgerBalance(
  walletId: number,
): Promise<Prisma.Decimal> {
  const account = await prisma.ledgerAccount.findUnique({
    where: { accountId: walletAccountId(walletId) },
  });
  if (!account) return new Prisma.Decimal(0);
  return account.balance;
}