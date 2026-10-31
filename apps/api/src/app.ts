import cors from "cors";
import express from "express";
import authRouter from "./auth/routes.js";
import workspaceRouter from "./workspaces/routes.js";
import customerRouter from "./customers/routes.js";
import productRouter from "./products/routes.js";
import planRouter from "./plans/routes.js";
import subscriptionRouter from "./subscriptions/routes.js";
import quotationRouter from "./quotations/routes.js";
import invoiceRouter from "./invoices/routes.js";
import dashboardRouter from "./dashboard/routes.js";
import { authenticate, resolveTenantContext } from "./tenancy/context.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "nexbill-api" });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/workspaces", authenticate, workspaceRouter);
app.use("/api/v1/customers", authenticate, resolveTenantContext, customerRouter);
app.use("/api/v1/products", authenticate, resolveTenantContext, productRouter);
app.use("/api/v1/plans", authenticate, resolveTenantContext, planRouter);
app.use("/api/v1/quotations", authenticate, resolveTenantContext, quotationRouter);
app.use("/api/v1/subscriptions", authenticate, resolveTenantContext, subscriptionRouter);
app.use("/api/v1/invoices", authenticate, resolveTenantContext, invoiceRouter);
app.use("/api/v1/payments", authenticate, resolveTenantContext, (_req, res) => res.status(501).json({ message: "Payment standalone endpoints pending; invoice payments are available." }));
app.use("/api/v1/dashboard", authenticate, resolveTenantContext, dashboardRouter);

export default app;
