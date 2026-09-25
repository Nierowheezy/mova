import { prisma } from "../../config/database";
import bcrypt from "bcryptjs";

export class UserService {
  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ) {
    // Get user with current password
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new Error("Current password is incorrect");
    }

    // Check password history (prevent reuse of last 5 passwords)
    const recentPasswords = await prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    for (const history of recentPasswords) {
      const isReused = await bcrypt.compare(newPassword, history.password);
      if (isReused) {
        throw new Error(
          "Cannot reuse a recent password. Please choose a different password.",
        );
      }
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Save to password history
    await prisma.passwordHistory.create({
      data: {
        userId,
        password: hashedPassword,
      },
    });

    // Invalidate ALL refresh tokens (force re-login on all devices)
    await prisma.refreshToken.updateMany({
      where: { userId },
      data: { used: true },
    });

    return {
      message:
        "Password changed successfully. Please login again on all devices.",
    };
  }

  async validatePasswordStrength(password: string) {
    const checks = {
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /\d/.test(password),
      hasSpecialChar: /[@$!%*?&]/.test(password),
    };

    const isValid = Object.values(checks).every(Boolean);
    const missing = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([check]) => check);

    return { isValid, missing };
  }
}
