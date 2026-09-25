import { prisma } from "../../config/database";
import { stripe } from "../../config/stripe";
import { AppError } from "../../shared/utils/AppError";
import { WithdrawDto } from "./dto/withdraw.dto";
import { LIMITS } from "../../config/limits";
import { enforceTransactionLimits } from "../../services/limits.service";
import {
  postDoubleEntry,
  walletAccountId,
  PLATFORM_ACCOUNT_ID,
  LEDGER_TYPES,
} from "../../services/ledger.service";
import { Prisma } from "@prisma/client";
import { sandboxAml } from "../../services/aml.service";

const IDEMPOTENCY_TTL_MS = LIMITS.IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000;

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

export class WithdrawService {
  async withdraw(userId: number, data: WithdrawDto, idempotencyKey: string) {
    const { amount, currency } = data;

    // Fast-path idempotency replay
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    });
    if (existing) return this.replay(existing.response);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true },
    });
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
    if (user.isFrozen) {
      throw new AppError(
        "Your account is frozen. Contact support.",
        403,
        "ACCOUNT_FROZEN",
      );
    }
    if (!user.stripeAccountId) {
      throw new AppError(
        "You have not linked a bank account yet. Complete Stripe Connect onboarding to enable withdrawals.",
        400,
        "STRIPE_CONNECT_NOT_ONBOARDED",
      );
    }

    const wallet = user.wallet;
    if (!wallet) throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");

    await enforceTransactionLimits({
      userId,
      amount,
      types: ["WITHDRAWAL"],
      actorFilter: "senderId",
    });

    // ── Step 1: atomically reserve, debit wallet, record PENDING txn + ledger ──
    const initiated = await prisma.$transaction(async (tx) => {
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

      // Lock the wallet row → no concurrent withdrawal can double-spend.
      const rows = await tx.$queryRaw<
        Array<{ id: number; balance: Prisma.Decimal }>
      >`SELECT id, balance FROM wallets WHERE id = ${wallet.id} FOR UPDATE`;
      if (rows.length === 0) {
        throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");
      }
      if (Number(rows[0].balance) < amount) {
        throw new AppError("Insufficient funds", 400, "INSUFFICIENT_FUNDS");
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      });

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          transactionType: "WITHDRAWAL",
          amount: -amount, // negative reflects the deduction
          status: "PENDING",
          senderId: userId,
          receiverId: userId,
          externalReference: "", // filled with payout.id once created
        },
      });

      // Ledger: wallet DEBIT → platform CREDIT (money exits the system)
      await postDoubleEntry(tx, {
        debitAccountId: walletAccountId(wallet.id),
        debitType: LEDGER_TYPES.CUSTOMER_WALLET,
        creditAccountId: PLATFORM_ACCOUNT_ID,
        creditType: LEDGER_TYPES.PLATFORM,
        amount,
        txRef: transaction.reference,
      });

      const payload = {
        success: true,
        withdrawalId: transaction.reference,
        amount,
        status: "PENDING",
        newBalance: updatedWallet.balance,
        message:
          "Withdrawal initiated. Funds will be sent to your bank account within 1-3 business days.",
      };

      await tx.idempotencyKey.update({
        where: { key: idempotencyKey },
        data: { response: payload },
      });

      return { payload, reference: transaction.reference };
    });

    if ("replay" in initiated) return this.replay(initiated.replay);

    // AML monitoring — the wallet was debited now, so this counts as money
    // movement even if the Stripe payout fails afterwards and is refunded.
    sandboxAml({
      userId,
      amount,
      absAmount: amount,
      transactionType: "WITHDRAWAL",
      transactionRef: initiated.reference,
    });

    // ── Step 2: move money at Stripe (outside the DB tx) ───────────────────
    try {
      // Transfer funds from the platform account to the connected account,
      // then issue the payout to the user's bank.
      await stripe.transfers.create({
        amount: Math.round(amount * 100),
        currency,
        destination: user.stripeAccountId,
      });

      const payout = await stripe.payouts.create(
        {
          amount: Math.round(amount * 100),
          currency,
        },
        {
          stripeAccount: user.stripeAccountId,
          idempotencyKey,
        },
      );

      // Record the authoritative payout id on the transaction.
      await prisma.transaction
        .updateMany({
          where: { reference: initiated.reference },
          data: { externalReference: payout.id },
        })
        .catch(() => undefined);

      return {
        success: true,
        withdrawalId: initiated.reference,
        amount,
        status: "PENDING",
        payoutId: payout.id,
        message:
          "Withdrawal initiated. Funds will be sent to your bank account within 1-3 business days.",
      };
    } catch (error: any) {
      // Compensate the internal debit so the user's balance is restored.
      await this.reverseWithdrawal(initiated.reference);
      const message =
        error?.message || "Withdrawal processing failed. Your funds were refunded.";
      await prisma.idempotencyKey
        .update({
          where: { key: idempotencyKey },
          data: { response: { success: false, message } },
        })
        .catch(() => undefined);
      throw new AppError(message, 502, "WITHDRAWAL_FAILED");
    }
  }

  /** Reverse a PENDING withdrawal: refund wallet, mark FAILED, reverse ledger. */
  private async reverseWithdrawal(reference: string) {
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: { reference, status: "PENDING" },
      });
      if (!transaction) return;

      await tx.transaction.update({
        where: { id: transaction.id },
        data: { status: "FAILED" },
      });

      const refundAmount = Math.abs(Number(transaction.amount));
      if (refundAmount <= 0) return;

      await tx.wallet.update({
        where: { id: transaction.walletId },
        data: { balance: { increment: refundAmount } },
      });

      // Ledger reversal: platform DEBIT → wallet CREDIT (net zero for the pair)
      await postDoubleEntry(tx, {
        debitAccountId: PLATFORM_ACCOUNT_ID,
        debitType: LEDGER_TYPES.PLATFORM,
        creditAccountId: walletAccountId(transaction.walletId),
        creditType: LEDGER_TYPES.CUSTOMER_WALLET,
        amount: refundAmount,
        txRef: transaction.reference,
      });
    });
  }

  private replay(response: unknown) {
    if (response && (response as any).success === false) {
      throw new AppError(
        (response as any).message || "This withdrawal previously failed.",
        400,
        "OPERATION_FAILED_PREVIOUSLY",
      );
    }
    return response;
  }
}