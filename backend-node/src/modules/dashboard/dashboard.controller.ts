import { Request, Response } from "express";
import { DashboardService } from "./dashboard.service";
import { DashboardQuerySchema } from "./dto/dashboard.dto";

const dashboardService = new DashboardService();

export class DashboardController {
  async getDashboard(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const validated = DashboardQuerySchema.parse(req);
    const dashboard = await dashboardService.getDashboard(
      userId,
      validated.query,
    );

    return res.status(200).json({
      success: true,
      data: dashboard,
    });
  }
}