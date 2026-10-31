import { randomUUID } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db/prisma.js";

const router = Router();
const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(128),
  businessName: z.string().trim().min(2).max(120)
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128)
});

function tokenSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters.");
  return secret;
}

router.post("/register", async (req, res, next) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid registration details.", details: parsed.error.flatten() });
    return;
  }

  try {
    const email = parsed.data.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, passwordHash },
        select: { id: true, email: true }
      });
      const business = await tx.business.create({
        data: {
          name: parsed.data.businessName,
          slug: "biz-" + randomUUID()
        },
        select: { id: true, name: true }
      });
      await tx.membership.create({
        data: { userId: created.id, businessId: business.id, role: "ADMIN" }
      });
      return { ...created, business };
    });

    const token = jwt.sign({ sub: user.id }, tokenSecret(), { expiresIn: "1h", issuer: "nexbill-api", audience: "nexbill" });
    res.status(201).json({ token, user: { id: user.id, email: user.email }, business: user.business });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid login details." });
    return;
  }

  try {
    const email = parsed.data.email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }

    const memberships = await prisma.membership.findMany({
      where: { userId: user.id },
      select: { businessId: true, role: true, business: { select: { name: true, slug: true } } }
    });
    const token = jwt.sign({ sub: user.id }, tokenSecret(), { expiresIn: "1h", issuer: "nexbill-api", audience: "nexbill" });
    res.json({ token, user: { id: user.id, email: user.email }, businesses: memberships });
  } catch (error) {
    next(error);
  }
});

export default router;
