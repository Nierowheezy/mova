import { prisma } from "../../config/database";

export class BeneficiaryService {
  async getBeneficiaries(userId: number) {
    const beneficiaries = await prisma.beneficiary.findMany({
      where: { userId },
      include: {
        beneficiaryUser: {
          select: {
            id: true,
            email: true,
            username: true,
            wallet: {
              select: { walletId: true },
            },
            kycProfile: {
              select: { fullName: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return beneficiaries.map((b) => ({
      id: b.id,
      name:
        b.beneficiaryUser.kycProfile?.fullName || b.beneficiaryUser.username,
      email: b.beneficiaryUser.email,
      walletId: b.beneficiaryUser.wallet?.walletId,
      createdAt: b.createdAt,
    }));
  }

  async addBeneficiary(userId: number, targetWalletId: string) {
    // Find the target user by wallet ID
    const targetWallet = await prisma.wallet.findUnique({
      where: { walletId: targetWalletId },
      include: { user: true },
    });

    if (!targetWallet) {
      throw new Error("Wallet not found");
    }

    if (targetWallet.userId === userId) {
      throw new Error("Cannot add yourself as beneficiary");
    }

    const beneficiary = await prisma.beneficiary.upsert({
      where: {
        userId_beneficiaryUserId: {
          userId: userId,
          beneficiaryUserId: targetWallet.userId,
        },
      },
      update: {},
      create: {
        userId: userId,
        beneficiaryUserId: targetWallet.userId,
      },
      include: {
        beneficiaryUser: {
          include: {
            wallet: true,
            kycProfile: true,
          },
        },
      },
    });

    return {
      id: beneficiary.id,
      name:
        beneficiary.beneficiaryUser.kycProfile?.fullName ||
        beneficiary.beneficiaryUser.username,
      email: beneficiary.beneficiaryUser.email,
      walletId: beneficiary.beneficiaryUser.wallet?.walletId,
      createdAt: beneficiary.createdAt,
    };
  }

  async removeBeneficiary(userId: number, beneficiaryId: number) {
    const beneficiary = await prisma.beneficiary.findFirst({
      where: {
        id: beneficiaryId,
        userId: userId,
      },
    });

    if (!beneficiary) {
      throw new Error("Beneficiary not found");
    }

    await prisma.beneficiary.delete({
      where: { id: beneficiaryId },
    });

    return { message: "Beneficiary removed successfully" };
  }
}
