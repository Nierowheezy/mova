-- CreateEnum
CREATE TYPE "AccountTier" AS ENUM ('BASIC', 'VERIFIED', 'PREMIUM');

-- CreateEnum
CREATE TYPE "AmlSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AmlFlagStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'DISMISSED', 'ESCALATED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tier" "AccountTier" NOT NULL DEFAULT 'BASIC';

-- CreateTable
CREATE TABLE "aml_flags" (
    "id" SERIAL NOT NULL,
    "rule" TEXT NOT NULL,
    "severity" "AmlSeverity" NOT NULL DEFAULT 'LOW',
    "status" "AmlFlagStatus" NOT NULL DEFAULT 'OPEN',
    "details" JSONB,
    "transaction_id" INTEGER,
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "aml_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aml_flags_user_id_idx" ON "aml_flags"("user_id");

-- CreateIndex
CREATE INDEX "aml_flags_status_idx" ON "aml_flags"("status");

-- CreateIndex
CREATE INDEX "aml_flags_rule_idx" ON "aml_flags"("rule");

-- CreateIndex
CREATE INDEX "aml_flags_created_at_idx" ON "aml_flags"("created_at");

-- AddForeignKey
ALTER TABLE "aml_flags" ADD CONSTRAINT "aml_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
