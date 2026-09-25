import { prisma } from "../../config/database";
import { stripe } from "../../config/stripe";
import { DepositDto } from "./dto/deposit.dto";
import { AppError } from "../../shared/utils/AppError";
import { LIMITS } from "../../config/limits";
import { enforceTransactionLimits } from "../../services/limits.service";
import { Prisma } from "@prisma/client";

const IDEMPOTENCY_TTL_MS = LIMITS.IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000;

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export class DepositService {
  /**
   * Create a wallet-fill request. The wallet is NEVER credited here — the
   * Stripe `payment_intent.succeeded` webhook is the single authority that
   * credits the ledger + wallet once the payment actually succeeds.
   */
  async deposit(userId: number, data: DepositDto, idempotencyKey: string) {
    const { paymentMethodId, amount } = data;

    // Fast-path idempotency replay
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    });
    if (existing) return this.replay(existing.response);

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");
    }

    await enforceTransactionLimits({
      userId,
      amount,
      types: ["DEPOSIT"],
      actorFilter: "receiverId",
    });

    const amountInCents = Math.round(amount * 100);

    // 1) Create the PaymentIntent (Stripe-side idempotency via client key).
    //    Stripe replays identical params for the same key → no double charge.
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: amountInCents,
        currency: "usd",
        payment_method: paymentMethodId,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: "never",
        },
        description: `Wallet funding for user ${userId}`,
      },
      { idempotencyKey },
    );

    // 2) Record a PENDING deposit referencing the exact payment intent.
    const claimed = await prisma.$transaction(async (tx) => {
      try {
        await tx.idempotencyKey.create({
          data: {
            key: idempotencyKey,
            userId,
            response: {},
            expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
          },
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          const replay = await tx.idempotencyKey.findUnique({
            where: { key: idempotencyKey },
          });
          if (replay) return { replay: replay.response };
        }
        throw err;
      }

      const record = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          transactionType: "DEPOSIT",
          amount,
          status: "PENDING",
          receiverId: userId,
          externalReference: paymentIntent.id,
        },
      });

      const payload = {
        success: true,
        depositId: record.reference,
        amount,
        status: "PENDING",
        paymentIntentId: paymentIntent.id,
        currency: "usd",
        message:
          "Payment received. Your wallet will be credited once the payment is confirmed.",
      };

      await tx.idempotencyKey.update({
        where: { key: idempotencyKey },
        data: { response: payload },
      });

      return { payload };
    });

    if ("replay" in claimed) return this.replay(claimed.replay);
    if (!("payload" in claimed)) return claimed;

    // 3) Confirm the payment. Do NOT credit here — the webhook does that.
    try {
      const confirmed = await stripe.paymentIntents.confirm(paymentIntent.id);
      if (
        confirmed.status === "requires_action" ||
        confirmed.status === "requires_confirmation"
      ) {
        return {
          ...claimed.payload,
          status: "PENDING",
          clientSecret: confirmed.client_secret,
          requiresAction: true,
        };
      }
    } catch (error: any) {
      // Card declined / auth failure — mark the PENDING deposit FAILED and
      // record the outcome so replays of the same key do not re-charge.
      await prisma.transaction
        .updateMany({
          where: {
            externalReference: paymentIntent.id,
            transactionType: "DEPOSIT",
            status: "PENDING",
          },
          data: { status: "FAILED" },
        })
        .catch(() => undefined);

      const message =
        (error.type === "StripeCardError" && error.message) ||
        "Payment failed. Please try again with a new request.";

      await prisma.idempotencyKey
        .update({
          where: { key: idempotencyKey },
          data: { response: { success: false, message } },
        })
        .catch(() => undefined);

      throw new AppError(message, 400, "PAYMENT_FAILED");
    }

    return claimed.payload;
  }

  private replay(response: unknown) {
    if (response && (response as any).success === false) {
      throw new AppError(
        (response as any).message || "This deposit previously failed.",
        400,
        "OPERATION_FAILED_PREVIOUSLY",
      );
    }
    return response;
  }
}