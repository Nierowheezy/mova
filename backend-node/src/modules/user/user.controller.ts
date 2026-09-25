import { Request, Response } from "express";
import { UserService } from "./user.service";
import { ChangePasswordSchema } from "./dto/change-password.dto";
import {
  Enable2FASchema,
  Verify2FASchema,
  Disable2FASchema,
} from "./dto/two-factor.dto";
import { prisma } from "../../config/database";
import bcrypt from "bcryptjs";
import { TwoFactorService } from "./two-factor.service";

const userService = new UserService();
const twoFactorService = new TwoFactorService();

export class UserController {
  // ========== EXISTING METHODS ==========
  async setTransactionPin(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    const { pin } = req.body;

    if (!pin || pin.length < 4) {
      return res.status(400).json({
        success: false,
        error: {
          code: "INVALID_PIN",
          message: "PIN must be at least 4 digits",
        },
      });
    }

    const hashedPin = await bcrypt.hash(pin, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { transactionPin: hashedPin },
    });

    return res.status(200).json({
      success: true,
      data: { message: "Transaction PIN set successfully" },
    });
  }

  async changePassword(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }

    const validated = ChangePasswordSchema.parse(req);

    const result = await userService.changePassword(
      userId,
      validated.body.currentPassword,
      validated.body.newPassword,
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  }

  async checkPasswordStrength(req: Request, res: Response): Promise<any> {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_PASSWORD", message: "Password is required" },
      });
    }

    const result = await userService.validatePasswordStrength(password);

    return res.status(200).json({
      success: true,
      data: result,
    });
  }

  async getProfile(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        twoFactorEnabled: true,
        createdAt: true,
        wallet: {
          select: {
            walletId: true,
            balance: true,
          },
        },
        kycProfile: {
          select: {
            verificationStatus: true,
            fullName: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      data: user,
    });
  }

  // ========== 2FA METHODS ==========
  async enable2FA(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    const { password } = Enable2FASchema.parse(req).body;
    const result = await twoFactorService.generateSecret(userId!, password);
    return res.status(200).json({ success: true, data: result });
  }

  async verify2FA(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    const { token } = Verify2FASchema.parse(req).body;
    const result = await twoFactorService.verifyAndEnable(userId!, token);
    return res.status(200).json({ success: true, data: result });
  }

  async disable2FA(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    const { password, token } = Disable2FASchema.parse(req).body;
    const result = await twoFactorService.disable(userId!, password, token);
    return res.status(200).json({ success: true, data: result });
  }
}
