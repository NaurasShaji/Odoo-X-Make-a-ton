import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { AuthenticatedRequest, requireTenantRole, tenantScope } from "../tenancy/context.js";
import { nextSubscriptionStatus, type SubscriptionAction } from "./transitions.js";

const router = Router();
const lineSchema = z.object({ productId: z.string().min(1), quantity: z.number().finite().positive().max(100000), unitPrice: z.number().finite().min(0).max(9999999999.99), taxRate: z.number().finite().min(0).max(100) }).strict();
const createSchema = z.object({ customerId: z.string().min(1), planId: z.string().min(1), startDate: z.string().datetime(), expiryDate: z.string().datetime().optional().nullable(), lines: z.array(lineSchema).min(1).max(100) }).strict();
const idOf = (req: Request) => typeof req.params.subscriptionId === "string" ? req.params.subscriptionId : null;
const businessId = (req: AuthenticatedRequest) => req.auth?.tenant?.businessId ?? (() => { throw new Error("Verified business context is missing."); })();

router.use(requireTenantRole("ADMIN", "STAFF", "FINANCE"));

router.get("/", async (req, res, next) => {
  try {
    const business = businessId(req as AuthenticatedRequest);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const customerId = typeof req.query.customerId === "string" ? req.query.customerId : undefined;
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
    const where = tenantScope(business, { ...(status ? { status: status as any } : {}), ...(customerId ? { customerId } : {}), ...(search ? { OR: [{ number: { contains: search, mode: "insensitive" as const } }, { customer: { name: { contains: search, mode: "insensitive" as const } } }] } : {}) });
    const [subscriptions, total] = await prisma.$transaction([
      prisma.subscription.findMany({ where, include: { customer: true, plan: true, lines: { include: { product: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.subscription.count({ where })
    ]);
    res.json({ subscriptions, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid subscription details.", details: parsed.error.flatten() }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const data = parsed.data;
    const start = new Date(data.startDate);
    const expiry = data.expiryDate ? new Date(data.expiryDate) : null;
    if (expiry && expiry <= start) { res.status(400).json({ error: "expiryDate must be after startDate." }); return; }
    const [customer, plan] = await Promise.all([
      prisma.customer.findFirst({ where: tenantScope(business, { id: data.customerId }), select: { id: true } }),
      prisma.plan.findFirst({ where: tenantScope(business, { id: data.planId }), select: { id: true, minQuantity: true, availableFrom: true, availableUntil: true, items: { select: { productId: true } } } })
    ]);
    if (!customer) { res.status(404).json({ error: "Customer not found." }); return; }
    if (!plan) { res.status(404).json({ error: "Plan not found." }); return; }
    if (plan.availableFrom && start < plan.availableFrom) { res.status(400).json({ error: "Subscription starts before the plan becomes available." }); return; }
    if (plan.availableUntil && start > plan.availableUntil) { res.status(400).json({ error: "Subscription starts after the plan is no longer available." }); return; }
    if (data.lines.some((line) => line.quantity < plan.minQuantity)) { res.status(400).json({ error: `Each subscription line must meet the plan minimum quantity of ${plan.minQuantity}.` }); return; }
    const planProductIds = new Set(plan.items.map((item) => item.productId));
    if (data.lines.some((line) => !planProductIds.has(line.productId))) { res.status(400).json({ error: "Every subscription product must be associated with the selected plan." }); return; }
    const products = await prisma.product.findMany({ where: { businessId: business, id: { in: data.lines.map((line) => line.productId) } }, select: { id: true } });
    if (products.length !== new Set(data.lines.map((line) => line.productId)).size) { res.status(400).json({ error: "One or more products do not belong to the selected workspace." }); return; }
    const number = `SUB-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const subscription = await prisma.subscription.create({ data: { businessId: business, number, customerId: customer.id, planId: plan.id, startDate: start, expiryDate: expiry, status: "DRAFT", lines: { create: data.lines.map((line) => ({ businessId: business, productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.taxRate, amount: Number((line.quantity * line.unitPrice).toFixed(2)) })) } }, include: { customer: true, plan: true, lines: { include: { product: true } } } });
    res.status(201).json({ subscription });
  } catch (e) { next(e); }
});

router.get("/:subscriptionId", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid subscription ID is required." }); return; }
  try {
    const subscription = await prisma.subscription.findFirst({ where: tenantScope(businessId(req as AuthenticatedRequest), { id }), include: { customer: true, plan: { include: { items: { include: { product: true } } } }, lines: { include: { product: true } }, invoices: true } });
    if (!subscription) { res.status(404).json({ error: "Subscription not found." }); return; }
    res.json({ subscription });
  } catch (e) { next(e); }
});

router.post("/:subscriptionId/actions/:action", async (req, res, next) => {
  const id = idOf(req); const actionParam = typeof req.params.action === "string" ? req.params.action.toLowerCase() : null;
  if (!id || !actionParam) { res.status(400).json({ error: "Valid subscription ID and action are required." }); return; }
  const action = actionParam as SubscriptionAction;
  if (!["quotation", "confirm", "activate", "pause", "resume", "close"].includes(action)) { res.status(400).json({ error: `Unknown subscription action '${actionParam}'.` }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const subscription = await prisma.subscription.findFirst({ where: tenantScope(business, { id }), include: { plan: true } });
    if (!subscription) { res.status(404).json({ error: "Subscription not found." }); return; }
    const next = nextSubscriptionStatus(subscription.status, action);
    if (!next) { res.status(409).json({ error: `Action '${action}' is not allowed from status '${subscription.status}'.` }); return; }
    if (action === "activate" && subscription.startDate > new Date()) { res.status(400).json({ error: "A subscription cannot be activated before its start date." }); return; }
    if (action === "pause" && !subscription.plan.allowPause) { res.status(409).json({ error: "The selected plan does not allow pausing." }); return; }
    if (action === "close" && subscription.expiryDate && subscription.expiryDate > new Date() && !subscription.plan.earlyClose) { res.status(409).json({ error: "The selected plan does not allow early closure." }); return; }
    const changed = await prisma.subscription.updateMany({ where: { id, businessId: business, status: subscription.status }, data: { status: next } });
    if (changed.count !== 1) { res.status(409).json({ error: "Subscription status changed concurrently. Refresh and retry." }); return; }
    const updated = await prisma.subscription.findFirst({ where: tenantScope(business, { id }), include: { customer: true, plan: true, lines: { include: { product: true } } } });
    res.json({ subscription: updated });
  } catch (e) { next(e); }
});

export default router;
