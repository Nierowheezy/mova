import { Request, Response } from "express";
import { AdminAmlService } from "../services/aml.service";
import { ReviewAmlFlagSchema } from "../dto/review-flag.dto";

const amlService = new AdminAmlService();

export class AdminAmlController {
  /** GET /api/v1/admin/aml/flags?status=&severity=&rule=&userId=&page=&limit= */
  async listFlags(req: Request, res: Response): Promise<any> {
    const { status, severity, rule, userId, page = "1", limit = "20" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = Math.min(parseInt(limit as string), 100);

    const result = await amlService.listFlags({
      status: status as string | undefined,
      severity: severity as string | undefined,
      rule: rule as string | undefined,
      userId: userId ? parseInt(userId as string) : undefined,
      page: pageNum,
      limit: limitNum,
    });

    return res.status(200).json({
      success: true,
      data: result.flags,
      meta: {
        total: result.total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(result.total / limitNum),
      },
    });
  }

  /** GET /api/v1/admin/aml/flags/:flagId */
  async getFlag(req: Request, res: Response): Promise<any> {
    const { flagId } = req.params;
    const flag = await amlService.getFlag(parseInt(flagId as string));
    return res.status(200).json({ success: true, data: flag });
  }

  /** GET /api/v1/admin/aml/summary — queue health for the ops dashboard */
  async getSummary(_req: Request, res: Response): Promise<any> {
    const summary = await amlService.getSummary();
    return res.status(200).json({ success: true, data: summary });
  }

  /** POST /api/v1/admin/aml/flags/:flagId/review */
  async reviewFlag(req: Request, res: Response): Promise<any> {
    const validated = ReviewAmlFlagSchema.parse(req);
    const adminId = req.user?.userId;
    if (!adminId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const flag = await amlService.reviewFlag(
      parseInt(validated.params.flagId, 10),
      adminId,
      validated.body.status,
      validated.body.note,
    );

    return res.status(200).json({
      success: true,
      data: { message: `AML flag marked ${flag.status}`, flag },
    });
  }
}