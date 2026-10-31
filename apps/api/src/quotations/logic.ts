export type QuotationStatus = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CONVERTED";
export type QuotationAction = "send" | "accept" | "reject" | "expire";

export function quotationTransition(status: QuotationStatus, action: QuotationAction): QuotationStatus | null {
  const transitions: Record<QuotationStatus, Partial<Record<QuotationAction, QuotationStatus>>> = {
    DRAFT: { send: "SENT" },
    SENT: { accept: "ACCEPTED", reject: "REJECTED", expire: "EXPIRED" },
    ACCEPTED: { expire: "EXPIRED" },
    REJECTED: {},
    EXPIRED: {},
    CONVERTED: {}
  };
  return transitions[status][action] ?? null;
}

export function quotationTotals(lines: Array<{ quantity: number; unitPrice: number; taxRate: number }>) {
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const subtotal = round(lines.reduce((sum, line) => sum + round(line.quantity * line.unitPrice), 0));
  const taxTotal = round(lines.reduce((sum, line) => sum + round(line.quantity * line.unitPrice) * line.taxRate / 100, 0));
  return { subtotal, taxTotal, total: round(subtotal + taxTotal) };
}
