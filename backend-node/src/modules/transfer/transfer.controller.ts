import { Request, Response } from "express";
import { TransferService } from "./transfer.service";
import { TransferSchema } from "./dto/transfer.dto";

const transferService = new TransferService();

export class TransferController {
  async transfer(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const validated = TransferSchema.parse(req);
    const result = await transferService.transfer(
      userId,
      validated.body,
      validated.body.idempotencyKey,
    );

    return res.status(201).json({
      success: true,
      data: result,
    });
  }
}
