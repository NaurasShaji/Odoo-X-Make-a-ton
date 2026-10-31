import { Router, type Request } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { AuthenticatedRequest, requireTenantRole, tenantScope } from "../tenancy/context.js";
import { PRODUCT_SORTS, fieldErrors, parseListQuery, productCreateSchema, productUpdateSchema, variantSchema } from "./validation.js";

const router = Router();
const businessId = (req: AuthenticatedRequest) => req.auth?.tenant?.businessId ?? (() => { throw new Error("Verified business context is missing."); })();
const idOf = (req: Request) => typeof req.params.productId === "string" ? req.params.productId : null;
const isFkViolation = (e: unknown) => typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2003";

router.use(requireTenantRole("ADMIN", "STAFF"));

router.get("/", async (req, res, next) => {
  try {
    const business = businessId(req as AuthenticatedRequest);
    const { search, type, sort, page, pageSize } = parseListQuery(req.query as Record<string, unknown>);
    const filters: Prisma.ProductWhereInput[] = [];
    if (search) filters.push({ OR: [{ name: { contains: search, mode: "insensitive" } }, { type: { contains: search, mode: "insensitive" } }, { notes: { contains: search, mode: "insensitive" } }, { variants: { some: { name: { contains: search, mode: "insensitive" } } } }] });
    if (type) filters.push({ type: { equals: type, mode: "insensitive" } });
    const where = tenantScope(business, filters.length ? { AND: filters } : {});
    const [products, total] = await prisma.$transaction([
      prisma.product.findMany({ where, include: { variants: { orderBy: { name: "asc" } } }, orderBy: PRODUCT_SORTS[sort], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.product.count({ where })
    ]);
    res.json({ products, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (e) { next(e); }
});

router.get("/types", async (req, res, next) => {
  try {
    const rows = await prisma.product.findMany({ where: tenantScope(businessId(req as AuthenticatedRequest), {}), select: { type: true }, distinct: ["type"], orderBy: { type: "asc" } });
    res.json({ types: rows.map((row) => row.type) });
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  const parsed = productCreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Please fix the highlighted product fields.", fieldErrors: fieldErrors(parsed.error) }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const { variants = [], notes, ...fields } = parsed.data;
    const product = await prisma.product.create({
      data: { ...fields, notes: notes?.trim() || null, businessId: business, variants: { create: variants } },
      include: { variants: { orderBy: { name: "asc" } } }
    });
    res.status(201).json({ product });
  } catch (e) { next(e); }
});

router.get("/:productId", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid product ID is required." }); return; }
  try {
    const product = await prisma.product.findFirst({ where: tenantScope(businessId(req as AuthenticatedRequest), { id }), include: { variants: { orderBy: { name: "asc" } }, planItems: { include: { plan: true } } } });
    if (!product) { res.status(404).json({ error: "Product not found." }); return; }
    res.json({ product });
  } catch (e) { next(e); }
});

router.patch("/:productId", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid product ID is required." }); return; }
  const parsed = productUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Please fix the highlighted product fields.", fieldErrors: fieldErrors(parsed.error) }); return; }
  if (!Object.keys(parsed.data).length) { res.status(400).json({ error: "Provide at least one product field to update." }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.product.findFirst({ where: tenantScope(business, { id }), select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Product not found." }); return; }
    const { variants, notes, ...fields } = parsed.data;
    const product = await prisma.$transaction(async (tx) => {
      if (variants) {
        await tx.productVariant.deleteMany({ where: { productId: id, businessId: business } });
        if (variants.length) await tx.productVariant.createMany({ data: variants.map((variant) => ({ ...variant, productId: id, businessId: business })) });
      }
      return tx.product.update({ where: { id }, data: { ...fields, ...(notes !== undefined ? { notes: notes.trim() || null } : {}) }, include: { variants: { orderBy: { name: "asc" } } } });
    });
    res.json({ product });
  } catch (e) { next(e); }
});

router.delete("/:productId", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid product ID is required." }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.product.findFirst({ where: tenantScope(business, { id }), select: { id: true, _count: { select: { planItems: true, quotationLines: true, subscriptionLines: true, invoiceLines: true } } } });
    if (!existing) { res.status(404).json({ error: "Product not found." }); return; }
    const links = existing._count;
    const used = [links.planItems && "plans", links.quotationLines && "quotations", links.subscriptionLines && "subscriptions", links.invoiceLines && "invoices"].filter(Boolean);
    if (used.length) { res.status(409).json({ error: `This product is used in ${used.join(", ")} and cannot be deleted. Remove it from those records first.` }); return; }
    try { await prisma.product.delete({ where: { id } }); } catch (e) {
      if (isFkViolation(e)) { res.status(409).json({ error: "This product is linked to plans, subscriptions or invoices and cannot be deleted." }); return; }
      throw e;
    }
    res.status(204).send();
  } catch (e) { next(e); }
});

router.post("/:productId/variants", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid product ID is required." }); return; }
  const parsed = variantSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Please fix the highlighted variant fields.", fieldErrors: fieldErrors(parsed.error) }); return; }
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
    const existing = await prisma.productVariant.findFirst({ where: { id: variantId, productId, businessId: business } });
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
    const existing = await prisma.productVariant.findFirst({ where: { id: variantId, productId, businessId: business }, select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Variant not found." }); return; }
    await prisma.productVariant.delete({ where: { id: variantId } });
    res.status(204).send();
  } catch (e) { next(e); }
});

export default router;
