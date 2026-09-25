import { Request, Response } from "express";
import { ExportService } from "./export.service";
import { ExportQuerySchema } from "./dto/export.dto";

const exportService = new ExportService();

export class ExportController {
  async exportTransactions(req: Request, res: Response): Promise<void> {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
      return;
    }

    const validated = ExportQuerySchema.parse(req);
    const csvStream = await exportService.exportTransactionsToCSV(
      userId,
      validated.query,
    );

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=transactions.csv",
    );
    csvStream.pipe(res);
    // No return needed because the response is already sent, but TypeScript requires a return statement
    // We can just return (implicitly) or add `return;`
    return;
  }
}
