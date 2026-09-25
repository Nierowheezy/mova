import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { app } from "../src/app";
import { prisma } from "../src/config/database";
import { getWalletLedgerBalance } from "../src/services/ledger.service";
import {
  bearerToken,
  createUser,
  resetDatabase,
} from "./helpers";

const api = () => request(app);

beforeAll(async () => {
  await resetDatabase();
});

describe("POST /api/v1/transfer", () => {
  it("transfers funds between verified users and posts double-entry ledger", async () => {
    const sender = await createUser({ balance: 100, kycVerified: true });
    const receiver = await createUser({ balance: 0 });

    const res = await api()
      .post("/api/v1/transfer")
      .set("Authorization", bearerToken(sender.id, sender.email))
      .send({
        walletId: receiver.walletId,
        amount: 30,
        transactionPin: sender.txPin,
        idempotencyKey: randomUUID(),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("SUCCESSFUL");

    const senderWallet = await prisma.wallet.findUnique({
      where: { id: sender.walletDbId },
    });
    const receiverWallet = await prisma.wallet.findUnique({
      where: { id: receiver.walletDbId },
    });
    expect(Number(senderWallet!.balance)).toBe(70);
    expect(Number(receiverWallet!.balance)).toBe(30);

    // Ledger invariant: wallet balance === ledger account balance
    expect(Number(await getWalletLedgerBalance(sender.walletDbId))).toBe(70);
    expect(Number(await getWalletLedgerBalance(receiver.walletDbId))).toBe(30);

    // Ledger entries balance to zero per transaction
    const entries = await prisma.ledgerEntry.findMany({
      where: { txRef: res.body.data.transferId },
    });
    const sum = entries.reduce((acc, e) => {
      const signed = e.direction === "DEBIT" ? -Number(e.amount) : Number(e.amount);
      return acc + signed;
    }, 0);
    expect(sum).toBe(0);
    expect(entries).toHaveLength(2);
  });

  it("never lets concurrent transfers overspend the balance", async () => {
    // Balance 100; two concurrent transfers of 60 each MUST NOT both succeed.
    const sender = await createUser({ balance: 100, kycVerified: true });
    const receiverA = await createUser({ balance: 0 });
    const receiverB = await createUser({ balance: 0 });

    const attempt = (walletId: string, idemKey: string) =>
      api()
        .post("/api/v1/transfer")
        .set("Authorization", bearerToken(sender.id, sender.email))
        .send({
          walletId,
          amount: 60,
          transactionPin: sender.txPin,
          idempotencyKey: idemKey,
        });

    const [r1, r2] = await Promise.all([
      attempt(receiverA.walletId, randomUUID()),
      attempt(receiverB.walletId, randomUUID()),
    ]);

    const successes = [r1, r2].filter((r) => r.status === 201);
    expect(successes).toHaveLength(1);

    const failed = [r1, r2].find((r) => r.status !== 201)!;
    expect(failed.body.error.code).toBe("INSUFFICIENT_FUNDS");

    // Balance must never go negative
    const after = await prisma.wallet.findUnique({
      where: { id: sender.walletDbId },
    });
    expect(Number(after!.balance)).toBeGreaterThanOrEqual(0);
    expect(Number(after!.balance)).toBe(40);

    // Ledger mirrors the wallet exactly
    expect(Number(await getWalletLedgerBalance(sender.walletDbId))).toBe(40);
    const paidReceivers = await prisma.wallet.aggregate({
      where: { id: { in: [receiverA.walletDbId, receiverB.walletDbId] } },
      _sum: { balance: true },
    });
    expect(Number(paidReceivers._sum.balance)).toBe(60);
  });

  it("blocks unverified users (KYC gate)", async () => {
    const sender = await createUser({ balance: 100 });
    const receiver = await createUser({ balance: 0 });

    const res = await api()
      .post("/api/v1/transfer")
      .set("Authorization", bearerToken(sender.id, sender.email))
      .send({
        walletId: receiver.walletId,
        amount: 10,
        transactionPin: sender.txPin,
        idempotencyKey: randomUUID(),
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("KYC_NOT_VERIFIED");
  });

  it("replays an idempotency key without double-charging", async () => {
    const sender = await createUser({ balance: 100, kycVerified: true });
    const receiver = await createUser({ balance: 0 });
    const key = randomUUID();
    const body = {
      walletId: receiver.walletId,
      amount: 25,
      transactionPin: sender.txPin,
      idempotencyKey: key,
    };

    const first = await api()
      .post("/api/v1/transfer")
      .set("Authorization", bearerToken(sender.id, sender.email))
      .send(body);
    const second = await api()
      .post("/api/v1/transfer")
      .set("Authorization", bearerToken(sender.id, sender.email))
      .send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.transferId).toBe(first.body.data.transferId);

    const wallet = await prisma.wallet.findUnique({
      where: { id: sender.walletDbId },
    });
    expect(Number(wallet!.balance)).toBe(75);
  });

  it("locks the transaction PIN after 5 failed attempts", async () => {
    const sender = await createUser({ balance: 100, kycVerified: true });
    const receiver = await createUser({ balance: 0 });

    for (let i = 0; i < 5; i++) {
      const res = await api()
        .post("/api/v1/transfer")
        .set("Authorization", bearerToken(sender.id, sender.email))
        .send({
          walletId: receiver.walletId,
          amount: 5,
          transactionPin: "0000",
          idempotencyKey: randomUUID(),
        });
      // 4th wrong attempt reports INVALID_PIN, 5th locks
      expect([400, 403]).toContain(res.status);
    }

    const locked = await api()
      .post("/api/v1/transfer")
      .set("Authorization", bearerToken(sender.id, sender.email))
      .send({
        walletId: receiver.walletId,
        amount: 5,
        transactionPin: sender.txPin,
        idempotencyKey: randomUUID(),
      });

    // Even the CORRECT pin is rejected while locked
    expect(locked.status).toBe(403);
    expect(locked.body.error.code).toBe("PIN_LOCKED");
  });

  it("rejects a transfer to your own wallet", async () => {
    const user = await createUser({ balance: 100, kycVerified: true });

    const res = await api()
      .post("/api/v1/transfer")
      .set("Authorization", bearerToken(user.id, user.email))
      .send({
        walletId: user.walletId,
        amount: 5,
        transactionPin: user.txPin,
        idempotencyKey: randomUUID(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("SELF_TRANSFER");
  });

  it("resets PIN-lock state on a successful transfer", async () => {
    const sender = await createUser({ balance: 100, kycVerified: true });
    const receiver = await createUser({ balance: 0 });

    // Fail once, then succeed
    await api()
      .post("/api/v1/transfer")
      .set("Authorization", bearerToken(sender.id, sender.email))
      .send({
        walletId: receiver.walletId,
        amount: 5,
        transactionPin: "0000",
        idempotencyKey: randomUUID(),
      });
    const ok = await api()
      .post("/api/v1/transfer")
      .set("Authorization", bearerToken(sender.id, sender.email))
      .send({
        walletId: receiver.walletId,
        amount: 5,
        transactionPin: sender.txPin,
        idempotencyKey: randomUUID(),
      });

    expect(ok.status).toBe(201);

    const updated = await prisma.user.findUnique({ where: { id: sender.id } });
    expect(updated!.pinFailedAttempts).toBe(0);
    expect(updated!.pinLockedUntil).toBeNull();
  });

  it("enforces the rolling daily aggregate limit", async () => {
    const sender = await createUser({ balance: 1_000_000, kycVerified: true });
    const receiver = await createUser({ balance: 0 });

    // Two 9k transfers = 18k (within 25k daily limit)
    await api()
      .post("/api/v1/transfer")
      .set("Authorization", bearerToken(sender.id, sender.email))
      .send({
        walletId: receiver.walletId,
        amount: 9_000,
        transactionPin: sender.txPin,
        idempotencyKey: randomUUID(),
      });
    const second = await api()
      .post("/api/v1/transfer")
      .set("Authorization", bearerToken(sender.id, sender.email))
      .send({
        walletId: receiver.walletId,
        amount: 9_000,
        transactionPin: sender.txPin,
        idempotencyKey: randomUUID(),
      });

    // A third 9k would push the rolling 24h total to 27k → rejected
    const exceeded = await api()
      .post("/api/v1/transfer")
      .set("Authorization", bearerToken(sender.id, sender.email))
      .send({
        walletId: receiver.walletId,
        amount: 9_000,
        transactionPin: sender.txPin,
        idempotencyKey: randomUUID(),
      });

    expect(second.status).toBe(201);
    expect(exceeded.status).toBe(400);
    expect(exceeded.body.error.code).toBe("DAILY_LIMIT_EXCEEDED");
  });
});