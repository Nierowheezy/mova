import { prisma } from "../../config/database";
import { ExportQueryDto } from "./dto/export.dto";
import { Readable } from "stream";

export class ExportService {
  async exportTransactionsToCSV(
    userId: number,
    query: ExportQueryDto,
  ): Promise<Readable> {
    const { startDate, endDate, type } = query;

    const where: any = {
      OR: [
        { wallet: { userId } },
        { senderId: userId },
        { receiverId: userId },
      ],
    };
    if (type) where.transactionType = type;
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = new Date(startDate);
      if (endDate) where.timestamp.lte = new Date(endDate);
    }

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { timestamp: "desc" },
      include: {
        sender: { select: { username: true, email: true } },
        receiver: { select: { username: true, email: true } },
      },
    });

    // Create CSV header
    const header = [
      "Reference",
      "Date",
      "Type",
      "Amount",
      "Status",
      "Sender",
      "Receiver",
      "External Ref",
    ];
    const rows = transactions.map((tx) => [
      tx.reference,
      tx.timestamp.toISOString(),
      tx.transactionType,
      Number(tx.amount).toFixed(2),
      tx.status,
      tx.sender?.username || "N/A",
      tx.receiver?.username || "N/A",
      tx.externalReference || "",
    ]);

    const csvContent = [header, ...rows].map((row) => row.join(",")).join("\n");
    const readable = new Readable();
    readable.push(csvContent);
    readable.push(null);

    return readable;
  }
}