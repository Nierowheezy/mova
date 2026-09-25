/*
  Warnings:

  - The values [UNVERIFIED] on the enum `VerificationStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "VerificationStatus_new" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
ALTER TABLE "kyc_records" ALTER COLUMN "verification_status" DROP DEFAULT;
ALTER TABLE "kyc_records" ALTER COLUMN "verification_status" TYPE "VerificationStatus_new" USING ("verification_status"::text::"VerificationStatus_new");
ALTER TYPE "VerificationStatus" RENAME TO "VerificationStatus_old";
ALTER TYPE "VerificationStatus_new" RENAME TO "VerificationStatus";
DROP TYPE "VerificationStatus_old";
ALTER TABLE "kyc_records" ALTER COLUMN "verification_status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "kyc_records" ALTER COLUMN "verification_status" SET DEFAULT 'PENDING';
