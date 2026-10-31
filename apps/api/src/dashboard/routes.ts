import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { AuthenticatedRequest, requireTenantRole, tenantScope } from "../tenancy/context.js";
import { BillingPeriod, SubscriptionStatus, InvoiceStatus } from "@prisma/client";

const router = Router();
const businessId = (req: AuthenticatedRequest) => req.auth?.tenant?.businessId ?? (() => { throw new Error("Verified business context is missing."); })();

router.use(requireTenantRole("ADMIN", "STAFF", "FINANCE"));

router.get("/summary", async (req, res, next) => {
  try {
    const business = businessId(req as AuthenticatedRequest);
    const now = new Date();
    const [activeSubscriptions, invoices, payments, upcomingRenewals] = await Promise.all([
      prisma.subscription.findMany({ where: tenantScope(business, { status: SubscriptionStatus.ACTIVE }), select: { id: true, expiryDate: true, plan: { select: { price: true, billingPeriod: true } } } }),
      prisma.invoice.findMany({ where: tenantScope(business), select: { id: true, status: true, total: true, dueDate: true, payments: { where: { status: "SUCCEEDED" }, select: { amount: true } } } }),
      prisma.payment.findMany({ where: { businessId: business, status: "SUCCEEDED" }, select: { amount: true } }),
      prisma.subscription.findMany({ where: tenantScope(business, { status: SubscriptionStatus.ACTIVE, expiryDate: { gte: now, lte: new Date(now.getTime() + 7 * 86400000) } }), include: { customer: true, plan: true }, orderBy: { expiryDate: "asc" }, take: 10 })
    ]);
    const monthlyMultiplier: Record<BillingPeriod, number> = { WEEKLY: 52 / 12, MONTHLY: 1, QUARTERLY: 1 / 3, YEARLY: 1 / 12 };
    const mrr = activeSubscriptions.reduce((sum, sub) => sum + Number(sub.plan.price) * monthlyMultiplier[sub.plan.billingPeriod], 0);
    const collected = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const receivableStatuses = new Set<InvoiceStatus>([InvoiceStatus.CONFIRMED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE]);
    const outstanding = invoices.filter((invoice) => receivableStatuses.has(invoice.status)).reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total) - invoice.payments.reduce((paid, payment) => paid + Number(payment.amount), 0)), 0);
    const overdueStatuses = new Set<InvoiceStatus>([InvoiceStatus.CONFIRMED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE]);
    const overdue = invoices.filter((invoice) => overdueStatuses.has(invoice.status) && invoice.dueDate < now).reduce((sum, invoice) => sum + Math.max(0, Number(invoice.total) - invoice.payments.reduce((paid, payment) => paid + Number(payment.amount), 0)), 0);
    res.json({ metrics: { activeSubscriptions: activeSubscriptions.length, mrr: Number(mrr.toFixed(2)), arr: Number((mrr * 12).toFixed(2)), collected: Number(collected.toFixed(2)), outstanding: Number(outstanding.toFixed(2)), overdue: Number(overdue.toFixed(2)) }, upcomingRenewals });
  } catch (e) { next(e); }
});

export default router;
