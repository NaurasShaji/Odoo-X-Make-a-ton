import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { AuthenticatedRequest, requireTenantRole, resolveTenantContext } from "../tenancy/context.js";

const router = Router();
const inviteSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum(["STAFF", "FINANCE", "CUSTOMER"])
});
const acceptSchema = z.object({ token: z.string().min(32).max(256) });
const roleSchema = z.object({ role: z.enum(["STAFF", "FINANCE", "CUSTOMER", "ADMIN"]) });
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

function routeMemberId(req: Request): string {
  const value = req.params.userId;
  if (typeof value !== "string" || !value) throw new Error("A valid member user ID is required.");
  return value;
}

function userId(req: AuthenticatedRequest): string {
  if (!req.auth?.userId) throw new Error("Authenticated user context is missing.");
  return req.auth.userId;
}

// List every workspace the authenticated user belongs to.
router.get("/", async (req, res, next) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: userId(req as AuthenticatedRequest) },
      select: {
        businessId: true,
        role: true,
        business: { select: { name: true, slug: true } }
      },
      orderBy: { createdAt: "asc" }
    });
    res.json({ workspaces: memberships });
  } catch (error) {
    next(error);
  }
});

// Accepting an invitation does not require an already-selected workspace.
router.post("/invitations/accept", async (req, res, next) => {
  const parsed = acceptSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid invitation token is required." });
    return;
  }
  try {
    const id = userId(req as AuthenticatedRequest);
    const user = await prisma.user.findUnique({ where: { id }, select: { email: true } });
    if (!user) {
      res.status(401).json({ error: "Authenticated account was not found." });
      return;
    }
    const tokenHash = hashToken(parsed.data.token);
    const invitation = await prisma.businessInvitation.findUnique({
      where: { tokenHash },
      select: { id: true, businessId: true, email: true, role: true, expiresAt: true, acceptedAt: true }
    });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      res.status(400).json({ error: "Invitation is invalid, expired, or already used." });
      return;
    }
    if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      res.status(403).json({ error: "Sign in with the email address this invitation was sent to." });
      return;
    }

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.businessInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() }
      });
      if (claimed.count !== 1) throw new Error("INVITATION_ALREADY_CLAIMED");
      await tx.membership.create({
        data: { businessId: invitation.businessId, userId: id, role: invitation.role }
      });
    });
    res.status(201).json({ message: "Invitation accepted.", businessId: invitation.businessId, role: invitation.role });
  } catch (error) {
    if (error instanceof Error && error.message === "INVITATION_ALREADY_CLAIMED") {
      res.status(409).json({ error: "This invitation has already been used." });
      return;
    }
    next(error);
  }
});

// All remaining endpoints operate within a membership-verified workspace.
router.use(resolveTenantContext);

router.get("/members", async (req, res, next) => {
  try {
    const tenant = (req as AuthenticatedRequest).auth!.tenant!;
    const members = await prisma.membership.findMany({
      where: { businessId: tenant.businessId },
      select: {
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { email: true } }
      },
      orderBy: { createdAt: "asc" }
    });
    res.json({ members });
  } catch (error) {
    next(error);
  }
});

router.post("/invitations", requireTenantRole("ADMIN"), async (req, res, next) => {
  const parsed = inviteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid invitation details.", details: parsed.error.flatten() });
    return;
  }
  try {
    const tenant = (req as AuthenticatedRequest).auth!.tenant!;
    const email = parsed.data.email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      const existingMembership = await prisma.membership.findUnique({
        where: { businessId_userId: { businessId: tenant.businessId, userId: existingUser.id } }
      });
      if (existingMembership) {
        res.status(409).json({ error: "This user is already a member of the workspace." });
        return;
      }
    }
    const pending = await prisma.businessInvitation.findFirst({
      where: { businessId: tenant.businessId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true }
    });
    if (pending) {
      res.status(409).json({ error: "An active invitation already exists for this email." });
      return;
    }

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await prisma.businessInvitation.create({
      data: {
        businessId: tenant.businessId,
        email,
        role: parsed.data.role,
        tokenHash: hashToken(token),
        expiresAt,
        invitedById: tenant.userId
      },
      select: { id: true, email: true, role: true, expiresAt: true }
    });
    // No email provider is configured yet. Return the raw token once for secure out-of-band delivery.
    res.status(201).json({ invitation, token, delivery: "manual", message: "Send this token only to the invited email address. It will not be shown again." });
  } catch (error) {
    next(error);
  }
});

router.patch("/members/:userId/role", requireTenantRole("ADMIN"), async (req, res, next) => {
  const parsed = roleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid membership role." });
    return;
  }
  try {
    const tenant = (req as AuthenticatedRequest).auth!.tenant!;
    if (routeMemberId(req) === tenant.userId) {
      res.status(400).json({ error: "You cannot change your own role." });
      return;
    }
    const target = await prisma.membership.findUnique({
      where: { businessId_userId: { businessId: tenant.businessId, userId: routeMemberId(req) } },
      select: { role: true }
    });
    if (!target) {
      res.status(404).json({ error: "Workspace member not found." });
      return;
    }
    if (target.role === "ADMIN" && parsed.data.role !== "ADMIN") {
      const admins = await prisma.membership.count({ where: { businessId: tenant.businessId, role: "ADMIN" } });
      if (admins <= 1) {
        res.status(409).json({ error: "The workspace must retain at least one administrator." });
        return;
      }
    }
    const updated = await prisma.membership.update({
      where: { businessId_userId: { businessId: tenant.businessId, userId: routeMemberId(req) } },
      data: { role: parsed.data.role },
      select: { userId: true, role: true }
    });
    res.json({ member: updated });
  } catch (error) {
    next(error);
  }
});

router.delete("/members/:userId", requireTenantRole("ADMIN"), async (req, res, next) => {
  try {
    const tenant = (req as AuthenticatedRequest).auth!.tenant!;
    if (req.params.userId === tenant.userId) {
      res.status(400).json({ error: "You cannot remove yourself. Transfer administration first." });
      return;
    }
    const target = await prisma.membership.findUnique({
      where: { businessId_userId: { businessId: tenant.businessId, userId: req.params.userId } },
      select: { role: true }
    });
    if (!target) {
      res.status(404).json({ error: "Workspace member not found." });
      return;
    }
    if (target.role === "ADMIN") {
      const admins = await prisma.membership.count({ where: { businessId: tenant.businessId, role: "ADMIN" } });
      if (admins <= 1) {
        res.status(409).json({ error: "The workspace must retain at least one administrator." });
        return;
      }
    }
    await prisma.membership.delete({
      where: { businessId_userId: { businessId: tenant.businessId, userId: req.params.userId } }
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
