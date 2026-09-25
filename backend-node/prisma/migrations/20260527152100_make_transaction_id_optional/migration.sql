-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_transaction_id_fkey";

-- AlterTable
ALTER TABLE "notifications" ALTER COLUMN "transaction_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
