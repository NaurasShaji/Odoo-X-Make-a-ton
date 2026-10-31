CREATE TABLE "Business" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Business_slug_key" ON "Business"("slug");

INSERT INTO "Business" ("id", "name", "slug", "updatedAt")
VALUES ('default_business_nexbill', 'Default Business', 'default', CURRENT_TIMESTAMP);

CREATE TABLE "Membership" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'STAFF',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Customer" ADD COLUMN "businessId" TEXT;
ALTER TABLE "Product" ADD COLUMN "businessId" TEXT;
ALTER TABLE "Plan" ADD COLUMN "businessId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "businessId" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "businessId" TEXT;

UPDATE "Customer" SET "businessId" = 'default_business_nexbill';
UPDATE "Product" SET "businessId" = 'default_business_nexbill';
UPDATE "Plan" SET "businessId" = 'default_business_nexbill';
UPDATE "Subscription" SET "businessId" = 'default_business_nexbill';
UPDATE "Invoice" SET "businessId" = 'default_business_nexbill';

ALTER TABLE "Customer" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Plan" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Subscription" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "businessId" SET NOT NULL;

INSERT INTO "Membership" ("id", "businessId", "userId", "role", "updatedAt")
SELECT 'membership_' || md5("id"), 'default_business_nexbill', "id", "role", CURRENT_TIMESTAMP
FROM "User";

ALTER TABLE "User" DROP COLUMN "role";

ALTER TABLE "Customer" DROP CONSTRAINT "Customer_userId_key";
CREATE UNIQUE INDEX "Customer_businessId_userId_key" ON "Customer"("businessId", "userId");
CREATE INDEX "Customer_businessId_name_idx" ON "Customer"("businessId", "name");
CREATE INDEX "Product_businessId_name_idx" ON "Product"("businessId", "name");
CREATE INDEX "Plan_businessId_name_idx" ON "Plan"("businessId", "name");

ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_number_key";
CREATE UNIQUE INDEX "Subscription_businessId_number_key" ON "Subscription"("businessId", "number");
CREATE INDEX "Subscription_businessId_status_expiryDate_idx" ON "Subscription"("businessId", "status", "expiryDate");

ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_number_key";
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_recurringKey_key";
CREATE UNIQUE INDEX "Invoice_businessId_number_key" ON "Invoice"("businessId", "number");
CREATE UNIQUE INDEX "Invoice_businessId_recurringKey_key" ON "Invoice"("businessId", "recurringKey");
CREATE INDEX "Invoice_businessId_status_dueDate_idx" ON "Invoice"("businessId", "status", "dueDate");

CREATE UNIQUE INDEX "Customer_id_businessId_key" ON "Customer"("id", "businessId");
CREATE UNIQUE INDEX "Product_id_businessId_key" ON "Product"("id", "businessId");
CREATE UNIQUE INDEX "Plan_id_businessId_key" ON "Plan"("id", "businessId");
CREATE UNIQUE INDEX "Subscription_id_businessId_key" ON "Subscription"("id", "businessId");
CREATE UNIQUE INDEX "Invoice_id_businessId_key" ON "Invoice"("id", "businessId");

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
