import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { AuthenticatedRequest, requireTenantRole, tenantScope } from "../tenancy/context.js";

const router = Router();
const money = z.number().finite().min(0).max(9999999999.99);
const planSchema = z.object({
  name: z.string().trim().min(1).max(160),
  price: money,
  billingPeriod: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  minQuantity: z.number().int().min(1).max(100000),
  availableFrom: z.string().datetime().optional().nullable(),
  availableUntil: z.string().datetime().optional().nullable(),
  autoClose: z.boolean().default(false),
  earlyClose: z.boolean().default(false),
  allowPause: z.boolean().default(false),
  autoRenew: z.boolean().default(false)
}).strict();
const itemSchema = z.object({ productId: z.string().min(1), quantity: z.number().finite().positive().max(100000) }).strict();
const idOf = (req: Request) => typeof req.params.planId === "string" ? req.params.planId : null;
const businessId = (req: AuthenticatedRequest) => req.auth?.tenant?.businessId ?? (() => { throw new Error("Verified business context is missing."); })();

router.use(requireTenantRole("ADMIN", "STAFF"));

router.get("/", async (req, res, next) => {
  try {
    const business = businessId(req as AuthenticatedRequest);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
    const where = tenantScope(business, search ? { name: { contains: search, mode: "insensitive" as const } } : {});
    const [plans, total] = await prisma.$transaction([
      prisma.plan.findMany({ where, include: { items: { include: { product: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.plan.count({ where })
    ]);
    res.json({ plans, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid plan details.", details: parsed.error.flatten() }); return; }
  if (parsed.data.availableFrom && parsed.data.availableUntil && new Date(parsed.data.availableFrom) > new Date(parsed.data.availableUntil)) { res.status(400).json({ error: "availableFrom must not be after availableUntil." }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const plan = await prisma.plan.create({ data: { ...parsed.data, businessId: business, availableFrom: parsed.data.availableFrom ? new Date(parsed.data.availableFrom) : null, availableUntil: parsed.data.availableUntil ? new Date(parsed.data.availableUntil) : null }, include: { items: true } });
    res.status(201).json({ plan });
  } catch (e) { next(e); }
});

router.get("/:planId", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid plan ID is required." }); return; }
  try {
    const plan = await prisma.plan.findFirst({ where: tenantScope(businessId(req as AuthenticatedRequest), { id }), include: { items: { include: { product: { include: { variants: true } } } } } });
    if (!plan) { res.status(404).json({ error: "Plan not found." }); return; }
    res.json({ plan });
  } catch (e) { next(e); }
});

router.patch("/:planId", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid plan ID is required." }); return; }
  const parsed = planSchema.partial().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data ?? {}).length) { res.status(400).json({ error: "Provide valid plan fields to update.", ...(parsed.success ? {} : { details: parsed.error.flatten() }) }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.plan.findFirst({ where: tenantScope(business, { id }), select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Plan not found." }); return; }
    const data = parsed.data;
    const from = data.availableFrom !== undefined ? (data.availableFrom ? new Date(data.availableFrom) : null) : undefined;
    const until = data.availableUntil !== undefined ? (data.availableUntil ? new Date(data.availableUntil) : null) : undefined;
    if (from && until && from > until) { res.status(400).json({ error: "availableFrom must not be after availableUntil." }); return; }
    const plan = await prisma.plan.update({ where: { id }, data: { ...data, ...(from !== undefined ? { availableFrom: from } : {}), ...(until !== undefined ? { availableUntil: until } : {}) }, include: { items: true } });
    res.json({ plan });
  } catch (e) { next(e); }
});

router.delete("/:planId", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid plan ID is required." }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.plan.findFirst({ where: tenantScope(business, { id }), select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Plan not found." }); return; }
    try { await prisma.plan.delete({ where: { id } }); } catch (e) {
      if (typeof e === "object" && e !== null && "code" in e && e.code === "P2003") { res.status(409).json({ error: "This plan is linked to subscriptions and cannot be deleted." }); return; }
      throw e;
    }
    res.status(204).send();
  } catch (e) { next(e); }
});

router.post("/:planId/items", async (req, res, next) => {
  const planId = idOf(req); if (!planId) { res.status(400).json({ error: "A valid plan ID is required." }); return; }
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid plan item.", details: parsed.error.flatten() }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const [plan, product] = await Promise.all([
      prisma.plan.findFirst({ where: tenantScope(business, { id: planId }), select: { id: true } }),
      prisma.product.findFirst({ where: tenantScope(business, { id: parsed.data.productId }), select: { id: true } })
    ]);
    if (!plan) { res.status(404).json({ error: "Plan not found." }); return; }
    if (!product) { res.status(404).json({ error: "Product not found." }); return; }
    const item = await prisma.planItem.create({ data: { businessId: business, planId, productId: product.id, quantity: parsed.data.quantity } });
    res.status(201).json({ item });
  } catch (e) { next(e); }
});

router.patch("/:planId/items/:itemId", async (req, res, next) => {
  const planId = idOf(req); const itemId = typeof req.params.itemId === "string" ? req.params.itemId : null;
  if (!planId || !itemId) { res.status(400).json({ error: "Valid plan and item IDs are required." }); return; }
  const parsed = z.object({ quantity: z.number().finite().positive().max(100000) }).strict().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A valid quantity is required.", details: parsed.error.flatten() }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.planItem.findFirst({ where: { id: itemId, planId, businessId } });
    if (!existing) { res.status(404).json({ error: "Plan item not found." }); return; }
    const item = await prisma.planItem.update({ where: { id: itemId }, data: { quantity: parsed.data.quantity } });
    res.json({ item });
  } catch (e) { next(e); }
});

router.delete("/:planId/items/:itemId", async (req, res, next) => {
  const planId = idOf(req); const itemId = typeof req.params.itemId === "string" ? req.params.itemId : null;
  if (!planId || !itemId) { res.status(400).json({ error: "Valid plan and item IDs are required." }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.planItem.findFirst({ where: { id: itemId, planId, businessId }, select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Plan item not found." }); return; }
    await prisma.planItem.delete({ where: { id: itemId } });
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
