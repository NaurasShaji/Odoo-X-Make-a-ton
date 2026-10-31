import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { generateDueInvoices } from "../billing/service.js";
import { AuthenticatedRequest, requireTenantRole, tenantScope } from "../tenancy/context.js";

const router = Router();
const paymentSchema = z.object({ method: z.string().trim().min(1).max(60), amount: z.number().finite().positive().max(9999999999.99), note: z.string().trim().max(1000).optional().or(z.literal("")) }).strict();
const idOf = (req: Request) => typeof req.params.invoiceId === "string" ? req.params.invoiceId : null;
const businessId = (req: AuthenticatedRequest) => req.auth?.tenant?.businessId ?? (() => { throw new Error("Verified business context is missing."); })();

router.use(requireTenantRole("ADMIN", "STAFF", "FINANCE"));

router.get("/", async (req, res, next) => {
  try {
    const business = businessId(req as AuthenticatedRequest);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
    const where = tenantScope(business, status ? { status: status as any } : {});
    const [invoices, total] = await prisma.$transaction([
      prisma.invoice.findMany({ where, include: { customer: true, subscription: true, lines: { include: { product: true } }, payments: true }, orderBy: { dueDate: "asc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.invoice.count({ where })
    ]);
    res.json({ invoices, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) { next(e); }
});

router.post("/billing/run", async (req, res, next) => {
  try {
    const result = await generateDueInvoices(businessId(req as AuthenticatedRequest));
    res.json({ message: "Billing run completed.", ...result });
  } catch (e) { next(e); }
});

router.get("/:invoiceId", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid invoice ID is required." }); return; }
  try {
    const invoice = await prisma.invoice.findFirst({ where: tenantScope(businessId(req as AuthenticatedRequest), { id }), include: { customer: true, subscription: true, lines: { include: { product: true } }, payments: { include: { refunds: true } } } });
    if (!invoice) { res.status(404).json({ error: "Invoice not found." }); return; }
    const paid = invoice.payments.filter((payment) => payment.status === "SUCCEEDED").reduce((sum, payment) => sum + Number(payment.amount), 0);
    res.json({ invoice, balance: Math.max(0, Number(invoice.total) - paid) });
  } catch (e) { next(e); }
});

router.post("/:invoiceId/confirm", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid invoice ID is required." }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const invoice = await prisma.invoice.findFirst({ where: tenantScope(business, { id }) });
    if (!invoice) { res.status(404).json({ error: "Invoice not found." }); return; }
    if (invoice.status !== "DRAFT") { res.status(409).json({ error: `Invoice cannot be confirmed from status '${invoice.status}'.` }); return; }
    const updated = await prisma.invoice.update({ where: { id }, data: { status: "CONFIRMED" } });
    res.json({ invoice: updated });
  } catch (e) { next(e); }
});

router.post("/:invoiceId/cancel", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid invoice ID is required." }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const invoice = await prisma.invoice.findFirst({ where: tenantScope(business, { id }) });
    if (!invoice) { res.status(404).json({ error: "Invoice not found." }); return; }
    if (["PAID", "CANCELLED"].includes(invoice.status)) { res.status(409).json({ error: `Invoice cannot be cancelled from status '${invoice.status}'.` }); return; }
    const updated = await prisma.invoice.update({ where: { id }, data: { status: "CANCELLED" } });
    res.json({ invoice: updated });
  } catch (e) { next(e); }
});

router.post("/:invoiceId/payments", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid invoice ID is required." }); return; }
  const parsed = paymentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid payment details.", details: parsed.error.flatten() }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: tenantScope(business, { id }), include: { payments: true } });
      if (!invoice) throw Object.assign(new Error("Invoice not found."), { statusCode: 404 });
      if (["CANCELLED", "PAID"].includes(invoice.status)) throw Object.assign(new Error(`Invoice cannot accept payment in status '${invoice.status}'.`), { statusCode: 409 });
      const paid = invoice.payments.filter((p) => p.status === "SUCCEEDED").reduce((sum, p) => sum + Number(p.amount), 0);
      const balance = Math.max(0, Number(invoice.total) - paid);
      if (parsed.data.amount > balance) throw Object.assign(new Error(`Payment exceeds outstanding balance of ${balance.toFixed(2)}.`), { statusCode: 400 });
      const payment = await tx.payment.create({ data: { businessId: business, invoiceId: invoice.id, method: parsed.data.method, status: "SUCCEEDED", amount: parsed.data.amount, paidAt: new Date(), note: parsed.data.note?.trim() || null } });
      const newPaid = paid + parsed.data.amount;
      const status = newPaid >= Number(invoice.total) ? "PAID" : "PARTIALLY_PAID";
      const updatedInvoice = await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
      return { payment, invoice: updatedInvoice, balance: Math.max(0, Number(invoice.total) - newPaid) };
    });
    res.status(201).json(result);
  } catch (e) {
    const statusCode = typeof e === "object" && e !== null && "statusCode" in e && typeof e.statusCode === "number" ? e.statusCode : 500;
    if (statusCode !== 500) { res.status(statusCode).json({ error: e instanceof Error ? e.message : "Request failed." }); return; }
    next(e);
  }
});

export default router;
