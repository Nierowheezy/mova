import { Request, Response } from "express";
import { DepositService } from "./deposit.service";
import { DepositSchema } from "./dto/deposit.dto";

const depositService = new DepositService();

export class DepositController {
  async deposit(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const validated = DepositSchema.parse(req);
    const result = await depositService.deposit(
      userId,
      validated.body,
      validated.body.idempotencyKey,
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  }
}
