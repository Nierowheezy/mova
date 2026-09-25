import { prisma } from "../../config/database";
import { AppError } from "../../shared/utils/AppError";
import { CreateGoalDto, DepositGoalDto, WithdrawGoalDto } from "./dto";
import { Prisma } from "@prisma/client";
import {
  postDoubleEntry,
  walletAccountId,
  goalAccountId,
  LEDGER_TYPES,
} from "../../services/ledger.service";

/** Lock a wallet row and return its current balance. */
async function lockWalletBalance(
  tx: Prisma.TransactionClient,
  walletId: number,
): Promise<number> {
  const rows = await tx.$queryRaw<
    Array<{ id: number; balance: Prisma.Decimal }>
  >`SELECT id, balance FROM wallets WHERE id = ${walletId} FOR UPDATE`;
  if (rows.length === 0) {
    throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");
  }
  return Number(rows[0].balance);
}

/** Lock a savings goal row and return its current amount. */
async function lockGoalAmount(
  tx: Prisma.TransactionClient,
  goalId: number,
): Promise<number> {
  const rows = await tx.$queryRaw<
    Array<{ id: number; current_amount: Prisma.Decimal }>
  >`SELECT id, current_amount FROM savings_goals WHERE id = ${goalId} FOR UPDATE`;
  if (rows.length === 0) {
    throw new AppError("Savings goal not found", 404, "GOAL_NOT_FOUND");
  }
  return Number(rows[0].current_amount);
}

