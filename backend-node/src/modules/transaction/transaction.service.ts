import { prisma } from "../../config/database";
import { TransactionQueryDto } from "./dto/transaction.dto";

export class TransactionService {
  async getUserTransactions(userId: number, query: TransactionQueryDto) {
    const { page, limit, type, status, startDate, endDate } = query;
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [
        { wallet: { userId } },
        { senderId: userId },
        { receiverId: userId },
      ],
    };
    if (type) where.transactionType = type;
    if (status) where.status = status;
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
            select: { walletId: true },
          },
          sender: {
            select: { id: true, email: true, username: true },
          },
          receiver: {
            select: { id: true, email: true, username: true },
          },
        },
        orderBy: { timestamp: "desc" },
        skip,
        take: limit,
      }),
      prisma.transaction.count({ where }),
    ]);

    return {
      transactions,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async getTransactionDetails(reference: string, userId: number) {
    const transaction = await prisma.transaction.findFirst({
      where: {
        reference,
        OR: [
          { wallet: { userId } },
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      include: {
        wallet: { select: { walletId: true } },
        sender: { select: { id: true, email: true, username: true } },
        receiver: { select: { id: true, email: true, username: true } },
        notifications: true,
      },
    });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    return transaction;
  }
}
