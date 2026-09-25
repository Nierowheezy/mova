// ─── Imports ───────────────────────────────────────────────────────────────
import { prisma } from "../../config/database";
import { CreateKYCDto } from "./dto/create-kyc.dto";
import path from "path";

export class KYCService {
  async createKYC(userId: number, data: CreateKYCDto) {
    // Check if user already has KYC
    const existingKYC = await prisma.kYC.findUnique({
      where: { userId },
    });

    if (existingKYC) {
      throw new Error(
        "You already submitted KYC. Contact support for changes.",
      );
    }

    // Create KYC record
    const kyc = await prisma.kYC.create({
      data: {
        userId,
        fullName: data.fullName,
        dateOfBirth: data.dateOfBirth,
        idType: data.idType,
        idImage: data.idImage,
        verificationStatus: "PENDING",
      },
    });

    return kyc;
  }

  async getKYC(userId: number) {
    const kyc = await prisma.kYC.findUnique({
      where: { userId },
    });

    if (!kyc) {
      throw new Error("KYC record not found");
    }

    return kyc;
  }

  async getKYCByUserId(userId: number) {
    return await prisma.kYC.findUnique({
      where: { userId },
    });
  }

  /**
   * True when the user may view a KYC document. Owners of the record are
   * allowed; admins/support can view any document.
   */
  async canAccessDocument(userId: number, fileName: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!user) return false;
    if (user.role === "ADMIN" || user.role === "SUPPORT") return true;

    const kyc = await prisma.kYC.findUnique({ where: { userId } });
    if (!kyc?.idImage) return false;
    return path.basename(kyc.idImage) === fileName;
  }
}
