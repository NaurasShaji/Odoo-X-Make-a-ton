export type Discount = { type: "PERCENTAGE" | "FIXED"; value: number };
export type PricedLine = { quantity: number; unitPrice: number; taxRate: number };
export type PricedLineResult = PricedLine & { amount: number; discountAmount: number; taxAmount: number };

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculatePricing(lines: PricedLine[], discount?: Discount) {
  if (!lines.length) throw new Error("At least one line is required.");
  if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice < 0 || !Number.isFinite(line.taxRate) || line.taxRate < 0 || line.taxRate > 100)) {
    throw new Error("Invalid quantity, unit price or tax rate.");
  }
  if (discount && (!Number.isFinite(discount.value) || discount.value < 0 || (discount.type === "PERCENTAGE" && discount.value > 100))) {
    throw new Error("Discount must be non-negative and percentage discounts cannot exceed 100%.");
  }
  const gross = lines.map((line) => roundMoney(line.quantity * line.unitPrice));
  const subtotal = roundMoney(gross.reduce((sum, amount) => sum + amount, 0));
  const requestedDiscount = discount
    ? discount.type === "PERCENTAGE" ? roundMoney(subtotal * discount.value / 100) : roundMoney(discount.value)
    : 0;
  if (requestedDiscount > subtotal) throw new Error("Discount cannot exceed the subtotal.");
  let remainingDiscount = requestedDiscount;
  const pricedLines: PricedLineResult[] = lines.map((line, index) => {
    const allocated = index === lines.length - 1
      ? remainingDiscount
      : subtotal === 0 ? 0 : Math.min(remainingDiscount, roundMoney(requestedDiscount * gross[index] / subtotal));
    remainingDiscount = roundMoney(remainingDiscount - allocated);
    const amount = roundMoney(gross[index] - allocated);
    return { ...line, amount, discountAmount: allocated, taxAmount: roundMoney(amount * line.taxRate / 100) };
  });
  const discountTotal = roundMoney(pricedLines.reduce((sum, line) => sum + line.discountAmount, 0));
  const taxTotal = roundMoney(pricedLines.reduce((sum, line) => sum + line.taxAmount, 0));
  const total = roundMoney(pricedLines.reduce((sum, line) => sum + line.amount + line.taxAmount, 0));
  return { subtotal, discountTotal, taxTotal, total, lines: pricedLines };
}
