import { prisma } from "../db/prisma.js";

function addPeriod(date: Date, period: string): Date {
  const next = new Date(date);
  if (period === "WEEKLY") next.setDate(next.getDate() + 7);
  else if (period === "MONTHLY") next.setMonth(next.getMonth() + 1);
  else if (period === "QUARTERLY") next.setMonth(next.getMonth() + 3);
  else if (period === "YEARLY") next.setFullYear(next.getFullYear() + 1);
  return next;
}

function money(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }

export async function generateDueInvoices(businessId?: string, now = new Date()) {
  const subscriptions = await prisma.subscription.findMany({
    where: { ...(businessId ? { businessId } : {}), status: "ACTIVE", startDate: { lte: now }, OR: [{ expiryDate: null }, { expiryDate: { gt: now } }] },
    include: { customer: true, plan: true, lines: true, invoices: { orderBy: { periodEnd: "desc" }, take: 1 } }
  });

  const results: Array<{ subscriptionId: string; status: "generated" | "skipped"; reason?: string; invoiceId?: string }> = [];
  for (const subscription of subscriptions) {
    const lastInvoice = subscription.invoices[0];
    const periodStart = lastInvoice?.periodEnd ?? subscription.startDate;
    const periodEnd = addPeriod(periodStart, subscription.plan.billingPeriod);
    if (periodEnd > now && !lastInvoice) {
      // Initial billing is due at the subscription start date.
    } else if (periodEnd > now) {
      results.push({ subscriptionId: subscription.id, status: "skipped", reason: "not_due" });
      continue;
    }
    if (subscription.expiryDate && periodStart >= subscription.expiryDate) {
      results.push({ subscriptionId: subscription.id, status: "skipped", reason: "expired" });
      continue;
    }
    const recurringKey = `${subscription.id}:${periodStart.toISOString()}:${periodEnd.toISOString()}`;
    const existing = await prisma.invoice.findFirst({ where: { businessId: subscription.businessId, recurringKey }, select: { id: true } });
    if (existing) {
      results.push({ subscriptionId: subscription.id, status: "skipped", reason: "already_billed", invoiceId: existing.id });
      continue;
    }
    const subtotal = money(subscription.lines.reduce((sum, line) => sum + Number(line.amount), 0));
    const taxTotal = money(subscription.lines.reduce((sum, line) => sum + Number(line.amount) * Number(line.taxRate) / 100, 0));
    const total = money(subtotal + taxTotal);
    const invoice = await prisma.invoice.create({
      data: {
        businessId: subscription.businessId,
        number: `INV-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
        customerId: subscription.customerId,
        subscriptionId: subscription.id,
        recurringKey,
        billingPeriodKey: periodStart.toISOString().slice(0, 10),
        periodStart,
        periodEnd,
        dueDate: periodStart,
        subtotal,
        discountTotal: 0,
        taxTotal,
        total,
        status: "DRAFT",
        lines: { create: subscription.lines.map((line) => ({ businessId: subscription.businessId, productId: line.productId, description: `Subscription ${subscription.number}`, quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate, amount: line.amount })) }
      },
      select: { id: true }
    });
    results.push({ subscriptionId: subscription.id, status: "generated", invoiceId: invoice.id });
  }
  return { checked: subscriptions.length, generated: results.filter((r) => r.status === "generated").length, skipped: results.filter((r) => r.status === "skipped").length, results };
}
