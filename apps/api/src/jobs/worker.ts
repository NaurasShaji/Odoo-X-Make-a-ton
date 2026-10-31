import { Worker } from "bullmq";
import { redisConnection } from "./queues.js";
import { generateDueInvoices } from "../billing/service.js";
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
      where: { ...(typeof job.data?.businessId === "string" ? { businessId: job.data.businessId } : {}), status: "ACTIVE", expiryDate: { gte: now, lte: horizon } },
      select: { id: true, number: true, businessId: true, customerId: true, expiryDate: true }
    });
    return { checked: subscriptions.length, subscriptions };
  },
  { connection: redisConnection }
);
