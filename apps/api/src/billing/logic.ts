export type BillingDecision =
  | { status: "generated"; periodStart: Date; periodEnd: Date }
  | { status: "skipped"; reason: "not_due" | "expired" | "already_billed" };

export function addBillingPeriod(date: Date, period: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY"): Date {
  const next = new Date(date);
  if (period === "WEEKLY") {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }

  const originalDay = next.getUTCDate();
  const monthsToAdd = period === "MONTHLY" ? 1 : period === "QUARTERLY" ? 3 : 12;
  const targetMonth = next.getUTCMonth() + monthsToAdd;
  next.setUTCDate(1);
  next.setUTCMonth(targetMonth);
  const lastDayOfTargetMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return next;
}

export function billingDecision(input: {
  startDate: Date;
  billingPeriod: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
  lastPeriodEnd?: Date;
  expiryDate?: Date | null;
  now: Date;
  alreadyBilled: boolean;
}): BillingDecision {
  const periodStart = input.lastPeriodEnd ?? input.startDate;
  const periodEnd = addBillingPeriod(periodStart, input.billingPeriod);
  if (periodEnd > input.now && input.lastPeriodEnd) return { status: "skipped", reason: "not_due" };
  if (input.expiryDate && periodStart >= input.expiryDate) return { status: "skipped", reason: "expired" };
  if (input.alreadyBilled) return { status: "skipped", reason: "already_billed" };
  return { status: "generated", periodStart, periodEnd };
}

export function paymentResult(total: number, paidBefore: number, paymentAmount: number): { status: "PARTIALLY_PAID" | "PAID"; balance: number } {
  if (paymentAmount <= 0) throw new Error("Payment amount must be positive.");
  const balance = Math.max(0, Number((total - paidBefore).toFixed(2)));
  if (paymentAmount > balance) throw new Error("Payment exceeds outstanding balance.");
  const newBalance = Number((balance - paymentAmount).toFixed(2));
  return { status: newBalance === 0 ? "PAID" : "PARTIALLY_PAID", balance: newBalance };
}
