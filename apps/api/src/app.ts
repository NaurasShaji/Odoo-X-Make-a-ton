import cors from "cors";
import express from "express";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "nexbill-api"
  });
});

app.use("/api/v1/auth", (_req, res) => res.status(501).json({ message: "Auth module pending" }));
app.use("/api/v1/customers", (_req, res) => res.status(501).json({ message: "Customers module pending" }));
app.use("/api/v1/products", (_req, res) => res.status(501).json({ message: "Catalog module pending" }));
app.use("/api/v1/plans", (_req, res) => res.status(501).json({ message: "Plans module pending" }));
app.use("/api/v1/quotations", (_req, res) => res.status(501).json({ message: "Quotations module pending" }));
app.use("/api/v1/subscriptions", (_req, res) => res.status(501).json({ message: "Subscriptions module pending" }));
app.use("/api/v1/invoices", (_req, res) => res.status(501).json({ message: "Invoices module pending" }));
app.use("/api/v1/payments", (_req, res) => res.status(501).json({ message: "Payments module pending" }));
app.use("/api/v1/dashboard", (_req, res) => res.status(501).json({ message: "Dashboard module pending" }));

export default app;
