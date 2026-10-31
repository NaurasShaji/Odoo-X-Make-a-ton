import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { AuthenticatedRequest, requireTenantRole, tenantScope } from "../tenancy/context.js";

const router = Router();
const paymentSchema = z.object({
  invoiceId: z.string().min(1),
  method: z.string().trim().min(1).max(60),
  amount: z.number().finite().positive().max(9999999999.99),
  provider: z.string().trim().max(80).optional(),
  providerTransactionId: z.string().trim().max(160).optional(),
  note: z.string().trim().max(1000).optional().or(z.literal(""))
}).strict();
const refundSchema = z.object({
  amount: z.number().finite().positive().max(9999999999.99),
  reason: z.string().trim().max(1000).optional().or(z.literal("")),
  providerRefundId: z.string().trim().max(160).optional()
}).strict();
const idOf = (req: Request) => typeof req.params.paymentId === "string" ? req.params.paymentId : null;
const businessId = (req: AuthenticatedRequest) => req.auth?.tenant?.businessId ?? (() => { throw new Error("Verified business context is missing."); })();
const idempotencyKey = (req: Request) => {
  const value = req.header("idempotency-key")?.trim();
  return value && value.length <= 128 ? value : null;
};

function invoiceStatus(total: number, netPaid: number, dueDate: Date): "PAID" | "PARTIALLY_PAID" | "CONFIRMED" | "OVERDUE" {
  if (netPaid >= total - 0.005) return "PAID";
  if (netPaid > 0) return "PARTIALLY_PAID";
  return dueDate < new Date() ? "OVERDUE" : "CONFIRMED";
}

async function refreshInvoiceStatus(tx: any, invoiceId: string) {
  const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { payments: { include: { refunds: { where: { status: "SUCCEEDED" } } } } } });
  if (!invoice || invoice.status === "CANCELLED" || invoice.status === "DRAFT") return;
  const netPaid = invoice.payments.reduce((sum: number, payment: any) => {
    if (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED" && payment.status !== "REFUNDED") return sum;
    const refunded = payment.refunds.reduce((amount: number, refund: any) => amount + Number(refund.amount), 0);
    return sum + Math.max(0, Number(payment.amount) - refunded);
  }, 0);
  await tx.invoice.update({ where: { id: invoiceId }, data: { status: invoiceStatus(Number(invoice.total), netPaid, invoice.dueDate) } });
}

router.use(requireTenantRole("ADMIN", "FINANCE"));

router.get("/", async (req, res, next) => {
  try {
    const business = businessId(req as AuthenticatedRequest);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const invoiceId = typeof req.query.invoiceId === "string" ? req.query.invoiceId : undefined;
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
    const where = tenantScope(business, { ...(status ? { status: status as any } : {}), ...(invoiceId ? { invoiceId } : {}) });
    const [payments, total] = await prisma.$transaction([
      prisma.payment.findMany({ where, include: { invoice: { select: { id: true, number: true, customer: { select: { id: true, name: true, email: true } } } }, refunds: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.payment.count({ where })
    ]);
    res.json({ payments, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  const parsed = paymentSchema.safeParse(req.body);
  const key = idempotencyKey(req);
  if (!parsed.success || !key) {
    res.status(400).json({ error: !key ? "A valid Idempotency-Key header is required." : "Invalid payment details.", ...(parsed.success ? {} : { details: parsed.error.flatten() }) });
    return;
  }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey: key }, include: { refunds: true } });
    if (existing) {
      if (existing.businessId !== business || existing.invoiceId !== parsed.data.invoiceId || Number(existing.amount) !== parsed.data.amount) {
        res.status(409).json({ error: "The idempotency key has already been used for a different payment." }); return;
      }
      res.status(200).json({ payment: existing, replayed: true }); return;
    }
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: tenantScope(business, { id: parsed.data.invoiceId }), include: { payments: { include: { refunds: { where: { status: "SUCCEEDED" } } } } } });
      if (!invoice) throw Object.assign(new Error("Invoice not found."), { statusCode: 404 });
      if (["CANCELLED", "PAID", "DRAFT"].includes(invoice.status)) throw Object.assign(new Error(`Invoice cannot accept payment in status '${invoice.status}'.`), { statusCode: 409 });
      const paid = invoice.payments.reduce((sum, payment) => {
        const refunded = payment.refunds.reduce((amount, refund) => amount + Number(refund.amount), 0);
        return sum + (payment.status === "SUCCEEDED" || payment.status === "PARTIALLY_REFUNDED" || payment.status === "REFUNDED" ? Math.max(0, Number(payment.amount) - refunded) : 0);
      }, 0);
      const balance = Math.max(0, Number((Number(invoice.total) - paid).toFixed(2)));
      if (parsed.data.amount > balance) throw Object.assign(new Error("Payment exceeds outstanding balance."), { statusCode: 409 });
      const payment = await tx.payment.create({ data: { businessId: business, invoiceId: invoice.id, method: parsed.data.method, status: "SUCCEEDED", amount: parsed.data.amount, provider: parsed.data.provider || null, providerTransactionId: parsed.data.providerTransactionId || null, idempotencyKey: key, paidAt: new Date(), note: parsed.data.note?.trim() || null } });
      const newPaid = Number((paid + parsed.data.amount).toFixed(2));
      const status = invoiceStatus(Number(invoice.total), newPaid, invoice.dueDate);
      const updatedInvoice = await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
      return { payment, invoice: updatedInvoice, balance: Number((Number(invoice.total) - newPaid).toFixed(2)) };
    });
    res.status(201).json(result);
  } catch (error) {
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
    if (statusCode !== 500) { res.status(statusCode).json({ error: error instanceof Error ? error.message : "Request failed." }); return; }
    next(error);
  }
});

