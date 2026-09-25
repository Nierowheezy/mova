import { PrismaClient } from "@prisma/client";
import { encrypt } from "../src/shared/utils/encryption";
import "dotenv/config";

const prisma = new PrismaClient();

async function main() {
  // Fetch all KYC records (fullName is required, so no need for null check)
  const kycs = await prisma.kYC.findMany();
  for (const kyc of kycs) {
    try {
      // Skip if already encrypted (optional: detect by format)
      if (kyc.fullName.includes(":") && kyc.fullName.split(":").length === 3) {
        console.log(`Skipping already encrypted KYC ${kyc.id}`);
        continue;
      }
      const encrypted = encrypt(kyc.fullName);
      await prisma.kYC.update({
        where: { id: kyc.id },
        data: { fullName: encrypted },
      });
      console.log(`Encrypted KYC ${kyc.id}`);
    } catch (error) {
      console.error(`Failed to encrypt KYC ${kyc.id}:`, error);
    }
  }
  console.log("Encryption of KYC full names completed");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
