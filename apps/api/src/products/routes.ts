import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { AuthenticatedRequest, requireTenantRole, tenantScope } from "../tenancy/context.js";

const router = Router();
const money = z.number().finite().min(0).max(9999999999.99);
const productSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.string().trim().min(1).max(60),
  salesPrice: money,
  costPrice: money,
  notes: z.string().trim().max(2000).optional().or(z.literal(""))
}).strict();
const variantSchema = z.object({ name: z.string().trim().min(1).max(120), priceAddOn: money }).strict();
const businessId = (req: AuthenticatedRequest) => req.auth?.tenant?.businessId ?? (() => { throw new Error("Verified business context is missing."); })();
const idOf = (req: Request) => typeof req.params.productId === "string" ? req.params.productId : null;

router.use(requireTenantRole("ADMIN", "STAFF"));

router.get("/", async (req, res, next) => {
  try {
    const business = businessId(req as AuthenticatedRequest);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
    const where = tenantScope(business, search ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { type: { contains: search, mode: "insensitive" as const } }] } : {});
    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({ where, include: { variants: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.product.count({ where })
    ]);
    res.json({ products, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid product details.", details: parsed.error.flatten() }); return; }
  try {
    const product = await prisma.product.create({ data: { ...parsed.data, notes: parsed.data.notes?.trim() || null, businessId: businessId(req as AuthenticatedRequest) }, include: { variants: true } });
    res.status(201).json({ product });
  } catch (e) { next(e); }
});

router.get("/:productId", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid product ID is required." }); return; }
  try {
    const product = await prisma.product.findFirst({ where: tenantScope(businessId(req as AuthenticatedRequest), { id }), include: { variants: true, planItems: { include: { plan: true } } } });
    if (!product) { res.status(404).json({ error: "Product not found." }); return; }
    res.json({ product });
  } catch (e) { next(e); }
});

router.patch("/:productId", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid product ID is required." }); return; }
  const parsed = productSchema.partial().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data ?? {}).length) { res.status(400).json({ error: "Provide valid product fields to update.", ...(parsed.success ? {} : { details: parsed.error.flatten() }) }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.product.findFirst({ where: tenantScope(business, { id }), select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Product not found." }); return; }
    const product = await prisma.product.update({ where: { id }, data: { ...parsed.data, ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes.trim() || null } : {}) }, include: { variants: true } });
    res.json({ product });
  } catch (e) { next(e); }
});

router.delete("/:productId", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid product ID is required." }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.product.findFirst({ where: tenantScope(business, { id }), select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Product not found." }); return; }
    try { await prisma.product.delete({ where: { id } }); } catch (e) {
      if (typeof e === "object" && e !== null && "code" in e && e.code === "P2003") { res.status(409).json({ error: "This product is linked to plans, subscriptions or invoices and cannot be deleted." }); return; }
      throw e;
    }
    res.status(204).send();
  } catch (e) { next(e); }
});

router.post("/:productId/variants", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid product ID is required." }); return; }
  const parsed = variantSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid variant details.", details: parsed.error.flatten() }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const product = await prisma.product.findFirst({ where: tenantScope(business, { id }), select: { id: true } });
    if (!product) { res.status(404).json({ error: "Product not found." }); return; }
    const variant = await prisma.productVariant.create({ data: { ...parsed.data, productId: id, businessId: business } });
    res.status(201).json({ variant });
  } catch (e) { next(e); }
});

router.patch("/:productId/variants/:variantId", async (req, res, next) => {
  const productId = idOf(req); const variantId = typeof req.params.variantId === "string" ? req.params.variantId : null;
  if (!productId || !variantId) { res.status(400).json({ error: "Valid product and variant IDs are required." }); return; }
  const parsed = variantSchema.partial().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.data ?? {}).length) { res.status(400).json({ error: "Provide valid variant fields to update." }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.productVariant.findFirst({ where: { id: variantId, productId, businessId } });
    if (!existing) { res.status(404).json({ error: "Variant not found." }); return; }
    const variant = await prisma.productVariant.update({ where: { id: variantId }, data: parsed.data });
    res.json({ variant });
  } catch (e) { next(e); }
});

router.delete("/:productId/variants/:variantId", async (req, res, next) => {
  const productId = idOf(req); const variantId = typeof req.params.variantId === "string" ? req.params.variantId : null;
  if (!productId || !variantId) { res.status(400).json({ error: "Valid product and variant IDs are required." }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.productVariant.findFirst({ where: { id: variantId, productId, businessId }, select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Variant not found." }); return; }
    await prisma.productVariant.delete({ where: { id: variantId } });
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
