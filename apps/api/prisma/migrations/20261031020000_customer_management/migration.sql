-- Customer records represent a business's contacts, not necessarily NexBill login accounts.
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_userId_fkey";
DROP INDEX "Customer_businessId_userId_key";
ALTER TABLE "Customer" DROP COLUMN "userId";
ALTER TABLE "Customer" ADD COLUMN "email" TEXT;
ALTER TABLE "Customer" ADD COLUMN "phone" TEXT;
ALTER TABLE "Customer" ADD COLUMN "companyName" TEXT;
ALTER TABLE "Customer" ADD COLUMN "address" TEXT;
ALTER TABLE "Customer" ADD COLUMN "notes" TEXT;
CREATE INDEX "Customer_businessId_email_idx" ON "Customer"("businessId", "email");
