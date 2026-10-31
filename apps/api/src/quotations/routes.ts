import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { AuthenticatedRequest, requireTenantRole, tenantScope } from "../tenancy/context.js";
import { quotationTransition } from "./logic.js";
import { calculatePricing } from "../billing/pricing.js";

const router = Router();
const money = z.number().finite().min(0).max(9999999999.99);
const lineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().finite().positive().max(100000),
  unitPrice: money,
  taxRate: z.number().finite().min(0).max(100).optional(),
  taxRuleId: z.string().min(1).optional()
}).strict();
const createSchema = z.object({
  customerId: z.string().min(1),
  planId: z.string().min(1),
  validUntil: z.string().datetime().optional().nullable(),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  lines: z.array(lineSchema).min(1).max(100),
  discount: z.object({ type: z.enum(["PERCENTAGE", "FIXED"]), value: z.number().finite().min(0).max(9999999999.99) }).optional(),
  discountRuleId: z.string().min(1).optional()
}).strict();
const patchSchema = z.object({
  validUntil: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(2000).optional().or(z.literal(""))
}).strict();
const idOf = (req: Request) => typeof req.params.quotationId === "string" ? req.params.quotationId : null;
const businessId = (req: AuthenticatedRequest) => req.auth?.tenant?.businessId ?? (() => { throw new Error("Verified business context is missing."); })();
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const makeNumber = () => `QUO-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

router.use(requireTenantRole("ADMIN", "STAFF", "FINANCE"));

router.get("/", async (req, res, next) => {
  try {
    const business = businessId(req as AuthenticatedRequest);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
    const where = tenantScope(business, { ...(status ? { status: status as any } : {}), ...(customerId ? { customerId } : {}) });
    const [quotations, total] = await prisma.$transaction([
      prisma.quotation.findMany({ where, include: { customer: true, plan: true, lines: { include: { product: true } }, convertedSubscription: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.quotation.count({ where })
    ]);
    res.json({ quotations, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid quotation details.", details: parsed.error.flatten() }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const data = parsed.data;
    if (data.discount && data.discountRuleId) { res.status(400).json({ error: "Provide either an inline discount or a saved discount rule, not both." }); return; }
    const validUntil = data.validUntil ? new Date(data.validUntil) : null;
    if (validUntil && validUntil <= new Date()) { res.status(400).json({ error: "validUntil must be a future date." }); return; }
    const [customer, plan] = await Promise.all([
      prisma.customer.findFirst({ where: tenantScope(business, { id: data.customerId }), select: { id: true } }),
      prisma.plan.findFirst({ where: tenantScope(business, { id: data.planId }), select: { id: true, minQuantity: true, items: { select: { productId: true } } } })
    ]);
    if (!customer) { res.status(404).json({ error: "Customer not found." }); return; }
    if (!plan) { res.status(404).json({ error: "Plan not found." }); return; }
    const planProducts = new Set(plan.items.map((item) => item.productId));
    if (data.lines.some((line) => !planProducts.has(line.productId))) { res.status(400).json({ error: "Every quotation product must be associated with the selected plan." }); return; }
    if (data.lines.some((line) => line.quantity < plan.minQuantity)) { res.status(400).json({ error: `Each quotation line must meet the plan minimum quantity of ${plan.minQuantity}.` }); return; }
    const products = await prisma.product.findMany({ where: { businessId: business, id: { in: data.lines.map((line) => line.productId) } }, select: { id: true, name: true } });
    if (products.length !== new Set(data.lines.map((line) => line.productId)).size) { res.status(400).json({ error: "One or more products do not belong to the selected workspace." }); return; }
    const productNames = new Map(products.map((product) => [product.id, product.name]));
    const taxRuleIds = [...new Set(data.lines.flatMap((line) => line.taxRuleId ? [line.taxRuleId] : []))];
    const taxRules = taxRuleIds.length ? await prisma.taxRule.findMany({ where: { businessId: business, id: { in: taxRuleIds }, active: true } }) : [];
    if (taxRules.length !== taxRuleIds.length) { res.status(400).json({ error: "One or more selected tax rules are inactive or do not belong to this workspace." }); return; }
    const taxRates = new Map(taxRules.map((rule) => [rule.id, Number(rule.rate)]));
    const pricingLines = data.lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRuleId ? taxRates.get(line.taxRuleId)! : line.taxRate ?? 0
    }));
    let discount = data.discount;
    if (data.discountRuleId) {
      const rule = await prisma.discountRule.findFirst({ where: tenantScope(business, { id: data.discountRuleId, active: true }) });
      if (!rule) { res.status(400).json({ error: "The selected discount rule is inactive or does not belong to this workspace." }); return; }
      discount = { type: rule.type as "PERCENTAGE" | "FIXED", value: Number(rule.value) };
    }
    const pricing = calculatePricing(pricingLines, discount);
    const lineRows = pricing.lines.map((line, index) => ({
      businessId: business,
      productId: data.lines[index].productId,
      description: productNames.get(data.lines[index].productId)!,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      amount: line.amount,
      discountAmount: line.discountAmount
    }));
    const { subtotal, discountTotal, taxTotal, total } = pricing;
    const quotation = await prisma.quotation.create({
      data: {
        businessId: business, number: makeNumber(), customerId: customer.id, planId: plan.id,
        validUntil, notes: data.notes?.trim() || null, subtotal, discountTotal, taxTotal,
        total, lines: { create: lineRows }
      },
      include: { customer: true, plan: true, lines: { include: { product: true } } }
    });
    res.status(201).json({ quotation });
  } catch (error) { next(error); }
});

router.get("/:quotationId", async (req, res, next) => {
  const id = idOf(req);
  if (!id) { res.status(400).json({ error: "A valid quotation ID is required." }); return; }
  try {
    const quotation = await prisma.quotation.findFirst({
      where: tenantScope(businessId(req as AuthenticatedRequest), { id }),
      include: { customer: true, plan: true, lines: { include: { product: true } }, convertedSubscription: true }
    });
    if (!quotation) { res.status(404).json({ error: "Quotation not found." }); return; }
    res.json({ quotation });
  } catch (error) { next(error); }
});

router.patch("/:quotationId", async (req, res, next) => {
  const id = idOf(req);
  if (!id) { res.status(400).json({ error: "A valid quotation ID is required." }); return; }
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data ?? {}).length) {
    res.status(400).json({ error: "Provide valid quotation fields to update.", ...(parsed.success ? {} : { details: parsed.error.flatten() }) }); return;
  }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.quotation.findFirst({ where: tenantScope(business, { id }), select: { status: true } });
    if (!existing) { res.status(404).json({ error: "Quotation not found." }); return; }
    if (existing.status !== "DRAFT") { res.status(409).json({ error: "Only draft quotations can be edited." }); return; }
    const validUntil = parsed.data.validUntil === undefined ? undefined : parsed.data.validUntil ? new Date(parsed.data.validUntil) : null;
    if (validUntil && validUntil <= new Date()) { res.status(400).json({ error: "validUntil must be a future date." }); return; }
    const quotation = await prisma.quotation.update({
      where: { id },
      data: { ...(validUntil !== undefined ? { validUntil } : {}), ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes.trim() || null } : {}) },
      include: { customer: true, plan: true, lines: { include: { product: true } } }
    });
    res.json({ quotation });
  } catch (error) { next(error); }
});

router.post("/:quotationId/actions/:action", async (req, res, next) => {
  const id = idOf(req);
  const action = typeof req.params.action === "string" ? req.params.action.toLowerCase() : "";
  if (!id || !["send", "accept", "reject", "expire"].includes(action)) {
    res.status(400).json({ error: "A valid quotation ID and action (send, accept, reject, expire) are required." }); return;
  }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const quotation = await prisma.quotation.findFirst({ where: tenantScope(business, { id }) });
    if (!quotation) { res.status(404).json({ error: "Quotation not found." }); return; }
    if (quotation.validUntil && quotation.validUntil <= new Date() && quotation.status !== "EXPIRED") {
      res.status(409).json({ error: "This quotation has expired." }); return;
    }
    const nextStatus = quotationTransition(quotation.status, action as "send" | "accept" | "reject" | "expire");
    if (!nextStatus) { res.status(409).json({ error: `Action '${action}' is not allowed from status '${quotation.status}'.` }); return; }
    const changed = await prisma.quotation.updateMany({ where: { id, businessId: business, status: quotation.status }, data: { status: nextStatus } });
    if (changed.count !== 1) { res.status(409).json({ error: "Quotation status changed concurrently. Refresh and retry." }); return; }
    const updated = await prisma.quotation.findFirst({ where: tenantScope(business, { id }), include: { customer: true, plan: true, lines: true } });
    res.json({ quotation: updated });
  } catch (error) { next(error); }
});

router.post("/:quotationId/convert", async (req, res, next) => {
  const id = idOf(req);
  const parsed = z.object({ startDate: z.string().datetime(), expiryDate: z.string().datetime().optional().nullable() }).strict().safeParse(req.body);
  if (!id || !parsed.success) { res.status(400).json({ error: "A valid quotation ID, startDate and optional expiryDate are required.", ...(parsed.success ? {} : { details: parsed.error.flatten() }) }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const startDate = new Date(parsed.data.startDate);
    const expiryDate = parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null;
    if (expiryDate && expiryDate <= startDate) { res.status(400).json({ error: "expiryDate must be after startDate." }); return; }
    const result = await prisma.$transaction(async (tx) => {
      const quotation = await tx.quotation.findFirst({
        where: tenantScope(business, { id }),
        include: { lines: true, plan: { select: { availableFrom: true, availableUntil: true } } }
      });
      if (!quotation) throw Object.assign(new Error("Quotation not found."), { statusCode: 404 });
      if (quotation.status !== "ACCEPTED") throw Object.assign(new Error("Only accepted quotations can be converted."), { statusCode: 409 });
      if (quotation.validUntil && quotation.validUntil <= new Date()) throw Object.assign(new Error("This quotation has expired."), { statusCode: 409 });
      if (quotation.plan.availableFrom && startDate < quotation.plan.availableFrom) throw Object.assign(new Error("Subscription starts before the plan becomes available."), { statusCode: 400 });
      if (quotation.plan.availableUntil && startDate > quotation.plan.availableUntil) throw Object.assign(new Error("Subscription starts after the plan is no longer available."), { statusCode: 400 });
      const changed = await tx.quotation.updateMany({ where: { id, businessId: business, status: "ACCEPTED" }, data: { status: "CONVERTED" } });
      if (changed.count !== 1) throw Object.assign(new Error("Quotation was converted concurrently. Refresh and retry."), { statusCode: 409 });
      const subscription = await tx.subscription.create({
        data: {
          businessId: business, number: `SUB-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
          customerId: quotation.customerId, planId: quotation.planId, quotationId: quotation.id,
          startDate, expiryDate, status: "CONFIRMED",
          lines: { create: quotation.lines.map((line) => ({
            businessId: business, productId: line.productId, quantity: line.quantity,
            unitPrice: line.unitPrice, taxRate: line.taxRate, amount: line.amount, discountAmount: line.discountAmount
          })) }
        },
        include: { customer: true, plan: true, lines: { include: { product: true } } }
      });
      return { subscription };
    });
    res.status(201).json(result);
  } catch (error) {
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
    if (statusCode !== 500) { res.status(statusCode).json({ error: error instanceof Error ? error.message : "Request failed." }); return; }
    next(error);
  }
});

export default router;
