import { Request, Response } from "express";
import { SavingsService } from "./savings.service";
import { CreateGoalSchema, DepositGoalSchema, WithdrawGoalSchema } from "./dto";

const savingsService = new SavingsService();

export class SavingsController {
  async createGoal(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const validated = CreateGoalSchema.parse(req);
    const result = await savingsService.createGoal(userId, validated.body);

    return res.status(201).json({
      success: true,
      data: result,
    });
  }

  async depositToGoal(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const validated = DepositGoalSchema.parse(req);
    const result = await savingsService.depositToGoal(userId, validated.body);

    return res.status(200).json({
      success: true,
      data: result,
    });
  }

  async withdrawFromGoal(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const validated = WithdrawGoalSchema.parse(req);
    const result = await savingsService.withdrawFromGoal(
      userId,
      validated.body,
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  }

  async listGoals(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const goals = await savingsService.listGoals(userId);

    return res.status(200).json({
      success: true,
      data: goals,
    });
  }

  async getGoalDetails(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    const { uuid } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const uuidStr = Array.isArray(uuid) ? uuid[0] : uuid;
    if (!uuidStr) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_UUID", message: "Invalid goal UUID" },
      });
    }

    const details = await savingsService.getGoalDetails(userId, uuidStr);

    return res.status(200).json({
      success: true,
      data: details,
    });
  }
}
