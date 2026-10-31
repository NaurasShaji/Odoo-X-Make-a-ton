# NexBill — System Architecture

**Version:** 0.2  
**Status:** Multi-tenant foundation implemented; application workflows in progress

## 1. Architecture

NexBill uses a modular-monolith architecture. The React web application communicates with an Express REST API. PostgreSQL is the source of truth; Redis and BullMQ handle asynchronous and recurring work.

```text
Admin / Staff / Finance ──┐
                          ├──> React + TypeScript ──> Express REST API ──> PostgreSQL
Customer Portal ──────────┘                              │
                                                         └──> Redis ──> BullMQ Worker
```

The API, web application and worker remain separately deployable processes within one codebase. Domain modules should not be split into microservices without a demonstrated operational need.

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
- **Payments:** payment recording, provider references and reconciliation
- **Renewals:** expiry detection and renewal workflow
- **Analytics:** revenue summaries and drill-down data

Keep domain rules in module services rather than route handlers. Route handlers should validate input, invoke services and translate outcomes into HTTP responses.

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

The current API exposes health checks and placeholder module boundaries. Authentication and route-level membership verification are still pending.

## 5. Database Domain

The Prisma schema currently models:

- Users and global application roles
- Customers
- Products, variants and plan items
- Plans with an explicit billing-period enum
- Subscriptions, subscription lines and lifecycle states
- Invoices, invoice lines and billing-period metadata
- Payments with processing status and provider/idempotency references

A plan can contain multiple products through `PlanItem`. Subscription lines and invoice lines retain price, quantity and tax snapshots so later catalog price changes do not rewrite historical transactions.

### Recurring invoice idempotency

For every recurring invoice, the billing service must set:
- `subscriptionId`
- `billingPeriodKey` in a documented canonical format
- `periodStart` and `periodEnd`
- `recurringKey` to a deterministic value derived from subscription ID and billing-period key

The unique `recurringKey` is the database-level duplicate guard. It must be generated consistently by every billing entry point. Do not rely only on a pre-insert existence check. Ad-hoc invoices may leave these recurring fields null.

### Payment processing

A payment record begins as `PENDING` and transitions based on verified provider or manual-payment outcomes. Use an idempotency key for retryable payment-creation requests and provider transaction references for reconciliation. Do not mark an invoice paid merely because a payment request was submitted; derive invoice balance/status from successful, non-refunded payment amounts and invoice totals.

Refunds are represented as separate immutable Refund records linked to the original payment. Refund amounts and statuses must be reconciled against the successful payment amount; never overwrite the original payment amount to conceal partial refund history.

### Subscription lifecycle

The schema includes `PAUSED`, but lifecycle transitions, pause windows, proration, renewal timing and the meaning of plan flags still require service-level rules. Enforce allowed transitions in application services, not by allowing arbitrary status updates from API requests.

## 6. Tenant Isolation

NexBill supports both deployment modes using the same data model:
- **Single-business deployment:** one Business/workspace is created during setup.
- **Multi-tenant SaaS:** each independent business has its own Business/workspace and memberships.

Every tenant-owned record (customers, products, plans, subscriptions and invoices) carries a `businessId`. Membership assigns a user a role within a business; roles are no longer global. Customer identity remains global, while a customer can have a separate customer record in each business. Subscription and invoice numbers, and recurring invoice keys, are unique within a business.

The migration creates a default business, backfills all existing tenant-owned records into it, copies each existing user's role into a membership, and then removes the global user role. Existing data therefore remains assigned to one workspace after migration.

**Authorization requirement:** authentication must establish the user identity and verify an active Membership before setting `req.auth.tenant`. Routes must run tenant-context middleware and every database query must include the active `businessId`. Related record IDs supplied by clients must be checked against that same business before use. Never trust a business ID, user ID or role supplied only in a request body/header. The current helper fails closed when verified tenant context is absent. Composite foreign keys across every child table are not yet implemented, so service-level relation checks remain mandatory.

For single-business self-hosted installs, use one business and do not disable tenant scoping. This keeps the deployment model compatible with later SaaS operation.

## 7. Reliability and Security Rules

1. Calculate financial totals on the server using decimal arithmetic.
2. Treat invoice lines and subscription lines as historical price/tax snapshots.
3. Scope every customer-facing read and write to the authenticated customer identity.
4. Make background jobs safe to retry; use deterministic job IDs and database idempotency keys.
5. Prevent duplicate recurring invoices with the unique recurring key, not only application checks.
6. Use database transactions for financial state changes.
7. Reconcile payment provider events idempotently and verify webhook signatures.
8. Never trust a client-supplied role, price, tax amount, invoice total or payment-success state.
9. Paginate list APIs and index common filters.
10. Keep secrets and production credentials outside source control.

## 8. Implementation Order

1. Repository tooling and local infrastructure
2. Prisma schema review, validation and migrations
3. Tenant ownership, memberships and tenant-context enforcement
4. Authentication and role-based access
5. Products, variants, plans and plan items
6. Quotations and subscription lifecycle
7. Discounts, taxes and invoice generation
8. Payment recording, provider integration and refund ledger
9. Billing worker, retry policy and Billing Guard
10. Renewal workflow and customer portal
11. Revenue analytics and performance validation

## 9. Current Limitations

This document describes the intended architecture, not completed functionality. The API routes are still placeholders, the BullMQ worker does not yet execute billing logic, and authentication, tenant isolation, payment reconciliation and business workflows remain to be implemented. Prisma schema validation, migration generation and automated tests must pass before this schema is treated as deployable.


## Workspace membership and invitations

The API exposes authenticated workspace management under `/api/v1/workspaces`:

- `GET /`: list workspaces for the authenticated user.
- `GET /members`: list members in the workspace selected by `x-business-id`.
- `POST /invitations`: administrators create invitations for STAFF, FINANCE or CUSTOMER roles.
- `POST /invitations/accept`: an authenticated user accepts an invitation only when their account email matches the invited email.
- `PATCH /members/:userId/role`: administrators update a member's role.
- `DELETE /members/:userId`: administrators remove a member.

Invitation tokens are generated using a cryptographically secure random source. Only a SHA-256 hash is stored in the database; the raw token is returned once because no email delivery provider is configured yet. Tokens expire after seven days. Deliver tokens only to the intended email address.

The API prevents an administrator from removing themselves or demoting/removing the last administrator. These checks are application-level safeguards; concurrency and email-delivery integration require additional production hardening before launch.
