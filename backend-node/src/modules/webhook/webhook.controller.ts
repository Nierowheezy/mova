import { Request, Response } from "express";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../../config/stripe";
import { prisma } from "../../config/database";
import { env } from "../../config/env";
import {
  postDoubleEntry,
  walletAccountId,
  PLATFORM_ACCOUNT_ID,
  LEDGER_TYPES,
} from "../../services/ledger.service";
import { Prisma } from "@prisma/client";
import { sandboxAml } from "../../services/aml.service";

export class WebhookController {
  // Handler for deposit webhooks (payment_intent.succeeded / failed)
  async handleStripeWebhook(req: Request, res: Response): Promise<any> {
    const sig = req.headers["stripe-signature"] as string;
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        STRIPE_WEBHOOK_SECRET!,
      );
    } catch (err: any) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Deduplicate by Stripe event id
    const dedupId = `stripe:${event.id}`;
    const seen = await prisma.webhookEvent.findUnique({
      where: { eventId: dedupId },
    });
    if (seen) return res.json({ received: true, deduplicated: true });

    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object;
          await this.handlePaymentIntentSucceeded(paymentIntent);
          break;
        }
        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object;
          await prisma.transaction.updateMany({
            where: {
              externalReference: paymentIntent.id,
              transactionType: "DEPOSIT",
              status: "PENDING",
            },
            data: { status: "FAILED" },
          });
          break;
        }
        default:
          console.log(`Unhandled event type ${event.type}`);
      }

      await prisma.webhookEvent
        .create({ data: { eventId: dedupId, type: event.type } })
        .catch((err) => {
          if (!(err instanceof Prisma.PrismaClientKnownRequestError)) throw err;
        });

      return res.json({ received: true });
    } catch (err: any) {
      // Do NOT ack — Stripe will retry the delivery
      console.error(`Webhook processing failed for ${event.type}:`, err.message);
      return res.status(500).send(`Webhook processing error: ${err.message}`);
    }
  }

  // Handler for Connect webhooks (payout events)
  async handleStripeConnectWebhook(req: Request, res: Response): Promise<any> {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = env.STRIPE_CONNECT_WEBHOOK_SECRET;
    let event;

    if (!webhookSecret) {
      console.error("STRIPE_CONNECT_WEBHOOK_SECRET is not set");
      return res.status(500).send("Webhook secret missing");
    }

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error(
        `Connect webhook signature verification failed: ${err.message}`,
      );
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    const dedupId = `stripe-connect:${event.id}`;
    const seen = await prisma.webhookEvent.findUnique({
      where: { eventId: dedupId },
    });
    if (seen) return res.json({ received: true, deduplicated: true });

    try {
      switch (event.type) {
        case "payout.paid": {
          const payout = event.data.object;
          // Wallet was already debited at request time — mark the payout settled.
          await prisma.transaction.updateMany({
            where: {
              externalReference: payout.id,
              transactionType: "WITHDRAWAL",
              status: "PENDING",
            },
            data: { status: "SUCCESSFUL" },
          });
          console.log(`Payout ${payout.id} paid successfully`);
          break;
        }
        case "payout.failed": {
          const failedPayout = event.data.object;
          await this.refundFailedWithdrawal(failedPayout.id);
          break;
        }
        default:
          console.log(`Unhandled Connect event type ${event.type}`);
      }

      await prisma.webhookEvent
        .create({ data: { eventId: dedupId, type: event.type } })
        .catch((err) => {
          if (!(err instanceof Prisma.PrismaClientKnownRequestError)) throw err;
        });

      return res.json({ received: true });
    } catch (err: any) {
      console.error(
        `Connect webhook processing failed for ${event.type}:`,
        err.message,
      );
      return res.status(500).send(`Webhook processing error: ${err.message}`);
    }
  }

  /**
   * Credit a deposit ONLY from this webhook. Verifies the charged amount
   * matches the recorded request before touching any balance.
   */
  private async handlePaymentIntentSucceeded(paymentIntent: any) {
    const result = await prisma.$transaction(async (tx) => {
      // Lock the deposit record → concurrent duplicate deliveries can't double-credit
      const rows = await tx.$queryRaw<
        Array<{ id: number; amount: Prisma.Decimal; wallet_id: number; status: string; reference: string; receiver_id: number | null }>
      >`SELECT id, amount, wallet_id, status, reference, receiver_id FROM transactions
         WHERE external_reference = ${paymentIntent.id} AND transaction_type = 'DEPOSIT'
         FOR UPDATE`;
      const deposit = rows[0];
      if (!deposit) return { skipped: true, reason: "DEPOSIT_NOT_FOUND" };
      if (deposit.status !== "PENDING") {
        return { skipped: true, reason: "ALREADY_PROCESSED" };
      }

      const recordedCents = Number(deposit.amount) * 100;
      if (recordedCents !== paymentIntent.amount) {
        // Mismatch — do NOT credit. Alert for manual reconciliation.
        console.error(
          `⚠️  Deposit amount mismatch for intent ${paymentIntent.id}: recorded ${recordedCents}, charged ${paymentIntent.amount}`,
        );
        return { skipped: true, reason: "AMOUNT_MISMATCH" };
      }

      const amount = Number(deposit.amount);
      await tx.transaction.update({
        where: { id: deposit.id },
        data: { status: "SUCCESSFUL" },
      });
      await tx.wallet.update({
        where: { id: deposit.wallet_id },
        data: { balance: { increment: amount } },
      });

      // Ledger: platform DEBIT → wallet CREDIT (funds enter the system)
      await postDoubleEntry(tx, {
        debitAccountId: PLATFORM_ACCOUNT_ID,
        debitType: LEDGER_TYPES.PLATFORM,
        creditAccountId: walletAccountId(deposit.wallet_id),
        creditType: LEDGER_TYPES.CUSTOMER_WALLET,
        amount,
        txRef: deposit.reference,
      });

      return { credited: true, reference: deposit.reference, userId: deposit.receiver_id, amount };
    });

    if (result.skipped && result.reason === "AMOUNT_MISMATCH") {
      // Leave the webhook acknowledged (no infinite retries) but the deposit
      // stays PENDING for manual reconciliation.
      return result;
    }
    console.log(`Deposit credited: ${(result as any).reference ?? "skipped"}`);

    // AML monitoring — only for a credit that actually happened now.
    if (result.credited && result.userId) {
      sandboxAml({
        userId: result.userId,
        amount: result.amount,
        absAmount: Math.abs(result.amount),
        transactionType: "DEPOSIT",
        transactionRef: result.reference,
      });
    }

    return result;
  }

  /** Refund a failed payout: mark FAILED, credit the wallet back, reverse ledger. */
  private async refundFailedWithdrawal(payoutId: string) {
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ id: number; amount: Prisma.Decimal; wallet_id: number; status: string; reference: string }>
      >`SELECT id, amount, wallet_id, status, reference FROM transactions
         WHERE external_reference = ${payoutId} AND transaction_type = 'WITHDRAWAL'
         FOR UPDATE`;
      const withdrawal = rows[0];
      if (!withdrawal || withdrawal.status !== "PENDING") return;

      const refund = Math.abs(Number(withdrawal.amount));
      if (refund <= 0) return;

      await tx.transaction.update({
        where: { id: withdrawal.id },
        data: { status: "FAILED" },
      });
      await tx.wallet.update({
        where: { id: withdrawal.wallet_id },
        data: { balance: { increment: refund } },
      });

      // Ledger reversal: platform DEBIT → wallet CREDIT
      await postDoubleEntry(tx, {
        debitAccountId: PLATFORM_ACCOUNT_ID,
        debitType: LEDGER_TYPES.PLATFORM,
        creditAccountId: walletAccountId(withdrawal.wallet_id),
        creditType: LEDGER_TYPES.CUSTOMER_WALLET,
        amount: refund,
        txRef: withdrawal.reference,
      });

      console.log(`Payout ${payoutId} failed, wallet refunded`);
    });
  }
}