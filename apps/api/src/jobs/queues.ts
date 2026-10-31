import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env.js";

export const redisConnection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null
});

export const billingQueue = new Queue("billing", {
  connection: redisConnection
});

export const renewalQueue = new Queue("renewals", {
  connection: redisConnection
});
