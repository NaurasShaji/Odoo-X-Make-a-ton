import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { AuthenticatedRequest, requireTenantRole, tenantScope } from "../tenancy/context.js";

const router = Router();
const businessId = (req: AuthenticatedRequest) => req.auth?.tenant?.businessId ?? (() => { throw new Error("Verified business context is missing."); })();
const taxSchema = z.object({ name: z.string().trim().min(1).max(100), rate: z.number().finite().min(0).max(100), isDefault: z.boolean().optional(), active: z.boolean().optional() }).strict();
const discountSchema = z.object({ name: z.string().trim().min(1).max(100), type: z.enum(["PERCENTAGE", "FIXED"]), value: z.number().finite().min(0).max(9999999999.99), active: z.boolean().optional() }).strict();
const idOf = (req: Request) => typeof req.params.ruleId === "string" ? req.params.ruleId : null;

router.use(requireTenantRole("ADMIN", "FINANCE"));

router.get("/taxes", async (req, res, next) => {
  try { res.json({ taxRules: await prisma.taxRule.findMany({ where: tenantScope(businessId(req as AuthenticatedRequest)), orderBy: [{ isDefault: "desc" }, { name: "asc" }] }) }); }
  catch (error) { next(error); }
});
router.post("/taxes", async (req, res, next) => {
  const parsed = taxSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid tax rule.", details: parsed.error.flatten() }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const taxRule = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) await tx.taxRule.updateMany({ where: { businessId: business }, data: { isDefault: false } });
      return tx.taxRule.create({ data: { ...parsed.data, businessId: business } });
    });
    res.status(201).json({ taxRule });
  } catch (error) { next(error); }
});
router.patch("/taxes/:ruleId", async (req, res, next) => {
  const id = idOf(req); const parsed = taxSchema.partial().safeParse(req.body);
  if (!id || !parsed.success || !Object.keys(parsed.data ?? {}).length) { res.status(400).json({ error: "A valid rule ID and tax fields are required.", ...(parsed.success ? {} : { details: parsed.error.flatten() }) }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.taxRule.findFirst({ where: tenantScope(business, { id }) });
    if (!existing) { res.status(404).json({ error: "Tax rule not found." }); return; }
    const taxRule = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) await tx.taxRule.updateMany({ where: { businessId: business, id: { not: id } }, data: { isDefault: false } });
      return tx.taxRule.update({ where: { id }, data: parsed.data });
    });
    res.json({ taxRule });
  } catch (error) { next(error); }
});
router.delete("/taxes/:ruleId", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid rule ID is required." }); return; }
  try {
    const result = await prisma.taxRule.deleteMany({ where: tenantScope(businessId(req as AuthenticatedRequest), { id }) });
    if (!result.count) { res.status(404).json({ error: "Tax rule not found." }); return; }
    res.status(204).send();
  } catch (error) { next(error); }
});

router.get("/discounts", async (req, res, next) => {
  try { res.json({ discountRules: await prisma.discountRule.findMany({ where: tenantScope(businessId(req as AuthenticatedRequest)), orderBy: { name: "asc" } }) }); }
  catch (error) { next(error); }
});
router.post("/discounts", async (req, res, next) => {
  const parsed = discountSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid discount rule.", details: parsed.error.flatten() }); return; }
  try {
    const discountRule = await prisma.discountRule.create({ data: { ...parsed.data, businessId: businessId(req as AuthenticatedRequest) } });
    res.status(201).json({ discountRule });
  } catch (error) { next(error); }
});
router.patch("/discounts/:ruleId", async (req, res, next) => {
  const id = idOf(req); const parsed = discountSchema.partial().safeParse(req.body);
  if (!id || !parsed.success || !Object.keys(parsed.data ?? {}).length) { res.status(400).json({ error: "A valid rule ID and discount fields are required.", ...(parsed.success ? {} : { details: parsed.error.flatten() }) }); return; }
  try {
    const business = businessId(req as AuthenticatedRequest);
    const existing = await prisma.discountRule.findFirst({ where: tenantScope(business, { id }) });
    if (!existing) { res.status(404).json({ error: "Discount rule not found." }); return; }
    res.json({ discountRule: await prisma.discountRule.update({ where: { id }, data: parsed.data }) });
  } catch (error) { next(error); }
});
router.delete("/discounts/:ruleId", async (req, res, next) => {
  const id = idOf(req); if (!id) { res.status(400).json({ error: "A valid rule ID is required." }); return; }
  try {
    const result = await prisma.discountRule.deleteMany({ where: tenantScope(businessId(req as AuthenticatedRequest), { id }) });
    if (!result.count) { res.status(404).json({ error: "Discount rule not found." }); return; }
    res.status(204).send();
  } catch (error) { next(error); }
});

export default router;
