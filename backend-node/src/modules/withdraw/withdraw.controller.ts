import { Request, Response } from "express";
import { WithdrawService } from "./withdraw.service";
import { WithdrawSchema } from "./dto/withdraw.dto";

const withdrawService = new WithdrawService();

export class WithdrawController {
  async withdraw(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res
        .status(401)
        .json({ success: false, error: { code: "UNAUTHORIZED" } });
    }

    const validated = WithdrawSchema.parse(req);
    const result = await withdrawService.withdraw(
      userId,
      validated.body,
      validated.body.idempotencyKey,
    );

    return res.json({ success: true, data: result });
  }
}
