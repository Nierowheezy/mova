import { Request, Response } from "express";
import { AdminKYCService } from "../services/kyc.service";

// import { AuditService } from "../../../services/audit.service";

// const _audit = new AuditService(); // if needed later, else comment out

const kycService = new AdminKYCService();

export class AdminKYCController {
  async getPendingKYC(_req: Request, res: Response): Promise<any> {
    const pendingKYC = await kycService.getPendingKYC();

    return res.status(200).json({
      success: true,
      data: pendingKYC,
      meta: { count: pendingKYC.length },
    });
  }

  async getAllKYC(req: Request, res: Response): Promise<any> {
    const { status, page = "1", limit = "20" } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const result = await kycService.getAllKYC(
      status as string,
      pageNum,
      limitNum,
    );

    return res.status(200).json({
      success: true,
      data: result.records,
      meta: {
        total: result.total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(result.total / limitNum),
      },
    });
  }

  async approveKYC(req: Request, res: Response): Promise<any> {
    const { kycId } = req.params;
    const adminId = req.user?.userId!;

    const kycIdStr = Array.isArray(kycId) ? kycId[0] : kycId;
    if (!kycIdStr) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ID", message: "Invalid KYC ID" },
      });
    }

    const kyc = await kycService.approveKYC(parseInt(kycIdStr), adminId);

    return res.status(200).json({
      success: true,
      data: {
        message: "KYC approved successfully",
        user: {
          id: kyc.user.id,
          email: kyc.user.email,
          username: kyc.user.username,
        },
        verificationStatus: kyc.verificationStatus,
      },
    });
  }

  async rejectKYC(req: Request, res: Response): Promise<any> {
    const { kycId } = req.params;
    const { reason } = req.body;
    const adminId = req.user?.userId!;

    const kycIdStr = Array.isArray(kycId) ? kycId[0] : kycId;
    if (!kycIdStr) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ID", message: "Invalid KYC ID" },
      });
    }

    const kyc = await kycService.rejectKYC(parseInt(kycIdStr), adminId, reason);

    return res.status(200).json({
      success: true,
      data: {
        message: "KYC rejected",
        user: {
          id: kyc.user.id,
          email: kyc.user.email,
          username: kyc.user.username,
        },
        verificationStatus: kyc.verificationStatus,
      },
    });
  }
}
