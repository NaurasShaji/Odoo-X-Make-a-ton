import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { AuthenticatedRequest, requireTenantRole, tenantScope } from "../tenancy/context.js";

const router = Router();
const customerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  companyName: z.string().trim().max(160).optional().or(z.literal("")),
  address: z.string().trim().max(1000).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal(""))
}).strict();

function businessId(req: AuthenticatedRequest): string {
  const id = req.auth?.tenant?.businessId;
  if (!id) throw new Error("Verified business context is missing.");
  return id;
}

function customerId(req: Request): string | null {
  const value = req.params.customerId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

const cleanOptional = (value: string | undefined) => value?.trim() || null;
const writable = (data: z.infer<typeof customerSchema>) => ({
  name: data.name,
  email: cleanOptional(data.email),
  phone: cleanOptional(data.phone),
  companyName: cleanOptional(data.companyName),
  address: cleanOptional(data.address),
  notes: cleanOptional(data.notes)
});

router.use(requireTenantRole("ADMIN", "STAFF"));

router.get("/", async (req, res, next) => {
  try {
    const tenant = businessId(req as AuthenticatedRequest);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? "20"), 10) || 20));
    const where = tenantScope(tenant, search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { email: { contains: search, mode: "insensitive" as const } },
        { companyName: { contains: search, mode: "insensitive" as const } },
        { phone: { contains: search } }
      ]
    } : {});
    const [customers, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.customer.count({ where })
    ]);
    res.json({ customers, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  const parsed = customerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid customer details.", details: parsed.error.flatten() });
    return;
  }
  try {
    const customer = await prisma.customer.create({
      data: { ...writable(parsed.data), businessId: businessId(req as AuthenticatedRequest) }
    });
    res.status(201).json({ customer });
  } catch (error) { next(error); }
});

router.get("/:customerId", async (req, res, next) => {
  const id = customerId(req);
  if (!id) { res.status(400).json({ error: "A valid customer ID is required." }); return; }
  try {
    const customer = await prisma.customer.findFirst({
      where: tenantScope(businessId(req as AuthenticatedRequest), { id })
    });
    if (!customer) { res.status(404).json({ error: "Customer not found." }); return; }
    res.json({ customer });
  } catch (error) { next(error); }
});

router.patch("/:customerId", async (req, res, next) => {
  const id = customerId(req);
  if (!id) { res.status(400).json({ error: "A valid customer ID is required." }); return; }
  const parsed = customerSchema.partial().safeParse(req.body);
  if (!parsed.success || !Object.keys(parsed.success ? parsed.data : {}).length) {
    res.status(400).json({ error: "Provide valid customer fields to update.", ...(parsed.success ? {} : { details: parsed.error.flatten() }) });
    return;
  }
  try {
    const tenant = businessId(req as AuthenticatedRequest);
    const existing = await prisma.customer.findFirst({ where: tenantScope(tenant, { id }), select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Customer not found." }); return; }
    const data = parsed.data;
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...data,
        ...(data.email !== undefined ? { email: cleanOptional(data.email) } : {}),
        ...(data.phone !== undefined ? { phone: cleanOptional(data.phone) } : {}),
        ...(data.companyName !== undefined ? { companyName: cleanOptional(data.companyName) } : {}),
        ...(data.address !== undefined ? { address: cleanOptional(data.address) } : {}),
        ...(data.notes !== undefined ? { notes: cleanOptional(data.notes) } : {})
      }
    });
    res.json({ customer });
  } catch (error) { next(error); }
});

router.delete("/:customerId", async (req, res, next) => {
  const id = customerId(req);
  if (!id) { res.status(400).json({ error: "A valid customer ID is required." }); return; }
  try {
    const tenant = businessId(req as AuthenticatedRequest);
    const existing = await prisma.customer.findFirst({ where: tenantScope(tenant, { id }), select: { id: true } });
    if (!existing) { res.status(404).json({ error: "Customer not found." }); return; }
    try {
      await prisma.customer.delete({ where: { id } });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2003") {
        res.status(409).json({ error: "This customer is linked to subscriptions or invoices and cannot be deleted." });
        return;
      }
      throw error;
    }
    res.status(204).send();
  } catch (error) { next(error); }
});

export default router;
