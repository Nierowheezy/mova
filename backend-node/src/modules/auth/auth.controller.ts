import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { RegisterDtoSchema, LoginDtoSchema, Login2FASchema } from "./dto";
import {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from "../../shared/utils/cookieHelpers";

const authService = new AuthService();

export class AuthController {
  async register(req: Request, res: Response): Promise<any> {
    const validated = RegisterDtoSchema.parse(req);
    const result = await authService.register(validated.body);
    setRefreshTokenCookie(res, result.refreshToken!); // added !
    return res.status(201).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  }

  async login(req: Request, res: Response): Promise<any> {
    const { email, password } = LoginDtoSchema.parse(req).body;
    const ip = (req.ip ?? req.socket?.remoteAddress ?? "unknown") as string;
    const result = await authService.loginStep1(email, password, ip);
    if (result.twoFactorRequired) {
      return res.status(200).json({
        success: true,
        twoFactorRequired: true,
        tempToken: result.tempToken,
      });
    }
    setRefreshTokenCookie(res, result.refreshToken!); // added !
    return res.status(200).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  }

  async login2FA(req: Request, res: Response): Promise<any> {
    const { tempToken, twoFactorCode } = Login2FASchema.parse(req).body;
    const ip = (req.ip ?? req.socket?.remoteAddress ?? "unknown") as string;
    const result = await authService.loginStep2(tempToken, twoFactorCode, ip);
    setRefreshTokenCookie(res, result.refreshToken!); // added !
    return res.status(200).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.accessToken,
      },
    });
  }

  async logout(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    const refreshToken = req.cookies.refresh as string | undefined;
    if (userId && refreshToken) {
      await authService.logout(userId, refreshToken);
    }
    clearRefreshTokenCookie(res);
    return res.status(200).json({
      success: true,
      data: { message: "Logged out successfully" },
    });
  }

  async refreshToken(req: Request, res: Response): Promise<any> {
    const refreshToken = req.cookies.refresh;
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "No refresh token provided",
        },
      });
    }
    const result = await authService.refreshToken(refreshToken);
    setRefreshTokenCookie(res, result.refreshToken!); // added !
    return res.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken,
      },
    });
  }

  // ========== EMAIL VERIFICATION ==========
  async sendVerificationEmail(req: Request, res: Response): Promise<any> {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: "UNAUTHORIZED", message: "User not authenticated" },
      });
    }
    const result = await authService.sendVerificationEmail(userId);
    return res.status(200).json({ success: true, data: result });
  }

  async verifyEmail(req: Request, res: Response): Promise<any> {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_TOKEN", message: "Token required" },
      });
    }
    const result = await authService.verifyEmail(token);
    return res.status(200).json({ success: true, data: result });
  }

  // ========== PASSWORD RESET ==========
  async forgotPassword(req: Request, res: Response): Promise<any> {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({
        success: false,
        error: { code: "MISSING_EMAIL", message: "Email required" },
      });
    }
    const result = await authService.sendPasswordReset(email);
    return res.status(200).json({ success: true, data: result });
  }

  async resetPassword(req: Request, res: Response): Promise<any> {
    const { token, newPassword, confirmPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        error: {
          code: "MISSING_FIELDS",
          message: "Token and password required",
        },
      });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: { code: "PASSWORD_MISMATCH", message: "Passwords do not match" },
      });
    }
    const result = await authService.resetPassword(token, newPassword);
    return res.status(200).json({ success: true, data: result });
  }
}
