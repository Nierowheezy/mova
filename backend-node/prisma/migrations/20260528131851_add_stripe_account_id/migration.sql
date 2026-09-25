/*
  Warnings:

  - A unique constraint covering the columns `[stripe_account_id]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "users" ADD COLUMN     "stripe_account_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_account_id_key" ON "users"("stripe_account_id");
