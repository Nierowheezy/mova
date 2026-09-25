import { Request, Response } from "express";
import { AdminTransactionService } from "../services/transaction.service";

const transactionService = new AdminTransactionService();

export class AdminTransactionController {
  async getAllTransactions(req: Request, res: Response): Promise<any> {
    const {
      page = "1",
      limit = "20",
      type,
      status,
      userId,
      startDate,
      endDate,
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const result = await transactionService.getAllTransactions(
      type as string,
      status as string,
      userId ? parseInt(userId as string) : undefined,
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined,
      pageNum,
      limitNum,
    );

    return res.status(200).json({
      success: true,
      data: result.transactions,
      meta: {
        total: result.total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(result.total / limitNum),
      },
    });
  }

  async getTransactionDetails(req: Request, res: Response): Promise<any> {
    const { reference } = req.params;

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
      const transaction =
        await transactionService.getTransactionDetails(referenceStr);
      return res.status(200).json({ success: true, data: transaction });
    } catch (error: any) {
      return res.status(404).json({
        success: false,
        error: { code: "NOT_FOUND", message: error.message },
      });
    }
  }

  async getTransactionStats(_req: Request, res: Response): Promise<any> {
    const stats = await transactionService.getTransactionStats();

    return res.status(200).json({
      success: true,
      data: stats,
    });
  }
}
