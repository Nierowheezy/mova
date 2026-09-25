import speakeasy from "speakeasy";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { prisma } from "../../config/database";
import { AppError } from "../../shared/utils/AppError";

export class TwoFactorService {
  async generateSecret(userId: number, password: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("User not found", 404);

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) throw new AppError("Invalid password", 401);

    if (user.twoFactorEnabled) {
      throw new AppError("2FA already enabled", 400);
    }

    const secret = speakeasy.generateSecret({
      length: 20,
      name: `FintechApp:${user.email}`,
    });
    const otpauthUrl = secret.otpauth_url!;
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    // Generate backup codes (10 random 8-character codes)
    const backupCodes = Array.from({ length: 10 }, () => {
      return Math.random().toString(36).substring(2, 10).toUpperCase();
    });

    // Hash backup codes before storing
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code, 10)),
    );

    // Save secret and hashed backup codes
    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: secret.base32,
        backupCodes: hashedBackupCodes,
      },
    });

    return {
      secret: secret.base32,
      qrCode: qrCodeDataUrl,
      backupCodes, // plain codes to show to user (only once)
    };
  }

  async verifyAndEnable(userId: number, token: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("User not found", 404);
    if (!user.twoFactorSecret) throw new AppError("2FA not initialized", 400);
    if (user.twoFactorEnabled) throw new AppError("2FA already enabled", 400);

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: "base32",
      token,
      window: 1,
    });

    if (!verified) throw new AppError("Invalid verification code", 400);

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true },
    });

    return { message: "2FA enabled successfully" };
  }

  async disable(userId: number, password: string, token: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError("User not found", 404);
    if (!user.twoFactorEnabled) throw new AppError("2FA is not enabled", 400);

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) throw new AppError("Invalid password", 401);

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret!,
      encoding: "base32",
      token,
      window: 1,
    });
    if (!verified) throw new AppError("Invalid verification code", 400);

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: null,
        twoFactorEnabled: false,
        backupCodes: [],
      },
    });

    return { message: "2FA disabled successfully" };
  }

  async verifyLogin(email: string, password: string, twoFactorCode?: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError("Invalid credentials", 401);

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) throw new AppError("Invalid credentials", 401);

    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        throw new AppError("2FA code required", 401, "2FA_REQUIRED");
      }
      // Check TOTP or backup code
      let verified = false;
      // TOTP
      if (
        user.twoFactorSecret &&
        speakeasy.totp.verify({
          secret: user.twoFactorSecret,
          encoding: "base32",
          token: twoFactorCode,
          window: 1,
        })
      ) {
        verified = true;
      } else {
        // Check backup codes
        const backupCodes = user.backupCodes as string[];
        for (let i = 0; i < backupCodes.length; i++) {
          const match = await bcrypt.compare(twoFactorCode, backupCodes[i]);
          if (match) {
            // Remove used backup code
            backupCodes.splice(i, 1);
            await prisma.user.update({
              where: { id: user.id },
              data: { backupCodes },
            });
            verified = true;
            break;
          }
        }
      }
      if (!verified) throw new AppError("Invalid 2FA code", 401);
    }
    return user;
  }
}
