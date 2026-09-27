-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserRole" ADD VALUE 'OPERATIONS_MANAGER';
ALTER TYPE "UserRole" ADD VALUE 'FRAUD_ANALYST';
ALTER TYPE "UserRole" ADD VALUE 'KYC_REVIEWER';
ALTER TYPE "UserRole" ADD VALUE 'LOAN_OFFICER';
ALTER TYPE "UserRole" ADD VALUE 'COMPLIANCE_OFFICER';
