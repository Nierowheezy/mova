import { prisma } from "../../config/database";
import { DashboardQueryDto } from "./dto/dashboard.dto";

export class DashboardService {
  async getDashboard(userId: number, query: DashboardQueryDto) {
    const { transactionLimit } = query;

    // Get wallet
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      select: { balance: true, walletId: true },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    // Get recent transactions
    const recentTransactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { wallet: { userId } },
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      orderBy: { timestamp: "desc" },
      take: transactionLimit,
      include: {
        sender: { select: { username: true, email: true } },
        receiver: { select: { username: true, email: true } },
      },
    });

    // Get savings goals with progress - convert Decimal to Number
    const savingsGoals = await prisma.savingsGoal.findMany({
      where: { wallet: { userId } },
      select: {
        uuid: true,
        name: true,
        targetAmount: true,
        currentAmount: true,
        targetDate: true,
      },
    });

    const savingsWithProgress = savingsGoals.map((goal) => {
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
      };
    });

    // Get unread notifications count
    const unreadNotificationsCount = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    // Get beneficiaries count
    const beneficiariesCount = await prisma.beneficiary.count({
      where: { userId },
    });

    return {
      wallet: {
        balance: Number(wallet.balance),
        walletId: wallet.walletId,
      },
      recentTransactions: recentTransactions.map((tx) => ({
        ...tx,
        amount: Number(tx.amount),
      })),
      savingsGoals: savingsWithProgress,
      unreadNotifications: unreadNotificationsCount,
      beneficiariesCount,
    };
  }
}
