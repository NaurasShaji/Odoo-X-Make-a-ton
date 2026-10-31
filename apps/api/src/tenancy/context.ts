import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "@prisma/client";

export type TenantContext = {
  userId: string;
  businessId: string;
  role: UserRole;
};

export type TenantRequest = Request & {
  auth?: {
    userId: string;
    tenant?: TenantContext;
  };
};

export function requireTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const tenant = (req as TenantRequest).auth?.tenant;

  if (!tenant?.userId || tenant.userId !== (req as TenantRequest).auth?.userId || !tenant.businessId || !tenant.role) {
    res.status(403).json({ error: "A verified business membership is required." });
    return;
  }

  next();
}

export function tenantScope<T extends object>(
  businessId: string,
  where: T = {} as T
): T & { businessId: string } {
  if (!businessId.trim()) {
    throw new Error("businessId is required for tenant-scoped queries.");
  }

  return { ...where, businessId };
}

export function assertSameBusiness(
  contextBusinessId: string,
  ...recordBusinessIds: string[]
): void {
  if (!contextBusinessId || recordBusinessIds.some((id) => id !== contextBusinessId)) {
    throw new Error("Cross-business access is not permitted.");
  }
}
