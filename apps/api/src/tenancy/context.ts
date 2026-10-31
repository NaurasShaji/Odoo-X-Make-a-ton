import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";
import jwt from "jsonwebtoken";
import { prisma } from "../db/prisma.js";

export type TenantContext = { userId: string; businessId: string; role: UserRole };
export type AuthenticatedRequest = Request & { auth?: { userId: string; tenant?: TenantContext } };

function tokenSecret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters.");
  return value;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  try {
    const payload = jwt.verify(token, tokenSecret(), { issuer: "nexbill-api", audience: "nexbill" });
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      res.status(401).json({ error: "Invalid access token." });
      return;
    }
    (req as AuthenticatedRequest).auth = { userId: payload.sub };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired access token." });
  }
}

export async function resolveTenantContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = (req as AuthenticatedRequest).auth;
  const businessId = req.header("x-business-id");
  if (!auth?.userId) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (!businessId) {
    res.status(400).json({ error: "Select a business workspace." });
    return;
  }
  try {
    const membership = await prisma.membership.findUnique({
      where: { businessId_userId: { businessId, userId: auth.userId } },
      select: { businessId: true, userId: true, role: true }
    });
    if (!membership) {
      res.status(403).json({ error: "You do not have access to this business." });
      return;
    }
    auth.tenant = { userId: membership.userId, businessId: membership.businessId, role: membership.role };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireTenantRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tenant = (req as AuthenticatedRequest).auth?.tenant;
    if (!tenant) {
      res.status(403).json({ error: "A verified business membership is required." });
      return;
    }
    if (roles.length && !roles.includes(tenant.role)) {
      res.status(403).json({ error: "Insufficient business permissions." });
      return;
    }
    next();
  };
}

export function tenantScope<T extends object>(businessId: string, where: T = {} as T): T & { businessId: string } {
  if (!businessId.trim()) throw new Error("businessId is required for tenant-scoped queries.");
  return { ...where, businessId };
}
