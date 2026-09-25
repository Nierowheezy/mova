import { Request, Response } from "express";
import { KYCService } from "./kyc.service";
import { CreateKYCSchema } from "./dto/create-kyc.dto";
import path from "path";
import fs from "fs";
import { env } from "../../config/env";

const kycService = new KYCService();

export class KYCController {
  async createKYC(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const validated = CreateKYCSchema.parse(req);
    const kyc = await kycService.createKYC(userId, validated.body);

    return res.status(201).json({
      success: true,
      data: {
        message: "KYC submitted successfully",
        kyc: {
          fullName: kyc.fullName,
          dateOfBirth: kyc.dateOfBirth,
          idType: kyc.idType,
          idImage: kyc.idImage,
          verificationStatus: kyc.verificationStatus,
          createdAt: kyc.createdAt,
          updatedAt: kyc.updatedAt,
        },
      },
    });
  }

  async getKYC(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    try {
      const kyc = await kycService.getKYC(userId);

      return res.status(200).json({
        success: true,
        data: kyc,
      });
    } catch {
      // No KYC record yet — a 404 lets the frontend show the submission form
      return res.status(404).json({
        success: false,
        error: { code: "KYC_NOT_FOUND", message: "KYC record not found" },
      });
    }
  }

  /**
   * Serve an uploaded KYC document. Access-controlled: only the owner and
   * administrators/support can read a given document. Files are never served
   * from a public static path.
   */
  async downloadDocument(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    const fileName = req.params.fileName as string;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    // Block path traversal
    const safeName = path.basename(fileName);
    if (safeName !== fileName || !safeName) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_FILENAME", message: "Invalid file name" },
      });
    }

    const allowed = await kycService.canAccessDocument(userId, safeName);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        error: { code: "FORBIDDEN", message: "Access denied" },
      });
    }

    const filePath = path.resolve(
      process.cwd(),
      env.UPLOAD_DIR.replace(/\/+$/, ""),
      safeName,
    );
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: { code: "FILE_NOT_FOUND", message: "File not found" },
      });
    }

    res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.sendFile(filePath);
  }
}