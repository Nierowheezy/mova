import { prisma } from "../../config/database";

export class WalletService {
  async getMyWallet(userId: number) {
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            email: true,
            username: true,
            tier: true,
            isFrozen: true,
          },
        },
      },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    return wallet;
  }

  async getWalletByWalletId(walletId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { walletId },
      include: {
        user: {
          select: {
            username: true,
          },
        },
      },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    // Minimal, PII-safe projection — no email / fullName / DOB exposure.
    const kyc = await prisma.kYC.findUnique({
      where: { userId: wallet.userId },
      select: {
        verificationStatus: true,
      },
    });

    return {
      walletId: wallet.walletId,
      username: wallet.user.username,
      verified: kyc?.verificationStatus === "VERIFIED",
    };
  }

  async getWalletBalance(userId: number) {
    const wallet = await prisma.wallet.findUnique({
      where: { userId },
      select: {
        balance: true,
        walletId: true,
      },
    });

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    return wallet;
  }
}
