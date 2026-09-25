import PDFDocument from "pdfkit";
import { prisma } from "../../config/database";
import { PassThrough } from "stream";

export class PDFService {
  async generateTransactionReceipt(
    transactionReference: string,
    userId: number,
  ): Promise<PassThrough> {
    const transaction = await prisma.transaction.findFirst({
      where: {
        reference: transactionReference,
        OR: [
          { wallet: { userId } },
          { senderId: userId },
          { receiverId: userId },
        ],
      },
      include: {
        wallet: { include: { user: true } },
        sender: true,
        receiver: true,
      },
    });

    if (!transaction) {
      throw new Error("Transaction not found");
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error("User not found");

    const doc = new PDFDocument({ margin: 50 });
    const stream = new PassThrough();
    doc.pipe(stream);

    // Header
    doc.fontSize(20).text("Fintech Banking App", { align: "center" });
    doc.moveDown();
    doc.fontSize(16).text("Transaction Receipt", { align: "center" });
    doc.moveDown(2);

    // Transaction details
    doc
      .fontSize(12)
      .text(`Receipt No: ${transaction.reference}`, { align: "right" });
    doc.text(`Date: ${transaction.timestamp.toLocaleString()}`, {
      align: "right",
    });
    doc.moveDown();

    doc.fontSize(14).text("Transaction Details", { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Type: ${transaction.transactionType}`);
    doc.text(`Amount: $${Number(transaction.amount).toFixed(2)}`);
    doc.text(`Status: ${transaction.status}`);
    if (transaction.externalReference) {
      doc.text(`External Reference: ${transaction.externalReference}`);
    }
    doc.moveDown();

    doc.fontSize(14).text("Parties", { underline: true });
    doc.moveDown(0.5);
    if (transaction.sender) {
      doc.text(
        `From: ${transaction.sender.username} (${transaction.sender.email})`,
      );
    } else {
      doc.text(`From: ${user.username} (${user.email})`);
    }
    if (transaction.receiver) {
      doc.text(
        `To: ${transaction.receiver.username} (${transaction.receiver.email})`,
      );
    } else if (transaction.transactionType === "DEPOSIT") {
      doc.text(`To: Wallet ${transaction.wallet.walletId}`);
    } else {
      doc.text(`To: ${user.username} (self)`);
    }
    doc.moveDown();

    // Footer
    doc
      .fontSize(10)
      .text("Thank you for banking with us.", { align: "center" });
    doc.end();

    return stream;
  }

  async generateAccountStatement(
    userId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<PassThrough> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { wallet: true, kycProfile: true },
    });
    if (!user) throw new Error("User not found");

    const transactions = await prisma.transaction.findMany({
      where: {
        OR: [
          { wallet: { userId } },
          { senderId: userId },
          { receiverId: userId },
        ],
        timestamp: { gte: startDate, lte: endDate },
      },
      orderBy: { timestamp: "asc" },
      include: {
        sender: { select: { username: true } },
        receiver: { select: { username: true } },
      },
    });

    const walletBalance = user.wallet?.balance || 0;
    const totalCredits = transactions
      .filter(
        (tx) => tx.receiverId === userId || tx.transactionType === "DEPOSIT",
      )
      .reduce((sum, tx) => sum + Number(tx.amount), 0);
    const totalDebits = transactions
      .filter(
        (tx) => tx.senderId === userId || tx.transactionType === "WITHDRAWAL",
      )
      .reduce((sum, tx) => sum + Number(tx.amount), 0);

    const doc = new PDFDocument({ margin: 50 });
    const stream = new PassThrough();
    doc.pipe(stream);

    // Header
    doc.fontSize(20).text("Fintech Banking App", { align: "center" });
    doc.moveDown();
    doc.fontSize(16).text("Account Statement", { align: "center" });
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .text(
        `Period: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
        { align: "center" },
      );
    doc.moveDown();
    doc
      .fontSize(10)
      .text(`Account Holder: ${user.kycProfile?.fullName || user.username}`, {
        align: "left",
      });
    doc.text(`Wallet ID: ${user.wallet?.walletId || "N/A"}`, { align: "left" });
    doc.moveDown(2);

    // Summary
    doc.fontSize(12).text("Summary", { underline: true });
    doc
      .fontSize(10)
      .text(`Opening Balance: $${Number(walletBalance).toFixed(2)}`);
    doc.text(`Total Credits: $${totalCredits.toFixed(2)}`);
    doc.text(`Total Debits: $${totalDebits.toFixed(2)}`);
    doc.text(`Closing Balance: $${Number(walletBalance).toFixed(2)}`);
    doc.moveDown();

    // Transaction table
    doc.fontSize(10).text("Transactions", { underline: true });
    doc.moveDown(0.5);

    // Table headers
    const startX = 50;
    let y = doc.y;
    doc.font("Helvetica-Bold");
    doc.text("Date", startX, y);
    doc.text("Description", startX + 100, y);
    doc.text("Amount", startX + 300, y);
    doc.text("Balance", startX + 380, y);
    doc.font("Helvetica");
    y += 20;
    doc
      .moveTo(startX, y)
      .lineTo(startX + 450, y)
      .stroke();

    let runningBalance = Number(walletBalance) - totalCredits + totalDebits; // approximate
    for (const tx of transactions) {
      const isCredit =
        tx.receiverId === userId || tx.transactionType === "DEPOSIT";
      const amount = Number(tx.amount);
      const description = `${tx.transactionType}${tx.sender ? ` from ${tx.sender.username}` : ""}${tx.receiver ? ` to ${tx.receiver.username}` : ""}`;
      runningBalance += isCredit ? amount : -amount;

      doc.text(tx.timestamp.toLocaleDateString(), startX, y);
      doc.text(description.substring(0, 40), startX + 100, y);
      doc.text(`${isCredit ? "+" : "-"}$${amount.toFixed(2)}`, startX + 300, y);
      doc.text(`$${runningBalance.toFixed(2)}`, startX + 380, y);
      y += 20;
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    }

    doc.moveDown();
    doc.fontSize(10).text("End of Statement", { align: "center" });
    doc.end();

    return stream;
  }
}
