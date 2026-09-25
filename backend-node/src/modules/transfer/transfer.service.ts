import { prisma } from "../../config/database";
import { TransferDto } from "./dto/transfer.dto";
import bcrypt from "bcryptjs";
import { AppError } from "../../shared/utils/AppError";
import { LIMITS } from "../../config/limits";
import { enforceTransactionLimits } from "../../services/limits.service";
import {
  postDoubleEntry,
  walletAccountId,
  LEDGER_TYPES,
} from "../../services/ledger.service";
import { Prisma } from "@prisma/client";
import { sandboxAml } from "../../services/aml.service";

const IDEMPOTENCY_TTL_MS = LIMITS.IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000;

/** True when a Prisma error is a unique-constraint violation. */
function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
  );
}

/** Lock a wallet row for update and return a fresh balance snapshot. */
async function lockWallet(
  tx: Prisma.TransactionClient,
  walletId: number,
): Promise<{ walletId: number; balance: number }> {
  const rows = await tx.$queryRaw<
    Array<{ id: number; balance: Prisma.Decimal }>
  >`SELECT id, balance FROM wallets WHERE id = ${walletId} FOR UPDATE`;
  if (rows.length === 0) {
    throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");
  }
  return { walletId: rows[0].id, balance: Number(rows[0].balance) };
}

