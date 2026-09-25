import { prisma } from "../../config/database";
import bcrypt from "bcryptjs";
import { generateAccessToken, generateRefreshToken } from "../../config/jwt";
import { RegisterDto } from "./dto";
import { randomUUID } from "crypto";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../../services/email.service";
import { AppError } from "../../shared/utils/AppError";

// Use require to avoid TypeScript declaration issues
const isDisposableEmail = require("is-disposable-email") as (
  email: string,
) => Promise<boolean>;

export class AuthService {
  async register(data: RegisterDto) {
    const { email, password } = data;

    // ---- BLOCK DISPOSABLE/TEMPORARY EMAIL DOMAINS ----
    if (await isDisposableEmail(email)) {
      throw new AppError(
        "Temporary email addresses are not allowed. Please use a permanent email address.",
        400,
        "DISPOSABLE_EMAIL",
      );
    }
    // -------------------------------------------------

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: email }, { username: email.split("@")[0] }],
      },
    });

    if (existingUser) {
      throw new AppError(
        "User with this email already exists",
        409,
        "DUPLICATE_EMAIL",
      );
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const username = email.split("@")[0];

    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
      },
    });

    await prisma.wallet.create({
      data: {
        userId: user.id,
        walletId: this.generateWalletId(),
        balance: 0,
      },
    });

    const familyId = randomUUID();
    const payload = { userId: user.id, email: user.email };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        family: familyId,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      accessToken,
      refreshToken,
    };
  }

  // ------------------------------------------------------------
  // LOGIN with 2FA support
  // ------------------------------------------------------------
  async loginStep1(email: string, password: string, ip?: string) {
    // Check account lockout
    const lockoutCheck = await this.checkAccountLockout(email);
    if (lockoutCheck.isLocked) {
      throw new AppError(
        `Account locked. Try again in ${lockoutCheck.remainingMinutes} minutes`,
        403,
        "ACCOUNT_LOCKED",
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      await this.recordFailedAttempt(email, ip);
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await this.recordFailedAttempt(email, ip);
      throw new AppError("Invalid credentials", 401, "INVALID_CREDENTIALS");
    }

    // Clear failed attempts on successful password
    await this.clearFailedAttempts(email);

    // If 2FA is enabled, return a temporary token (short-lived)
    if (user.twoFactorEnabled) {
      // Generate a temp JWT valid for 5 minutes
      const tempToken = generateAccessToken(
        { userId: user.id, email: user.email },
        "5m",
      );
      return { twoFactorRequired: true, tempToken };
    }

    // No 2FA – proceed with normal login
    const familyId = randomUUID();
    const payload = { userId: user.id, email: user.email };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        family: familyId,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.loginAttempt.create({
      data: {
        email,
        userId: user.id,
        success: true,
        ip: ip || null,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      accessToken,
      refreshToken,
    };
  }

  async loginStep2(tempToken: string, twoFactorCode: string, ip?: string) {
    const { verifyToken } = await import("../../config/jwt");
    const payload = verifyToken(tempToken);
    if (!payload) {
      throw new AppError(
        "Invalid or expired temporary token",
        401,
        "INVALID_TEMP_TOKEN",
      );
    }

    const userId = payload.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND");
    }

    let verified = false;

    // TOTP
    if (user.twoFactorSecret) {
      const speakeasy = require("speakeasy");
      verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: "base32",
        token: twoFactorCode,
        window: 1,
      });
    }

    // Backup codes (if TOTP not verified)
    if (!verified && user.backupCodes) {
      const backupCodes = user.backupCodes as string[];
      for (let i = 0; i < backupCodes.length; i++) {
        if (await bcrypt.compare(twoFactorCode, backupCodes[i])) {
          // Remove used backup code
          backupCodes.splice(i, 1);
          await prisma.user.update({
            where: { id: userId },
            data: { backupCodes },
          });
          verified = true;
          break;
        }
      }
    }

    if (!verified) {
      throw new AppError("Invalid 2FA code", 401, "INVALID_2FA_CODE");
    }

    // 2FA passed – issue full tokens
    const familyId = randomUUID();
    const payload2 = { userId: user.id, email: user.email };
    const accessToken = generateAccessToken(payload2);
    const refreshToken = generateRefreshToken(payload2);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        family: familyId,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.loginAttempt.create({
      data: {
        email: user.email,
        userId: user.id,
        success: true,
        ip: ip || null,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      accessToken,
      refreshToken,
    };
  }

  async logout(_userId: number, refreshToken?: string) {
    if (!refreshToken) return { message: "Logged out successfully" };
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { used: true },
    });
    return { message: "Logged out successfully" };
  }

  async refreshToken(oldRefreshToken?: string) {
    if (!oldRefreshToken) {
      throw new AppError("Refresh token missing", 401, "MISSING_TOKEN");
    }
    const { verifyToken } = await import("../../config/jwt");

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: oldRefreshToken },
      include: { user: true },
    });

    if (!storedToken) {
      throw new AppError("Invalid refresh token", 401, "INVALID_TOKEN");
    }

    if (storedToken.used) {
      console.warn(
        `⚠️ Refresh token reuse detected for user ${storedToken.userId}, family ${storedToken.family}`,
      );

      await prisma.refreshToken.updateMany({
        where: { family: storedToken.family },
        data: { used: true },
      });

      throw new AppError(
        "Token reuse detected. Please login again.",
        401,
        "TOKEN_REUSE",
      );
    }

    if (storedToken.expiresAt < new Date()) {
      throw new AppError("Refresh token expired", 401, "TOKEN_EXPIRED");
    }

    const payload = verifyToken(oldRefreshToken);
    if (!payload) {
      throw new AppError("Invalid refresh token", 401, "INVALID_TOKEN");
    }

    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { used: true },
    });

    const newPayload = {
      userId: storedToken.userId,
      email: storedToken.user.email,
    };
    const newAccessToken = generateAccessToken(newPayload);
    const newRefreshToken = generateRefreshToken(newPayload);

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: storedToken.userId,
        family: storedToken.family,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  // ========== EMAIL VERIFICATION ==========
  async sendVerificationEmail(userId: number) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
    if (user.emailVerified)
      throw new AppError("Email already verified", 400, "EMAIL_VERIFIED");

    await prisma.verificationToken.deleteMany({
      where: { userId, type: "EMAIL_VERIFICATION" },
    });

    const token = randomUUID();
    await prisma.verificationToken.create({
      data: {
        token,
        userId,
        type: "EMAIL_VERIFICATION",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await sendVerificationEmail(user.email, token);
    return { message: "Verification email sent" };
  }

  async verifyEmail(token: string) {
    const verificationToken = await prisma.verificationToken.findFirst({
      where: {
        token,
        type: "EMAIL_VERIFICATION",
        expiresAt: { gt: new Date() },
      },
    });
    if (!verificationToken)
      throw new AppError("Invalid or expired token", 400, "INVALID_TOKEN");

    await prisma.$transaction([
      prisma.user.update({
        where: { id: verificationToken.userId },
        data: { emailVerified: new Date() },
      }),
      prisma.verificationToken.delete({ where: { id: verificationToken.id } }),
    ]);
    return { message: "Email verified successfully" };
  }

  // ========== PASSWORD RESET ==========
  async sendPasswordReset(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");

    await prisma.verificationToken.deleteMany({
      where: { userId: user.id, type: "PASSWORD_RESET" },
    });

    const token = randomUUID();
    await prisma.verificationToken.create({
      data: {
        token,
        userId: user.id,
        type: "PASSWORD_RESET",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await sendPasswordResetEmail(user.email, token);
    return { message: "Password reset email sent" };
  }

  async resetPassword(token: string, newPassword: string) {
    const verificationToken = await prisma.verificationToken.findFirst({
      where: {
        token,
        type: "PASSWORD_RESET",
        expiresAt: { gt: new Date() },
      },
    });
    if (!verificationToken)
      throw new AppError("Invalid or expired token", 400, "INVALID_TOKEN");

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: verificationToken.userId },
        data: { password: hashedPassword },
      }),
      prisma.verificationToken.delete({ where: { id: verificationToken.id } }),
      prisma.refreshToken.updateMany({
        where: { userId: verificationToken.userId },
        data: { used: true },
      }),
    ]);
    return { message: "Password reset successfully" };
  }

  // ========== HELPER METHODS ==========
  private async checkAccountLockout(email: string) {
    const attempts = await prisma.loginAttempt.findMany({
      where: {
        email,
        success: false,
        timestamp: {
          gte: new Date(Date.now() - 15 * 60 * 1000),
        },
      },
    });

    if (attempts.length >= 5) {
      const oldestAttempt = attempts[0];
      const lockoutExpiry = new Date(
        oldestAttempt.timestamp.getTime() + 15 * 60 * 1000,
      );
      const remainingMinutes = Math.ceil(
        (lockoutExpiry.getTime() - Date.now()) / 60000,
      );
      return { isLocked: true, remainingMinutes };
    }
    return { isLocked: false, remainingMinutes: 0 };
  }

  private async recordFailedAttempt(email: string, ip?: string) {
    await prisma.loginAttempt.create({
      data: {
        email,
        success: false,
        ip: ip || null,
      },
    });
  }

  private async clearFailedAttempts(email: string) {
    await prisma.loginAttempt.deleteMany({
      where: { email, success: false },
    });
  }

  private generateWalletId(): string {
    return Math.floor(Math.random() * 9000000000 + 1000000000).toString();
  }
}
