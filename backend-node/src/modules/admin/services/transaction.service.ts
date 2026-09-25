import { prisma } from "../../../config/database";

export class AdminTransactionService {
  async getAllTransactions(
    type: string | undefined,
    status: string | undefined,
    userId: number | undefined,
    startDate: Date | undefined,
    endDate: Date | undefined,
    page: number,
    limit: number,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (type) where.transactionType = type;
    if (status) where.status = status;
    if (userId) where.wallet = { userId };
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          wallet: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                },
              },
            },
          },
          sender: {
            select: { id: true, email: true, username: true },
          },
          receiver: {
            select: { id: true, email: true, username: true },
          },
        },
        skip,
        take: limit,
        orderBy: { timestamp: "desc" },
      }),
      prisma.transaction.count({ where }),
    ]);

    return { transactions, total };
  }

  async getTransactionDetails(reference: string) {
    const transaction = await prisma.transaction.findUnique({
      where: { reference },
      include: {
        wallet: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
              },
            },
          },
        },
        sender: {
          select: { id: true, email: true, username: true },
        },
        receiver: {
          select: { id: true, email: true, username: true },
        },
        notifications: true,
      },
    });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    return transaction;
  }

  async getTransactionStats() {
    const stats = await prisma.$transaction([
      prisma.transaction.aggregate({
        where: { status: "SUCCESSFUL" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.groupBy({
        by: ["transactionType"],
        where: { status: "SUCCESSFUL" },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.transaction.groupBy({
        by: ["status"],
        _count: true,
      }),
    ]);

    return {
      totalVolume: stats[0]._sum.amount || 0,
      totalTransactions: stats[0]._count,
      byType: stats[1],
      byStatus: stats[2],
    };
  }
}