export class TransferService {
  async transfer(userId: number, data: TransferDto, idempotencyKey?: string) {
    const {
      walletId: targetWalletId,
      amount,
      transactionPin,
      saveBeneficiary,
    } = data;

    // ── Fast-path idempotency replay (already committed result) ────────────
    if (idempotencyKey) {
      const existing = await prisma.idempotencyKey.findUnique({
        where: { key: idempotencyKey },
      });
      if (existing) return this.replay(existing.response);
    }

    // ── Load sender with wallet + KYC ──────────────────────────────────────
    const sender = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true, kycProfile: true },
    });

    if (!sender || !sender.wallet) {
      throw new AppError("Sender wallet not found", 404, "WALLET_NOT_FOUND");
    }
    if (sender.isFrozen) {
      throw new AppError(
        "Your account is frozen. Contact support.",
        403,
        "ACCOUNT_FROZEN",
      );
    }

    // ── Transaction PIN brute-force lockout ────────────────────────────────
    if (sender.pinLockedUntil && sender.pinLockedUntil > new Date()) {
      const mins = Math.ceil(
        (sender.pinLockedUntil.getTime() - Date.now()) / 60000,
      );
      throw new AppError(
        `Transaction PIN is locked. Try again in ${mins} minute(s).`,
        403,
        "PIN_LOCKED",
      );
    }

    const isValidPin = await bcrypt.compare(
      transactionPin,
      sender.transactionPin || "",
    );
    if (!isValidPin) {
      const attempts = sender.pinFailedAttempts + 1;
      if (attempts >= LIMITS.PIN_MAX_ATTEMPTS) {
        await prisma.user.update({
          where: { id: userId },
          data: {
            pinFailedAttempts: 0,
            pinLockedUntil: new Date(
              Date.now() + LIMITS.PIN_LOCKOUT_MINUTES * 60 * 1000,
            ),
          },
        });
        throw new AppError(
          `Transaction PIN locked for ${LIMITS.PIN_LOCKOUT_MINUTES} minutes due to too many failed attempts.`,
          403,
          "PIN_LOCKED",
        );
      }
      await prisma.user.update({
        where: { id: userId },
        data: { pinFailedAttempts: attempts },
      });
      throw new AppError(
        `Invalid transaction PIN. ${LIMITS.PIN_MAX_ATTEMPTS - attempts} attempt(s) remaining.`,
        400,
        "INVALID_PIN",
      );
    }

    // ── KYC gate ───────────────────────────────────────────────────────────
    if (
      !sender.kycProfile ||
      sender.kycProfile.verificationStatus !== "VERIFIED"
    ) {
      throw new AppError(
        "KYC not verified. Complete KYC to transfer funds",
        403,
        "KYC_NOT_VERIFIED",
      );
    }

    // ── Destination checks ─────────────────────────────────────────────────
    const receiverWallet = await prisma.wallet.findUnique({
      where: { walletId: targetWalletId },
      include: { user: true },
    });
    if (!receiverWallet) {
      throw new AppError("Destination wallet not found", 404, "WALLET_NOT_FOUND");
    }
    if (receiverWallet.userId === userId) {
      throw new AppError("You cannot transfer to your own wallet", 400, "SELF_TRANSFER");
    }
    if (receiverWallet.user.isFrozen) {
      throw new AppError("Cannot transfer to a frozen account", 403, "RECEIVER_FROZEN");
    }

    // ── Fraud-control limits (rolling 24h aggregate) ───────────────────────
    await enforceTransactionLimits({
      userId,
      amount,
      types: ["TRANSFER"],
      actorFilter: "senderId",
    });

    // ── Atomic transfer with row locks + double-entry ledger ───────────────
    let committed = false;
    const result = await prisma.$transaction(async (tx) => {
      // Race-safe idempotency: reserve the key first (unique constraint holds
      // the line), replay the committed response if it was already claimed.
      if (idempotencyKey) {
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
            const existing = await tx.idempotencyKey.findUnique({
              where: { key: idempotencyKey },
            });
            if (existing) return this.replay(existing.response);
          }
          throw err;
        }
      }

      // Lock BOTH wallets -> serializes concurrent transfers (no overspend)
      const [senderLocked, receiverLocked] = await Promise.all([
        lockWallet(tx, sender.wallet!.id),
        lockWallet(tx, receiverWallet.id),
      ]);

      if (senderLocked.balance < amount) {
        throw new AppError("Insufficient funds", 400, "INSUFFICIENT_FUNDS");
      }

      const updatedSenderWallet = await tx.wallet.update({
        where: { id: senderLocked.walletId },
        data: { balance: { decrement: amount } },
      });
      await tx.wallet.update({
        where: { id: receiverLocked.walletId },
        data: { balance: { increment: amount } },
      });

      const externalRef = `${Date.now()}-${sender.id}-${Math.random()
        .toString(36)
        .substring(2, 10)}`;

      // One transaction record per party (also portable for statements)
      const senderTransaction = await tx.transaction.create({
        data: {
          walletId: senderLocked.walletId,
          transactionType: "TRANSFER",
          amount,
          status: "SUCCESSFUL",
          senderId: sender.id,
          receiverId: receiverWallet.userId,
          externalReference: externalRef,
        },
      });
      const receiverTransaction = await tx.transaction.create({
        data: {
          walletId: receiverLocked.walletId,
          transactionType: "TRANSFER",
          amount,
          status: "SUCCESSFUL",
          senderId: sender.id,
          receiverId: receiverWallet.userId,
          externalReference: externalRef,
        },
      });

      // Double-entry ledger: sender DEBIT → receiver CREDIT
      await postDoubleEntry(tx, {
        debitAccountId: walletAccountId(senderLocked.walletId),
        debitType: LEDGER_TYPES.CUSTOMER_WALLET,
        creditAccountId: walletAccountId(receiverLocked.walletId),
        creditType: LEDGER_TYPES.CUSTOMER_WALLET,
        amount,
        txRef: senderTransaction.reference,
      });

      // Reset PIN lockout state on success
      if (sender.pinFailedAttempts > 0 || sender.pinLockedUntil) {
        await tx.user.update({
          where: { id: userId },
          data: { pinFailedAttempts: 0, pinLockedUntil: null },
        });
      }

      if (saveBeneficiary) {
        await tx.beneficiary.upsert({
          where: {
            userId_beneficiaryUserId: {
              userId: sender.id,
              beneficiaryUserId: receiverWallet.userId,
            },
          },
          update: {},
          create: {
            userId: sender.id,
            beneficiaryUserId: receiverWallet.userId,
          },
        });
      }

      await tx.notification.createMany({
        data: [
          {
            userId: sender.id,
            transactionId: senderTransaction.id,
            status: "TRANSFER",
            title: "Transfer Sent",
            message: `You sent $${amount} to ${receiverWallet.user.username} (${receiverWallet.walletId})`,
          },
          {
            userId: receiverWallet.userId,
            transactionId: receiverTransaction.id,
            status: "TRANSFER",
            title: "Transfer Received",
            message: `You received $${amount} from ${sender.username}`,
          },
        ],
      });

      const payload = {
        transferId: senderTransaction.reference,
        amount,
        from: {
          user: sender.username,
          walletId: sender.wallet!.walletId,
          newBalance: updatedSenderWallet.balance,
        },
        to: {
          user: receiverWallet.user.username,
          walletId: receiverWallet.walletId,
        },
        status: "SUCCESSFUL",
        timestamp: new Date().toISOString(),
      };

      if (idempotencyKey) {
        await tx.idempotencyKey.update({
          where: { key: idempotencyKey },
          data: { response: { success: true, data: payload } },
        });
      }

      committed = true;
      return payload;
    });

    // AML monitoring (non-blocking, best-effort). Runs only for a request that
    // actually moved money now (replays skip this — their first execution
    // already created the flags), so aggregate rules are not double-counted.
    if (committed) {
      sandboxAml({
        userId,
        amount,
        absAmount: amount,
        transactionType: "TRANSFER",
        transactionRef: result.transferId,
      });
    }

    return result;
  }

  private replay(response: unknown) {
    if (
      response &&
      typeof response === "object" &&
      (response as any).success === false
    ) {
      throw new AppError(
        (response as any).message || "This operation previously failed.",
        400,
        "OPERATION_FAILED_PREVIOUSLY",
      );
    }
    const data = (response as any)?.data ?? response;
    return data;
  }
}