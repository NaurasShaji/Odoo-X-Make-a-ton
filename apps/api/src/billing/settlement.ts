export type SettlementStatus = "PAID" | "PARTIALLY_PAID" | "CONFIRMED" | "OVERDUE";

export function calculateNetPaid(payments: Array<{
  amount: number;
  status: string;
  refunds: Array<{ amount: number; status: string }>;
}>): number {
  return Number(payments.reduce((total, payment) => {
    if (!["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status)) return total;
    const refunded = payment.refunds.reduce((sum, refund) => sum + (refund.status === "SUCCEEDED" ? refund.amount : 0), 0);
    return total + Math.max(0, payment.amount - refunded);
  }, 0).toFixed(2));
}

export function calculateInvoiceSettlement(total: number, netPaid: number, dueDate: Date, now = new Date()): { status: SettlementStatus; balance: number } {
  const balance = Math.max(0, Number((total - netPaid).toFixed(2)));
  if (balance === 0) return { status: "PAID", balance };
  if (netPaid > 0) return { status: "PARTIALLY_PAID", balance };
  return { status: dueDate < now ? "OVERDUE" : "CONFIRMED", balance };
}
