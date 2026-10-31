CREATE TYPE "QuotationStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED');
CREATE TABLE "Quotation" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "number" TEXT NOT NULL,
  "customerId" TEXT NOT NULL, "planId" TEXT NOT NULL,
  "status" "QuotationStatus" NOT NULL DEFAULT 'DRAFT',
  "validUntil" TIMESTAMP(3), "notes" TEXT,
  "subtotal" DECIMAL(12,2) NOT NULL, "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxTotal" DECIMAL(12,2) NOT NULL, "total" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Quotation_businessId_number_key" ON "Quotation"("businessId", "number");
CREATE UNIQUE INDEX "Quotation_id_businessId_key" ON "Quotation"("id", "businessId");
CREATE INDEX "Quotation_businessId_status_createdAt_idx" ON "Quotation"("businessId", "status", "createdAt");
CREATE INDEX "Quotation_customerId_status_idx" ON "Quotation"("customerId", "status");
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "Customer"("id", "businessId") ON UPDATE CASCADE;
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_planId_businessId_fkey" FOREIGN KEY ("planId", "businessId") REFERENCES "Plan"("id", "businessId") ON UPDATE CASCADE;
CREATE TABLE "QuotationLine" (
  "id" TEXT NOT NULL, "businessId" TEXT NOT NULL, "quotationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL, "description" TEXT NOT NULL,
  "quantity" DECIMAL(12,2) NOT NULL, "unitPrice" DECIMAL(12,2) NOT NULL,
  "taxRate" DECIMAL(5,2) NOT NULL, "amount" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "QuotationLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QuotationLine_quotationId_idx" ON "QuotationLine"("quotationId");
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_quotationId_businessId_fkey" FOREIGN KEY ("quotationId", "businessId") REFERENCES "Quotation"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotationLine" ADD CONSTRAINT "QuotationLine_productId_businessId_fkey" FOREIGN KEY ("productId", "businessId") REFERENCES "Product"("id", "businessId") ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD COLUMN "quotationId" TEXT;
CREATE UNIQUE INDEX "Subscription_quotationId_key" ON "Subscription"("quotationId");
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
