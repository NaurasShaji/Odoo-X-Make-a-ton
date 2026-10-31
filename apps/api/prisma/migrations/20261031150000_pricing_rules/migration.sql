CREATE TABLE "TaxRule" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rate" DECIMAL(5,2) NOT NULL,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DiscountRule" (
  "id" TEXT NOT NULL,
  "businessId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "value" DECIMAL(12,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscountRule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaxRule_businessId_name_key" ON "TaxRule"("businessId", "name");
CREATE UNIQUE INDEX "TaxRule_id_businessId_key" ON "TaxRule"("id", "businessId");
CREATE INDEX "TaxRule_businessId_active_idx" ON "TaxRule"("businessId", "active");
CREATE UNIQUE INDEX "DiscountRule_businessId_name_key" ON "DiscountRule"("businessId", "name");
CREATE UNIQUE INDEX "DiscountRule_id_businessId_key" ON "DiscountRule"("id", "businessId");
CREATE INDEX "DiscountRule_businessId_active_idx" ON "DiscountRule"("businessId", "active");
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscountRule" ADD CONSTRAINT "DiscountRule_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
