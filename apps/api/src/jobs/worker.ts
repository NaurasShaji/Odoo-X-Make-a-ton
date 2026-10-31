import { Worker } from "bullmq";
import { billingQueue, renewalQueue, redisConnection } from "./queues.js";
import { generateDueInvoices } from "../billing/service.js";
import { addBillingPeriod } from "../billing/logic.js";
import { prisma } from "../db/prisma.js";

export const billingWorker = new Worker(
  "billing",
  async (job) => {
    if (job.name === "generate-invoices") {
      const result = await generateDueInvoices(typeof job.data?.businessId === "string" ? job.data.businessId : undefined);
      console.log("Billing Guard run:", result);
      return result;
    }
    throw new Error(`Unknown billing job: ${job.name}`);
  },
  { connection: redisConnection }
);

export const renewalWorker = new Worker(
  "renewals",
  async (job) => {
    if (job.name !== "check-renewals") throw new Error(`Unknown renewal job: ${job.name}`);
    const now = new Date();
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 7);
    const subscriptions = await prisma.subscription.findMany({
      where: { ...(typeof job.data?.businessId === "string" ? { businessId: job.data.businessId } : {}), status: "ACTIVE", expiryDate: { not: null, lte: horizon } },
      include: { plan: { select: { billingPeriod: true, autoRenew: true, autoClose: true } }, customer: { select: { name: true, email: true } } },
      orderBy: { expiryDate: "asc" }
    });
    const results: Array<{ subscriptionId: string; action: string; expiryDate?: Date | null }> = [];
    for (const subscription of subscriptions) {
      if (subscription.expiryDate && subscription.expiryDate <= now) {
        if (subscription.plan.autoRenew) {
          let nextExpiry = subscription.expiryDate;
          while (nextExpiry <= now) nextExpiry = addBillingPeriod(nextExpiry, subscription.plan.billingPeriod);
          const changed = await prisma.subscription.updateMany({
            where: { id: subscription.id, businessId: subscription.businessId, status: "ACTIVE", expiryDate: subscription.expiryDate },
            data: { expiryDate: nextExpiry }
          });
          results.push({ subscriptionId: subscription.id, action: changed.count ? "auto_renewed" : "concurrent_update", expiryDate: changed.count ? nextExpiry : subscription.expiryDate });
        } else if (subscription.plan.autoClose) {
          const changed = await prisma.subscription.updateMany({
            where: { id: subscription.id, businessId: subscription.businessId, status: "ACTIVE", expiryDate: subscription.expiryDate },
            data: { status: "CLOSED" }
          });
          results.push({ subscriptionId: subscription.id, action: changed.count ? "auto_closed" : "concurrent_update", expiryDate: subscription.expiryDate });
        } else {
          results.push({ subscriptionId: subscription.id, action: "manual_renewal_required", expiryDate: subscription.expiryDate });
        }
      } else {
        results.push({ subscriptionId: subscription.id, action: "renewal_due_soon", expiryDate: subscription.expiryDate });
      }
    }
    return { checked: subscriptions.length, results };
  },
  { connection: redisConnection }
);

void Promise.all([
  billingQueue.upsertJobScheduler("recurring-billing", { every: 60 * 60 * 1000 }, { name: "generate-invoices" }),
  renewalQueue.upsertJobScheduler("renewal-check", { every: 6 * 60 * 60 * 1000 }, { name: "check-renewals" })
]).catch((error) => console.error("Unable to schedule background jobs", error));