export class SavingsService {
  async createGoal(userId: number, data: CreateGoalDto) {
    const { name, targetAmount, targetDate } = data;

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const goal = await prisma.savingsGoal.create({
      data: { walletId: wallet.id, name, targetAmount, targetDate },
    });

    const transaction = await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        transactionType: "SAVINGS",
        amount: 0,
        status: "SUCCESSFUL",
        senderId: userId,
        receiverId: userId,
        externalReference: goal.uuid,
      },
    });

    await prisma.notification.create({
      data: {
        userId,
        transactionId: transaction.id,
        status: "SAVINGS",
        title: "Savings Goal Created",
        message: `You created a new savings goal: "${name}"`,
      },
    });

    return {
      uuid: goal.uuid,
      name: goal.name,
      targetAmount: Number(goal.targetAmount),
      currentAmount: Number(goal.currentAmount),
      targetDate: goal.targetDate,
      progressPercentage: 0,
    };
  }

  async depositToGoal(userId: number, data: DepositGoalDto) {
    const { uuid, amount } = data;

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const goal = await prisma.savingsGoal.findFirst({
      where: { uuid, walletId: wallet.id },
    });
    if (!goal) throw new AppError("Savings goal not found", 404, "GOAL_NOT_FOUND");

    const result = await prisma.$transaction(async (tx) => {
      // Lock wallet; check balance against the locked value (no overspend)
      const balance = await lockWalletBalance(tx, wallet.id);
      if (balance < amount) {
        throw new AppError("Insufficient wallet balance", 400, "INSUFFICIENT_FUNDS");
      }

      const lockedGoal = await tx.savingsGoal.findUnique({
        where: { id: goal.id },
      });
      if (!lockedGoal) {
        throw new AppError("Savings goal not found", 404, "GOAL_NOT_FOUND");
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      });
      const updatedGoal = await tx.savingsGoal.update({
        where: { id: goal.id },
        data: { currentAmount: { increment: amount } },
      });

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          transactionType: "SAVINGS",
          amount,
          status: "SUCCESSFUL",
          senderId: userId,
          receiverId: userId,
          externalReference: goal.uuid,
        },
      });

      // Ledger: wallet DEBIT → savings-goal CREDIT
      await postDoubleEntry(tx, {
        debitAccountId: walletAccountId(wallet.id),
        debitType: LEDGER_TYPES.CUSTOMER_WALLET,
        creditAccountId: goalAccountId(goal.uuid),
        creditType: LEDGER_TYPES.SAVINGS_GOAL,
        amount,
        txRef: transaction.reference,
      });

      await tx.notification.create({
        data: {
          userId,
          transactionId: transaction.id,
          status: "SAVINGS",
          title: "Savings Deposit",
          message: `$${amount} moved from wallet to savings goal "${goal.name}"`,
        },
      });

      return {
        goalUuid: goal.uuid,
        goalName: goal.name,
        walletNewBalance: updatedWallet.balance,
        goalNewCurrentAmount: updatedGoal.currentAmount,
      };
    });

    return {
      ...result,
      walletNewBalance: Number(result.walletNewBalance),
      goalNewCurrentAmount: Number(result.goalNewCurrentAmount),
    };
  }

  async withdrawFromGoal(userId: number, data: WithdrawGoalDto) {
    const { uuid } = data;

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const goal = await prisma.savingsGoal.findFirst({
      where: { uuid, walletId: wallet.id },
    });
    if (!goal) throw new AppError("Savings goal not found", 404, "GOAL_NOT_FOUND");

    const targetAmount = Number(goal.targetAmount);

    const result = await prisma.$transaction(async (tx) => {
      // Lock goal row + wallet; evaluate target against locked values
      const currentAmount = await lockGoalAmount(tx, goal.id);

      if (currentAmount < targetAmount) {
        throw new AppError(
          "Goal not yet reached. Withdrawals are allowed once you've hit your target.",
          400,
          "GOAL_NOT_REACHED",
        );
      }
      if (currentAmount <= 0) {
        throw new AppError("Nothing to withdraw", 400, "NOTHING_TO_WITHDRAW");
      }

      await lockWalletBalance(tx, wallet.id);

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: currentAmount } },
      });
      const updatedGoal = await tx.savingsGoal.update({
        where: { id: goal.id },
        data: { currentAmount: 0 },
      });

      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          transactionType: "SAVINGS",
          amount: currentAmount,
          status: "SUCCESSFUL",
          senderId: userId,
          receiverId: userId,
          externalReference: goal.uuid,
        },
      });

      // Ledger reversal: goal DEBIT → wallet CREDIT
      await postDoubleEntry(tx, {
        debitAccountId: goalAccountId(goal.uuid),
        debitType: LEDGER_TYPES.SAVINGS_GOAL,
        creditAccountId: walletAccountId(wallet.id),
        creditType: LEDGER_TYPES.CUSTOMER_WALLET,
        amount: currentAmount,
        txRef: transaction.reference,
      });

      await tx.notification.create({
        data: {
          userId,
          transactionId: transaction.id,
          status: "SAVINGS",
          title: "Savings Withdrawal",
          message: `$${currentAmount} withdrawn from savings goal "${goal.name}" to your wallet`,
        },
      });

      return {
        goalUuid: goal.uuid,
        goalName: goal.name,
        withdrawnAmount: currentAmount,
        walletNewBalance: updatedWallet.balance,
        goalNewCurrentAmount: updatedGoal.currentAmount,
      };
    });

    return {
      ...result,
      walletNewBalance: Number(result.walletNewBalance),
      goalNewCurrentAmount: Number(result.goalNewCurrentAmount),
    };
  }

  async listGoals(userId: number) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const goals = await prisma.savingsGoal.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
    });

    return goals.map((goal) => {
      const target = Number(goal.targetAmount);
      const current = Number(goal.currentAmount);
      const progress = target > 0 ? (current / target) * 100 : 0;
      return {
        uuid: goal.uuid,
        name: goal.name,
        targetAmount: target,
        currentAmount: current,
        targetDate: goal.targetDate,
        progressPercentage: Number(progress.toFixed(2)),
        createdAt: goal.createdAt,
      };
    });
  }

  async getGoalDetails(userId: number, uuid: string) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new AppError("Wallet not found", 404, "WALLET_NOT_FOUND");

    const goal = await prisma.savingsGoal.findFirst({
      where: { uuid, walletId: wallet.id },
    });
    if (!goal) throw new AppError("Savings goal not found", 404, "GOAL_NOT_FOUND");

    const target = Number(goal.targetAmount);
    const current = Number(goal.currentAmount);
    const progress = target > 0 ? (current / target) * 100 : 0;

    const transactions = await prisma.transaction.findMany({
      where: {
        walletId: wallet.id,
        transactionType: "SAVINGS",
        externalReference: goal.uuid,
      },
      orderBy: { timestamp: "desc" },
    });

    const enrichedTransactions = await Promise.all(
      transactions.map(async (tx) => {
        const notification = await prisma.notification.findFirst({
          where: { transactionId: tx.id },
        });
        let kind = "SAVINGS";
        if (notification) {
          const title = notification.title.toLowerCase();
          if (title.includes("deposit")) kind = "DEPOSIT";
          else if (title.includes("withdrawal")) kind = "WITHDRAWAL";
        }
        return {
          reference: tx.reference,
          amount: Number(tx.amount),
          status: tx.status,
          timestamp: tx.timestamp,
          kind,
        };
      }),
    );

    return {
      goal: {
        uuid: goal.uuid,
        name: goal.name,
        targetAmount: target,
        currentAmount: current,
        targetDate: goal.targetDate,
        progressPercentage: Number(progress.toFixed(2)),
        createdAt: goal.createdAt,
      },
      wallet: {
        walletId: wallet.walletId,
        balance: Number(wallet.balance),
      },
      transactions: enrichedTransactions,
    };
  }
}