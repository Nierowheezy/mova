import { describe, expect, it } from "vitest";
import { TransferSchema } from "../../src/modules/transfer/dto/transfer.dto";
import { DepositSchema } from "../../src/modules/deposit/dto/deposit.dto";
import { WithdrawSchema } from "../../src/modules/withdraw/dto/withdraw.dto";

describe("DTO validation", () => {
  it("transfer requires a positive amount and a 4+ char PIN", () => {
    const ok = TransferSchema.safeParse({
      body: {
        walletId: "1234567890",
        amount: 10,
        transactionPin: "1234",
      },
    });
    expect(ok.success).toBe(true);

    const badAmount = TransferSchema.safeParse({
      body: { walletId: "1234567890", amount: 0, transactionPin: "1234" },
    });
    expect(badAmount.success).toBe(false);
  });

  it("deposit requires a uuid idempotency key (double-charge prevention)", () => {
    const missing = DepositSchema.safeParse({
      body: { paymentMethodId: "pm_1", amount: 10 },
    });
    expect(missing.success).toBe(false);

    const badShape = DepositSchema.safeParse({
      body: {
        paymentMethodId: "pm_1",
        amount: 10,
        idempotencyKey: "not-a-uuid",
      },
    });
    expect(badShape.success).toBe(false);

    const ok = DepositSchema.safeParse({
      body: {
        paymentMethodId: "pm_1",
        amount: 10,
        idempotencyKey: "6f5d3433-2f3e-4f1b-9b2f-3a1c1d2e3f4a",
      },
    });
    expect(ok.success).toBe(true);
  });

  it("withdraw requires an idempotency key and defaults currency", () => {
    const missing = WithdrawSchema.safeParse({
      body: { amount: 10 },
    });
    expect(missing.success).toBe(false);

    const ok = WithdrawSchema.safeParse({
      body: {
        amount: 10,
        idempotencyKey: "6f5d3433-2f3e-4f1b-9b2f-3a1c1d2e3f4a",
      },
    });
    expect(ok.success).toBe(true);
    expect(ok.data!.body.currency).toBe("usd");
  });
});