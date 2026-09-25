import { Request, Response } from "express";
import { TransactionService } from "./transaction.service";
import { TransactionQuerySchema } from "./dto/transaction.dto";
import { PDFService } from "./pdf.service";
import { StatementQuerySchema } from "./dto/statement.dto";

const transactionService = new TransactionService();
const pdfService = new PDFService();

export class TransactionController {
  async getUserTransactions(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const validated = TransactionQuerySchema.parse(req);
    const result = await transactionService.getUserTransactions(
      userId,
      validated.query,
    );

    return res.status(200).json({
      success: true,
      data: result.transactions,
      meta: result.pagination,
    });
  }

  async getTransactionDetails(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    const { reference } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const referenceStr = Array.isArray(reference) ? reference[0] : reference;
    if (!referenceStr) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REFERENCE",
          message: "Invalid transaction reference",
        },
      });
    }

    try {
      const transaction = await transactionService.getTransactionDetails(
        referenceStr,
        userId,
      );
      return res.status(200).json({ success: true, data: transaction });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: error.message },
      });
    }
  }

  async downloadReceiptPdf(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    const { reference } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const referenceStr = Array.isArray(reference) ? reference[0] : reference;
    if (!referenceStr) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_REFERENCE",
          message: "Invalid transaction reference",
        },
      });
    }

    try {
      const pdfStream = await pdfService.generateTransactionReceipt(
        referenceStr,
        userId,
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=receipt-${referenceStr}.pdf`,
      );
      pdfStream.pipe(res);
      return;
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: error.message },
      });
    }
  }

  async downloadStatementPdf(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const validated = StatementQuerySchema.parse(req);
    const { startDate, endDate } = validated.query;

    const pdfStream = await pdfService.generateAccountStatement(
      userId,
      startDate,
      endDate,
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=statement_${startDate.toISOString().slice(0, 10)}_to_${endDate.toISOString().slice(0, 10)}.pdf`,
    );
    pdfStream.pipe(res);
    return;
  }
}
