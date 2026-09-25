import { Request, Response } from "express";
import { BeneficiaryService } from "./beneficiary.service";
import { AddBeneficiarySchema } from "./dto/beneficiary.dto";

const beneficiaryService = new BeneficiaryService();

export class BeneficiaryController {
  async getBeneficiaries(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const beneficiaries = await beneficiaryService.getBeneficiaries(userId);

    return res.status(200).json({
      success: true,
      data: beneficiaries,
    });
  }

  async addBeneficiary(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const validated = AddBeneficiarySchema.parse(req);
    const beneficiary = await beneficiaryService.addBeneficiary(
      userId,
      validated.body.walletId,
    );

    return res.status(201).json({
      success: true,
      data: beneficiary,
    });
  }

  async removeBeneficiary(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const beneficiaryId = parseInt(Array.isArray(id) ? id[0] : id);
    if (isNaN(beneficiaryId)) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_ID", message: "Invalid beneficiary ID" },
      });
    }

    const result = await beneficiaryService.removeBeneficiary(
      userId,
      beneficiaryId,
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  }
}