router.get("/:paymentId", async (req, res, next) => {
  const id = idOf(req);
  if (!id) { res.status(400).json({ error: "A valid payment ID is required." }); return; }
  try {
    const payment = await prisma.payment.findFirst({ where: tenantScope(businessId(req as AuthenticatedRequest), { id }), include: { invoice: { include: { customer: true } }, refunds: true } });
    if (!payment) { res.status(404).json({ error: "Payment not found." }); return; }
    const refunded = payment.refunds.filter((refund) => refund.status === "SUCCEEDED").reduce((sum, refund) => sum + Number(refund.amount), 0);
    res.json({ payment, refunded: Number(refunded.toFixed(2)), netAmount: Number((Number(payment.amount) - refunded).toFixed(2)) });
  } catch (error) { next(error); }
});

router.post("/:paymentId/refunds", async (req, res, next) => {
  const id = idOf(req);
  const parsed = refundSchema.safeParse(req.body);
  const key = idempotencyKey(req);
  if (!id || !parsed.success || !key) {
    res.status(400).json({ error: !key ? "A valid Idempotency-Key header is required." : "Invalid refund details.", ...(parsed.success ? {} : { details: parsed.error.flatten() }) });
    return;
  }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.refund.findUnique({ where: { idempotencyKey: key }, include: { payment: true } });
    if (existing) {
      if (existing.payment.businessId !== business || existing.paymentId !== id || Number(existing.amount) !== parsed.data.amount) {
        res.status(409).json({ error: "The idempotency key has already been used for a different refund." }); return;
      }
      res.status(200).json({ refund: existing, replayed: true }); return;
    }
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findFirst({ where: tenantScope(business, { id }), include: { refunds: { where: { status: "SUCCEEDED" } } } });
      if (!payment) throw Object.assign(new Error("Payment not found."), { statusCode: 404 });
      if (payment.status !== "SUCCEEDED" && payment.status !== "PARTIALLY_REFUNDED") throw Object.assign(new Error("Only successful, not-fully-refunded payments can be refunded."), { statusCode: 409 });
      const refunded = payment.refunds.reduce((sum, refund) => sum + Number(refund.amount), 0);
      const refundable = Number((Number(payment.amount) - refunded).toFixed(2));
      if (parsed.data.amount > refundable) throw Object.assign(new Error("Refund exceeds the remaining refundable amount."), { statusCode: 409 });
      const refund = await tx.refund.create({ data: { paymentId: payment.id, amount: parsed.data.amount, status: "SUCCEEDED", idempotencyKey: key, reason: parsed.data.reason?.trim() || null, providerRefundId: parsed.data.providerRefundId || null } });
      const fullyRefunded = parsed.data.amount >= refundable - 0.005;
      const updatedPayment = await tx.payment.update({ where: { id: payment.id }, data: { status: fullyRefunded ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
      await refreshInvoiceStatus(tx, payment.invoiceId);
      return { refund, payment: updatedPayment, remainingRefundable: Number((refundable - parsed.data.amount).toFixed(2)) };
    });
    res.status(201).json(result);
  } catch (error) {
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
    if (statusCode !== 500) { res.status(statusCode).json({ error: error instanceof Error ? error.message : "Request failed." }); return; }
    next(error);
  }
});

export default router;
