import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { randomUUID } from "crypto";
import { WebhookController } from "../src/modules/webhook/webhook.controller";
import { prisma } from "../src/config/database";
import { getWalletLedgerBalance } from "../src/services/ledger.service";
import { app } from "../src/app";
import { bearerToken, createUser, resetDatabase } from "./helpers";

const mocks = vi.hoisted(() => ({
  paymentIntents: { create: vi.fn(), confirm: vi.fn() },
  webhooks: { constructEvent: vi.fn() },
}));

vi.mock("../src/config/stripe", () => ({
  stripe: {
    paymentIntents: mocks.paymentIntents,
    webhooks: mocks.webhooks,
  },
  STRIPE_WEBHOOK_SECRET: "whsec_test",
}));

const api = () => request(app);
const webhook = new WebhookController();
const pay = (webhook as any).handlePaymentIntentSucceeded.bind(webhook);

/** Create a PENDING deposit via the HTTP API. */
async function makePendingDeposit(userId: number, email: string, amount: number) {
  const piId = `pi_${randomUUID()}`;
  mocks.paymentIntents.create.mockResolvedValue({ id: piId });
  mocks.paymentIntents.confirm.mockResolvedValue({ id: piId, status: "succeeded" });

  const res = await api()
    .post("/api/v1/deposit")
    .set("Authorization", bearerToken(userId, email))
    .send({
      paymentMethodId: "pm_card_visa",
      amount,
      idempotencyKey: randomUUID(),
    });

  expect(res.status).toBe(200);
  expect(res.body.data.status).toBe("PENDING");
  return piId;
}

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deposit flow (webhook-authoritative crediting)", () => {
  it("records a PENDING deposit and does NOT credit the wallet in the request", async () => {
    const user = await createUser({ balance: 0 });
    const piId = await makePendingDeposit(user.id, user.email, 50);

    const deposit = await prisma.transaction.findFirst({
      where: { transactionType: "DEPOSIT", externalReference: piId },
    });
    expect(deposit).toBeTruthy();
    expect(deposit!.status).toBe("PENDING");

    const wallet = await prisma.wallet.findUnique({
      where: { id: user.walletDbId },
    });
    expect(Number(wallet!.balance)).toBe(0);
  });

  it("credits the wallet exactly once from the webhook", async () => {
    const user = await createUser({ balance: 0 });
    const piId = await makePendingDeposit(user.id, user.email, 30);

    const result = await pay({ id: piId, amount: 3000 });
    expect(result.credited).toBe(true);

    const wallet = await prisma.wallet.findUnique({
      where: { id: user.walletDbId },
    });
    expect(Number(wallet!.balance)).toBe(30);
    expect(Number(await getWalletLedgerBalance(user.walletDbId))).toBe(30);

    // Second delivery of the same event → skipped, balance unchanged
    const replay = await pay({ id: piId, amount: 3000 });
    expect(replay.skipped).toBe(true);
    expect(replay.reason).toBe("ALREADY_PROCESSED");

    const walletAfter = await prisma.wallet.findUnique({
      where: { id: user.walletDbId },
    });
    expect(Number(walletAfter!.balance)).toBe(30);
  });

  it("rejects an amount mismatch (no credit, stays PENDING)", async () => {
    const user = await createUser({ balance: 0 });
    const piId = await makePendingDeposit(user.id, user.email, 50);

    // Charged amount (99.99) differs from recorded (50.00)
    const result = await pay({ id: piId, amount: 9999 });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("AMOUNT_MISMATCH");

    const deposit = await prisma.transaction.findFirst({
      where: { transactionType: "DEPOSIT", externalReference: piId },
    });
    expect(deposit!.status).toBe("PENDING");

    const wallet = await prisma.wallet.findUnique({
      where: { id: user.walletDbId },
    });
    expect(Number(wallet!.balance)).toBe(0);
  });

  it("processes the /webhook/stripe route with signature verification (raw body)", async () => {
    const user = await createUser({ balance: 0 });
    const piId = await makePendingDeposit(user.id, user.email, 20);

    const event = {
      id: `evt_${randomUUID()}`,
      type: "payment_intent.succeeded",
      data: { object: { id: piId, amount: 2000 } },
    };
    mocks.webhooks.constructEvent.mockReturnValue(event);

    const res = await api()
      .post("/webhook/stripe")
      .set("stripe-signature", "dummy_sig")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const wallet = await prisma.wallet.findUnique({
      where: { id: user.walletDbId },
    });
    expect(Number(wallet!.balance)).toBe(20);

    // Duplicate delivery → deduplicated, no second credit
    mocks.webhooks.constructEvent.mockReturnValue(event);
    const dup = await api()
      .post("/webhook/stripe")
      .set("stripe-signature", "dummy_sig")
      .send({});

    expect(dup.body.deduplicated).toBe(true);
    const walletAfter = await prisma.wallet.findUnique({
      where: { id: user.walletDbId },
    });
    expect(Number(walletAfter!.balance)).toBe(20);
  });

  it("marks deposits FAILED on payment_failed webhook", async () => {
    const user = await createUser({ balance: 0 });
    const piId = await makePendingDeposit(user.id, user.email, 15);

    const event = {
      id: `evt_${randomUUID()}`,
      type: "payment_intent.payment_failed",
      data: { object: { id: piId } },
    };
    mocks.webhooks.constructEvent.mockReturnValue(event);

    const res = await api()
      .post("/webhook/stripe")
      .set("stripe-signature", "dummy_sig")
      .send({});

    expect(res.status).toBe(200);
    const deposit = await prisma.transaction.findFirst({
      where: { transactionType: "DEPOSIT", externalReference: piId },
    });
    expect(deposit!.status).toBe("FAILED");
  });

  it("requires an idempotency key (validation)", async () => {
    const user = await createUser({ balance: 0 });

    const res = await api()
      .post("/api/v1/deposit")
      .set("Authorization", bearerToken(user.id, user.email))
      .send({ paymentMethodId: "pm_card_visa", amount: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});