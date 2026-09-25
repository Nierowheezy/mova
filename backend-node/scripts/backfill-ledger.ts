/**
 * One-time backfill: create double-entry ledger accounts mirroring the current
 * balances of existing wallets and savings goals. Safe to run multiple times
 * (only fills in missing accounts; never overwrites existing ledger balances).
 *
 * Run with: pnpm exec ts-node scripts/backfill-ledger.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import {
  walletAccountId,
  goalAccountId,
  PLATFORM_ACCOUNT_ID,
  LEDGER_TYPES,
} from "../src/services/ledger.service";

const prisma = new PrismaClient();

async function main() {
  const wallets = await prisma.wallet.findMany({
    select: { id: true, balance: true },
  });
  let insertedWallets = 0;
  for (const w of wallets) {
    const accountId = walletAccountId(w.id);
    const existing = await prisma.ledgerAccount.findUnique({
      where: { accountId },
    });
    if (!existing) {
      await prisma.ledgerAccount.create({
        data: {
          accountId,
          type: LEDGER_TYPES.CUSTOMER_WALLET,
          balance: w.balance,
        },
      });
      insertedWallets++;
    }
  }
  console.log(`Ledger accounts created for ${insertedWallets} wallet(s).`);

  const goals = await prisma.savingsGoal.findMany({
    select: { uuid: true, currentAmount: true },
  });
  let insertedGoals = 0;
  for (const g of goals) {
    const accountId = goalAccountId(g.uuid);
    const existing = await prisma.ledgerAccount.findUnique({
      where: { accountId },
    });
    if (!existing) {
      await prisma.ledgerAccount.create({
        data: {
          accountId,
          type: LEDGER_TYPES.SAVINGS_GOAL,
          balance: g.currentAmount,
        },
      });
      insertedGoals++;
    }
  }
  console.log(`Ledger accounts created for ${insertedGoals} savings goal(s).`);

  // Platform house account: the settlement mirror of ALL customer funds
  // (balance must equal -(wallets + goals)). Created ONLY if missing and
  // seeded with the current mirror value. If it already exists (real
  // deposits/withdrawals have flowed through the ledger), it is left
  // untouched — the nightly reconciliation (`pnpm db:reconcile`) verifies it.
  const existingPlatform = await prisma.ledgerAccount.findUnique({
    where: { accountId: PLATFORM_ACCOUNT_ID },
  });
  if (!existingPlatform) {
    const customerTotal =
      wallets.reduce((sum, w) => sum + Number(w.balance), 0) +
      goals.reduce((sum, g) => sum + Number(g.currentAmount), 0);
    await prisma.ledgerAccount.create({
      data: {
        accountId: PLATFORM_ACCOUNT_ID,
        type: LEDGER_TYPES.PLATFORM,
        balance: new Prisma.Decimal(-customerTotal),
      },
    });
    console.log(
      `Ledger account created for the platform house account (balance ${(-customerTotal).toFixed(2)}).`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());