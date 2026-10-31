import { prisma } from "../db/prisma.js";
import { billingDecision } from "./logic.js";

function money(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }

export async function generateDueInvoices(businessId?: string, now = new Date()) {
  const subscriptions = await prisma.subscription.findMany({
    where: { ...(businessId ? { businessId } : {}), status: "ACTIVE", startDate: { lte: now }, OR: [{ expiryDate: null }, { expiryDate: { gt: now } }] },
    include: { customer: true, plan: true, lines: true, invoices: { orderBy: { periodEnd: "desc" }, take: 1 } }
  });

  const results: Array<{ subscriptionId: string; status: "generated" | "skipped"; reason?: string; invoiceId?: string }> = [];
  for (const subscription of subscriptions) {
    const lastInvoice = subscription.invoices[0];
    const decision = billingDecision({ startDate: subscription.startDate, billingPeriod: subscription.plan.billingPeriod, lastPeriodEnd: lastInvoice?.periodEnd ?? undefined, expiryDate: subscription.expiryDate, now, alreadyBilled: false });
    if (decision.status === "skipped") {
      results.push({ subscriptionId: subscription.id, status: "skipped", reason: decision.reason });
      continue;
    }
    const { periodStart, periodEnd } = decision;
    const recurringKey = `${subscription.id}:${periodStart.toISOString()}:${periodEnd.toISOString()}`;
    const existing = await prisma.invoice.findFirst({ where: { businessId: subscription.businessId, recurringKey }, select: { id: true } });
    if (existing) {
      results.push({ subscriptionId: subscription.id, status: "skipped", reason: "already_billed", invoiceId: existing.id });
      continue;
    }
    const subtotal = money(subscription.lines.reduce((sum, line) => sum + Number(line.amount), 0));
    const taxTotal = money(subscription.lines.reduce((sum, line) => sum + Number(line.amount) * Number(line.taxRate) / 100, 0));
    const total = money(subtotal + taxTotal);
    let invoice: { id: string };
    try {
      invoice = await prisma.invoice.create({
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
    } catch (error) {
      // Another worker may have inserted this recurring period after our initial lookup.
      const racedInvoice = await prisma.invoice.findFirst({
        where: { businessId: subscription.businessId, recurringKey },
        select: { id: true }
      });
      if (!racedInvoice) throw error;
      results.push({ subscriptionId: subscription.id, status: "skipped", reason: "already_billed", invoiceId: racedInvoice.id });
      continue;
    }
    results.push({ subscriptionId: subscription.id, status: "generated", invoiceId: invoice.id });
  }
  return { checked: subscriptions.length, generated: results.filter((r) => r.status === "generated").length, skipped: results.filter((r) => r.status === "skipped").length, results };
}
