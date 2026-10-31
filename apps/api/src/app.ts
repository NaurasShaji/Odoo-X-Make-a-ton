import cors from "cors";
import express from "express";
import authRouter from "./auth/routes.js";
import workspaceRouter from "./workspaces/routes.js";
import customerRouter from "./customers/routes.js";
import productRouter from "./products/routes.js";
import planRouter from "./plans/routes.js";
import subscriptionRouter from "./subscriptions/routes.js";
import { authenticate, resolveTenantContext } from "./tenancy/context.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "nexbill-api"
  });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/workspaces", authenticate, workspaceRouter);
app.use("/api/v1/customers", authenticate, resolveTenantContext, customerRouter);
app.use("/api/v1/products", authenticate, resolveTenantContext, productRouter);
app.use("/api/v1/plans", authenticate, resolveTenantContext, planRouter);
app.use("/api/v1/quotations", authenticate, resolveTenantContext, (_req, res) => res.status(501).json({ message: "Quotations module pending" }));
app.use("/api/v1/subscriptions", authenticate, resolveTenantContext, subscriptionRouter);
app.use("/api/v1/invoices", authenticate, resolveTenantContext, (_req, res) => res.status(501).json({ message: "Invoices module pending" }));
app.use("/api/v1/payments", authenticate, resolveTenantContext, (_req, res) => res.status(501).json({ message: "Payments module pending" }));
app.use("/api/v1/dashboard", authenticate, resolveTenantContext, (_req, res) => res.status(501).json({ message: "Dashboard module pending" }));

export default app;
