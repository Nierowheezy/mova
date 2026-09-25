import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { WebhookController } from "../src/modules/webhook/webhook.controller";
import { prisma } from "../src/config/database";
import { getWalletLedgerBalance } from "../src/services/ledger.service";
import { app } from "../src/app";
import { bearerToken, createUser, resetDatabase } from "./helpers";

const mocks = vi.hoisted(() => ({
  transfers: { create: vi.fn() },
  payouts: { create: vi.fn() },
  webhooks: { constructEvent: vi.fn() },
}));

vi.mock("../src/config/stripe", () => ({
  stripe: {
    transfers: mocks.transfers,
    payouts: mocks.payouts,
    webhooks: mocks.webhooks,
  },
  STRIPE_WEBHOOK_SECRET: "whsec_test",
}));

const api = () => request(app);
const webhook = new WebhookController();

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(() => {
  vi.clearAllMocks();
});

async function SuccessfulWithdraw(userId: number, email: string, amount = 30) {
  mocks.transfers.create.mockResolvedValue({ id: "tr_123" });
  mocks.payouts.create.mockResolvedValue({ id: `po_${randomUUID()}` });
  return api()
    .post("/api/v1/withdraw")
    .set("Authorization", bearerToken(userId, email))
    .send({ amount, currency: "usd", idempotencyKey: randomUUID() });
}

describe("withdraw flow (atomic debit + Stripe)", () => {
  it("atomically debits the wallet and records a PENDING withdrawal", async () => {
    const user = await createUser({
      balance: 100,
      stripeAccountId: "acct_123",
    });
    const res = await SuccessfulWithdraw(user.id, user.email, 30);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("PENDING");

    const wallet = await prisma.wallet.findUnique({
      where: { id: user.walletDbId },
    });
    expect(Number(wallet!.balance)).toBe(70);

    // Ledger mirrors the debit
    expect(Number(await getWalletLedgerBalance(user.walletDbId))).toBe(70);

    const withdrawal = await prisma.transaction.findFirst({
      where: { transactionType: "WITHDRAWAL", senderId: user.id },
    });
    expect(withdrawal).toBeTruthy();
    expect(withdrawal!.status).toBe("PENDING");
    expect(Number(withdrawal!.amount)).toBe(-30);
  });

  it("compensates (refunds + FAILED) when Stripe fails after the internal debit", async () => {
    const user = await createUser({
      balance: 100,
      stripeAccountId: "acct_123",
    });

    mocks.transfers.create.mockResolvedValue({ id: "tr_123" });
    mocks.payouts.create.mockRejectedValueOnce(new Error("payout down"));

    const res = await api()
      .post("/api/v1/withdraw")
      .set("Authorization", bearerToken(user.id, user.email))
      .send({ amount: 40, currency: "usd", idempotencyKey: randomUUID() });

    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("WITHDRAWAL_FAILED");

    // Money is back + transaction cancelled
    const wallet = await prisma.wallet.findUnique({
      where: { id: user.walletDbId },
    });
    expect(Number(wallet!.balance)).toBe(100);
    expect(Number(await getWalletLedgerBalance(user.walletDbId))).toBe(100);

    const withdrawal = await prisma.transaction.findFirst({
      where: { transactionType: "WITHDRAWAL", senderId: user.id },
    });
    expect(withdrawal!.status).toBe("FAILED");
  });

  it("refunds the wallet when the payout later FAILS (webhook)", async () => {
    const user = await createUser({
      balance: 100,
      stripeAccountId: "acct_123",
    });
    const res = await SuccessfulWithdraw(user.id, user.email, 25);

    const withdrawal = await prisma.transaction.findFirst({
      where: { transactionType: "WITHDRAWAL", senderId: user.id },
    });
    expect(withdrawal!.status).toBe("PENDING");
    const payoutId = withdrawal!.externalReference;

    await (webhook as any).refundFailedWithdrawal(payoutId);

    const wallet = await prisma.wallet.findUnique({
      where: { id: user.walletDbId },
    });
    expect(Number(wallet!.balance)).toBe(100);
    expect(Number(await getWalletLedgerBalance(user.walletDbId))).toBe(100);

    const after = await prisma.transaction.findUnique({
      where: { id: withdrawal!.id },
    });
    expect(after!.status).toBe("FAILED");
  });

  it("marks the withdrawal SUCCESSFUL on payout.paid (webhook route)", async () => {
    const user = await createUser({
      balance: 100,
      stripeAccountId: "acct_123",
    });
    const res = await SuccessfulWithdraw(user.id, user.email, 20);

    const withdrawal = await prisma.transaction.findFirst({
      where: { transactionType: "WITHDRAWAL", senderId: user.id },
    });
    const payoutId = withdrawal!.externalReference;
    expect(res.body.data.payoutId).toBe(payoutId);

    const event = {
      id: `evt_${randomUUID()}`,
      type: "payout.paid",
      data: { object: { id: payoutId } },
    };
    mocks.webhooks.constructEvent.mockReturnValue(event);

    const webhookRes = await api()
      .post("/webhook/stripe/connect")
      .set("stripe-signature", "dummy_sig")
      .send({});

    expect(webhookRes.status).toBe(200);

    const after = await prisma.transaction.findUnique({
      where: { id: withdrawal!.id },
    });
    expect(after!.status).toBe("SUCCESSFUL");
  });

  it("requires an idempotency key and a linked Stripe account", async () => {
    const user = await createUser({ balance: 100 });

    const noKey = await api()
      .post("/api/v1/withdraw")
      .set("Authorization", bearerToken(user.id, user.email))
      .send({ amount: 10, currency: "usd" });
    expect(noKey.status).toBe(400);
    expect(noKey.body.error.code).toBe("VALIDATION_ERROR");

    const noStripe = await api()
      .post("/api/v1/withdraw")
      .set("Authorization", bearerToken(user.id, user.email))
      .send({ amount: 10, currency: "usd", idempotencyKey: randomUUID() });
    expect(noStripe.status).toBe(400);
    expect(noStripe.body.error.code).toBe("STRIPE_CONNECT_NOT_ONBOARDED");
  });
});