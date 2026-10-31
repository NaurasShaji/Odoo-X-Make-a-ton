# NexBill — Initial System Architecture

**Version:** 0.1  
**Status:** Initial architecture baseline

## 1. Architecture

NexBill starts as a modular monolith. The React web application communicates with an Express REST API. PostgreSQL is the source of truth, while Redis/BullMQ handles recurring and asynchronous work.

```text
Admin / Staff / Finance ──┐
                          ├──> React + TypeScript ──> Express REST API ──> PostgreSQL
Customer Portal ──────────┘                              │
                                                         └──> Redis ──> BullMQ Worker
```

## 2. Repository Layout

```text
.
├── apps/
│   ├── web/                  # React + TypeScript frontend
│   └── api/                  # Express + TypeScript backend
├── docs/
│   ├── SRS/                  # Requirements
│   └── architecture/         # Architecture decisions
├── docker-compose.yml        # PostgreSQL + Redis for local development
├── .env.example
└── package.json
```

## 3. Backend Modules

- **Auth & Access:** authentication, password reset, roles and permissions
- **Customers:** customer profiles and customer-scoped access
- **Catalog:** products, variants and plans
- **Quotations:** quotation templates and quotations
- **Subscriptions:** lifecycle, lines, pause/close/renewal state
- **Discounts & Taxes:** eligibility, limits and calculation rules
- **Billing:** billing schedules and invoice generation
- **Invoices:** invoice lifecycle and balances
- **Payments:** payment recording and reconciliation
- **Renewals:** expiry detection and renewal workflow
- **Analytics:** revenue summaries and drill-down data

## 4. Initial API Boundary

All endpoints use `/api/v1`.

```text
/auth
/customers
/products
/plans
/quotations
/subscriptions
/discounts
/taxes
/invoices
/payments
/renewals
/dashboard
```

The current API exposes health checks and placeholder module boundaries. Business logic will be added module-by-module rather than placing it directly in route handlers.

## 5. Database Foundation

The initial Prisma schema establishes the core domain entities:

- User and role
- Customer
- Product and product variant
- Plan
- Subscription and subscription lines
- Invoice and invoice lines
- Payment

The schema also establishes indexes for customer/status, subscription status/expiry, and invoice due date/status. Recurring billing will use a subscription + billing-period uniqueness rule to prevent duplicate invoices.

## 6. Reliability Rules

1. Financial totals are calculated server-side.
2. Customer data is scoped to the authenticated customer identity.
3. Billing jobs must be safe to retry.
4. Duplicate billing must be prevented by database constraints, not only application checks.
5. Financial operations should use database transactions.
6. List APIs will use pagination and indexed filters.

## 7. Implementation Order

1. Repository tooling and local infrastructure
2. Prisma schema and migrations
3. Authentication and role-based access
4. Products, variants and plans
5. Quotations and subscription lifecycle
6. Discounts, taxes and invoices
7. Payments and reconciliation
8. Billing worker and Billing Guard
9. Renewal workflow and customer portal
10. Revenue Command Center and performance validation
