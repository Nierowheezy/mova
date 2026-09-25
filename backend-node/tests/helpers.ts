import { prisma } from "../src/config/database";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { generateAccessToken } from "../src/config/jwt";
import {
  walletAccountId,
  LEDGER_TYPES,
} from "../src/services/ledger.service";

export const TEST_PASSWORD = "StrongPass123!";
export const TEST_PIN = "1234";

/** Wipe all tables (children first) so each suite starts clean. */
export async function resetDatabase() {
  await prisma.amlFlag.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.ledgerAccount.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.savingsGoal.deleteMany();
  await prisma.beneficiary.deleteMany();
  await prisma.passwordHistory.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.kYC.deleteMany();
  await prisma.user.deleteMany();
}

export interface TestUser {
  id: number;
  email: string;
  username: string;
  walletId: string;
  walletDbId: number;
  password: string;
  txPin: string;
}

export async function createUser(opts?: {
  balance?: number;
  kycVerified?: boolean;
  stripeAccountId?: string;
  transactionPin?: boolean;
}): Promise<TestUser> {
  const id = randomUUID().slice(0, 8);
  const email = `user-${id}@example.com`;
  const username = `user-${id}`;
  const password = await bcrypt.hash(TEST_PASSWORD, 4);
  const txPin = opts?.transactionPin === false ? undefined : TEST_PIN;
  const pinHash = txPin ? await bcrypt.hash(txPin, 4) : null;
  // stripe_account_id is unique — always uniquify so multiple users can exist
  const stripeAccountId = opts?.stripeAccountId
    ? `${opts.stripeAccountId}_${randomUUID().slice(0, 8)}`
    : undefined;

  const user = await prisma.user.create({
    data: {
      email,
      username,
      password,
      transactionPin: pinHash,
      stripeAccountId,
      emailVerified: new Date(),
      // Mirrors the KYC-driven tier model: verified users are VERIFIED tier.
      tier: opts?.kycVerified ? "VERIFIED" : "BASIC",
    },
  });

  const wallet = await prisma.wallet.create({
    data: {
      userId: user.id,
      walletId: String(1_000_000_000 + Math.floor(Math.random() * 9_000_000_000)),
      balance: opts?.balance ?? 0,
    },
  });

  // Mirrors the wallet's initial balance in the double-entry ledger so the
  // ledger invariant (wallet balance === ledger balance) holds from birth.
  await prisma.ledgerAccount.upsert({
    where: { accountId: walletAccountId(wallet.id) },
    update: {},
    create: {
      accountId: walletAccountId(wallet.id),
      type: LEDGER_TYPES.CUSTOMER_WALLET,
      balance: opts?.balance ?? 0,
    },
  });

  if (opts?.kycVerified) {
    await prisma.kYC.create({
      data: {
        userId: user.id,
        fullName: `${username} Test`,
        verificationStatus: "VERIFIED",
      },
    });
  }

  return {
    id: user.id,
    email,
    username,
    walletId: wallet.walletId,
    walletDbId: wallet.id,
    password: TEST_PASSWORD,
    txPin: txPin || "",
  };
}

export function bearerToken(userId: number, email: string): string {
  return `Bearer ${generateAccessToken({ userId, email })}`;
}

export async function setBalance(userDbId: number, amount: number) {
  await prisma.wallet.update({
    where: { id: userDbId },
    data: { balance: amount },
  });
}