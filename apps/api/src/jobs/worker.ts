import { Worker } from "bullmq";
import { redisConnection } from "./queues.js";

export const billingWorker = new Worker(
  "billing",
  async (job) => {
    console.log(`Billing job received: ${job.name}`);
    // Billing Guard and invoice generation will be implemented here.
  },
  { connection: redisConnection }
);

export const renewalWorker = new Worker(
  "renewals",
  async (job) => {
    console.log(`Renewal job received: ${job.name}`);
    // Renewal detection and notification will be implemented here.
  },
  { connection: redisConnection }
);
