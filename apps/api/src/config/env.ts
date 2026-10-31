import "dotenv/config";

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379"
};

if (!env.databaseUrl) {
  console.warn("DATABASE_URL is not configured. Database features will remain unavailable until it is set.");
}
