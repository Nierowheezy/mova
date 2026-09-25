import { PrismaClient } from "@prisma/client";
import { encrypt, decrypt } from "../shared/utils/encryption";

// PrismaClient singleton for production
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// Encryption middleware – only for KYC.fullName
prisma.$use(async (params, next) => {
  // Encrypt on create/update
  if (
    params.model === "KYC" &&
    (params.action === "create" || params.action === "update")
  ) {
    const data = params.args.data;
    if (data.fullName && typeof data.fullName === "string") {
      data.fullName = encrypt(data.fullName);
    }
  }
  return next(params);
});

prisma.$use(async (params, next) => {
  const result = await next(params);

  // Decrypt function for KYC.fullName
  const decryptKyc = (kyc: any) => {
    if (kyc && kyc.fullName && typeof kyc.fullName === "string") {
      kyc.fullName = decrypt(kyc.fullName);
    }
  };

  // Handle single result or array
  if (params.model === "KYC") {
    if (params.action === "findUnique" || params.action === "findFirst") {
      decryptKyc(result);
    } else if (params.action === "findMany" && Array.isArray(result)) {
      result.forEach(decryptKyc);
    }
  }
  // Also decrypt when KYC is included in User queries
  if (
    params.model === "User" &&
    (params.action === "findUnique" || params.action === "findMany")
  ) {
    const handleUser = (user: any) => {
      if (user?.kycProfile) decryptKyc(user.kycProfile);
    };
    if (Array.isArray(result)) result.forEach(handleUser);
    else handleUser(result);
  }
  return result;
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
