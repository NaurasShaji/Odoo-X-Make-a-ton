# NexBill

**Subscription and Recurring Revenue Management Platform**

NexBill is a web-based application for managing business workspaces, customers, products, subscription plans, quotations, subscriptions, recurring invoices, payments, refunds, pricing rules and revenue visibility.

> One platform. Every subscription. Every transaction. Fully connected.

- **Repository:** [NaurasShaji/Odoo-X-Make-a-ton](https://github.com/NaurasShaji/Odoo-X-Make-a-ton)
- **Default branch:** `main`
- **Project:** Odoo X Make-a-ton 2026
- **Current version:** 0.1.0 (active development)

---

## 1. Project status

NexBill is an active development project. The backend foundation and core billing workflows are ahead of the frontend. The application is **not production-ready**.

### Implemented in the current codebase

- Multi-tenant business workspaces and per-workspace membership roles.
- User registration and login using bcrypt password hashing and signed JWTs.
- Workspace listing, member listing, invitations, invitation acceptance, role changes and member removal.
- Tenant-scoped customer management API and frontend create, view, search, edit and delete workflows.
- Tenant-scoped product and product-variant APIs and frontend create, view, edit and delete workflows.
- Product search, type filtering, sorting and pagination.
- Subscription plan APIs, plan items and plan lifecycle policy fields.
- Quotation creation, listing, retrieval, status transitions and conversion into a subscription.
- Quotation pricing with percentage or fixed discounts, reusable discount rules and saved tax rules.
- Subscription creation, listing and lifecycle transitions.
- Invoice listing, retrieval, confirmation, cancellation, manual billing runs and recurring invoice generation.
- Recurring invoice duplicate protection using a deterministic unique recurring key.
- Manual payment recording with mandatory idempotency keys.
- Refund records, refundable-balance checks and invoice settlement reconciliation.
- Invoice balances, collected revenue and dashboard collection metrics calculated net of successful refunds.
- Tenant-scoped tax and discount rule management APIs.
- Dashboard summary metrics: active subscriptions, MRR, ARR, collected amount, outstanding amount, overdue amount and upcoming renewals.
- BullMQ worker foundation for scheduled billing and renewal checks.
- PostgreSQL schema, Prisma migrations and automated API validation in GitHub Actions.

### Frontend functionality: what is and is not available

| Module | Current frontend capability |
|---|---|
| Authentication | Registration and login |
| Workspace | Workspace context and member listing |
| Customers | Create, list, search, edit and delete |
| Products | Create, list, edit and delete; variants, filters, sorting and pagination |
| Plans | Read-focused list view |
| Subscriptions | Read-focused list view |
| Quotations | Read-focused list view |
| Invoices | Read-focused list view |
| Payments | Read-focused list view |
| Reports | Dashboard metrics and upcoming renewal activity |
| Tax rules | Read-focused list view |
| Discount rules | Read-focused list view |

The current UI does **not** provide complete create/edit workflows for Plans, Subscriptions, Quotations, Invoices, Payments, Tax Rules or Discount Rules, even though several of those operations are available through the backend API.

There is no general file-import or bulk-upload workflow in the current UI. Product variants are managed through the product form; this is not an Excel/CSV import feature.

### Not implemented / not production-ready

- Customer self-service portal and secure customer-to-user account linking.
- Payment gateway integrations, verified gateway webhooks and automatic card/UPI collection.
- Invoice PDF generation, invoice email delivery and provider-backed notifications.
- Complete frontend create/edit workflows for all billing and pricing modules.
- Full staff/finance permission matrix and complete workspace settings UI.
- Advanced analytics, subscription intelligence and export workflows.
- Production deployment configuration, observability, backup/restore and operational hardening.
- End-to-end testing against a production-like PostgreSQL and Redis environment.
- Security review, load testing and formal financial/tax compliance validation.

**Important:** Payment records currently represent manual payment recording. The application does not currently process real payments through a payment gateway. Automatic subscription renewal updates subscription expiry according to plan settings; it does not charge a customer's payment method.

---

## 2. Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend | Node.js, Express 5, TypeScript |
| Database | PostgreSQL |
| ORM and migrations | Prisma 6 |
| Authentication | JWT, bcryptjs |
| Request validation | Zod |
| Background jobs | Redis, BullMQ, ioredis |
| API tests | Node test runner via `tsx` |
| CI | GitHub Actions |

The repository uses npm workspaces:

- `apps/web` — React frontend
- `apps/api` — Express API and Prisma schema

The backend is structured as a modular monolith. The frontend, API and background worker run as separate processes from the same repository.

---

## 3. High-level architecture

```text
                  ┌─────────────────────────┐
                  │       Web Browser       │
                  └────────────┬────────────┘
                               │
                               ▼
                  ┌─────────────────────────┐
                  │ React + TypeScript +    │
                  │ Vite frontend           │
                  └────────────┬────────────┘
                               │ REST / JSON
                               ▼
                  ┌─────────────────────────┐
                  │ Express 5 REST API      │
                  │ Authentication          │
                  │ Tenant authorization   │
                  │ Business modules        │
                  └──────┬───────────┬──────┘
                         │           │
                         ▼           ▼
              ┌────────────────┐  ┌─────────────────┐
              │ PostgreSQL     │  │ Redis + BullMQ  │
              │ Prisma ORM     │  │ queues/scheduler│
              └────────────────┘  └────────┬────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │ Background      │
                                  │ worker          │
                                  │ Billing/renewals│
                                  └─────────────────┘
```

PostgreSQL is the source of truth. Redis/BullMQ is used for scheduled and asynchronous background work. The API and frontend can be started independently; the worker is a separate process.

---

## 4. Repository structure

```text
.
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── migrations/          # Versioned database migrations
│   │   │   └── schema.prisma        # Data model
│   │   └── src/
│   │       ├── auth/                # Registration and login
│   │       ├── billing/             # Pricing, billing and settlement logic
│   │       ├── config/              # Environment configuration
│   │       ├── customers/           # Customer API
│   │       ├── dashboard/           # Revenue and renewal metrics
│   │       ├── db/                  # Prisma client
│   │       ├── invoices/            # Invoice API
│   │       ├── jobs/                # BullMQ queues and worker
│   │       ├── payments/            # Payments and refunds
│   │       ├── plans/               # Subscription plans and plan items
│   │       ├── pricing-rules/       # Tax and discount rule APIs
│   │       ├── products/            # Products and variants
│   │       ├── quotations/          # Quotation workflows
│   │       ├── subscriptions/       # Subscription lifecycle
│   │       ├── tenancy/             # Authentication context and tenant guards
│   │       ├── workspaces/          # Workspace membership and invitations
│   │       ├── app.ts               # Express app and route mounting
│   │       └── server.ts            # API server entry point
│   └── web/
│       └── src/
│           ├── products/            # Product management UI
│           ├── App.tsx              # Authentication, navigation and module views
│           ├── api.ts               # API request helper
│           └── styles.css
├── docs/
│   ├── SRS/                         # Software requirements
│   └── architecture/                # Architecture documentation
├── .github/workflows/               # CI workflows
├── docker-compose.yml               # Optional local PostgreSQL and Redis
├── package.json                     # npm workspace scripts
└── README.md
```

---

## 5. Main domain capabilities

### 5.1 Authentication and workspaces

- Registration creates a user, a business workspace and an initial ADMIN membership.
- Login verifies the password and returns a signed JWT.
- Passwords are stored as bcrypt hashes, not plain text.
- A user can belong to multiple business workspaces.
- Roles are assigned per workspace membership.
- Workspace APIs support member listing, invitations, invitation acceptance, role changes and member removal.
- Invitations expire after seven days. Since email delivery is not configured, the API returns the invitation token once for manual delivery.

Current roles represented in the application include ADMIN, STAFF, FINANCE and CUSTOMER. A complete customer-facing portal and full permission matrix are not yet available.

### 5.2 Customer management

The customer API supports tenant-scoped create, list, search, retrieve, update and delete operations. The UI supports creating, searching, editing and deleting customer records.

Customer records include name, email, phone, company name, address and notes. A customer cannot be deleted while referenced by subscriptions or invoices.

### 5.3 Product and variant management

The product API and frontend support:

- Product name, type, sales price, cost price and notes.
- Optional product variants with a name and price add-on.
- Create, list, retrieve, update and delete operations.
- Search across product name, type, notes and variant name.
- Product-type filtering.
- Sorting by creation date, name and sales price.
- Pagination.
- Validation for required fields, monetary values and duplicate variant names.
- Deletion protection when a product is referenced by plans, quotations, subscriptions or invoices.

### 5.4 Subscription plans

The API supports plan create, list, retrieve, update and delete operations, along with plan-item management.

Plan configuration includes:

- Billing period: weekly, monthly, quarterly or yearly.
- Price and minimum quantity.
- Availability start and end dates.
- Auto-renew and auto-close settings.
- Pause and early-close policy flags.
- Products and quantities associated with the plan.

The current frontend only displays plan records; plan creation and editing are not yet exposed through the UI.

### 5.5 Quotations

The quotation API supports creating and listing quotations, retrieving a quotation, updating permitted fields, lifecycle transitions and conversion into a subscription.

Quotation lines retain product, quantity, unit price and tax information. Pricing supports:

- Percentage discounts.
- Fixed discounts.
- Saved tenant-specific discount rules.
- Saved tenant-specific tax rules.
- Proportional discount allocation and tax calculation after discount.
- Validation that selected products belong to the selected plan and workspace.

A saved discount rule and an inline discount cannot be applied together to the same quotation request. Tax rates are snapshotted on quotation lines so later rule changes do not rewrite historical quotation calculations.

The current frontend provides a read-focused quotation list, not a complete quotation editor.

### 5.6 Subscriptions and renewals

The subscription API supports create, list, retrieve and lifecycle actions. Subscription records associate a customer, plan and subscription lines.

Plan policy is enforced by the API for pause and early-close actions. Renewal processing checks active subscriptions approaching or past expiry:

- Auto-renew plans advance the expiry date by the configured billing period.
- Auto-close plans are closed after expiry.
- Plans with neither setting are reported as requiring manual renewal.
- Conditional updates reduce the risk of concurrent lifecycle updates.

The renewal worker does not initiate payment collection. The current frontend provides a read-focused subscription list.

### 5.7 Invoices and recurring billing

The invoice API supports listing and retrieving invoices, confirming draft invoices, cancelling eligible unpaid invoices, manually triggering a billing run and recording invoice payments.

Recurring invoice generation uses subscription billing periods and a deterministic recurring key with a database uniqueness guard to prevent duplicate invoices for the same billing period.

Invoice settlement is derived from successful payment amounts less successful refunds. Invoice status and outstanding balances therefore account for refunds rather than treating the original payment amount as permanently collected.

Invoice PDF generation and email delivery are not implemented.

### 5.8 Payments and refunds

The current payment workflow records manual payments against invoices.

- Payment creation requires an `Idempotency-Key` header.
- Reusing a key for the same request returns the existing payment rather than creating a duplicate.
- Reusing a key for a different payment is rejected.
- Payment amounts cannot exceed the invoice's outstanding balance.
- Refunds are separate records linked to the original payment.
- Refund requests are checked against the remaining refundable amount.
- Successful refunds are included in net settlement calculations.

No payment gateway is currently connected. These APIs do not charge cards, UPI accounts or bank accounts.

### 5.9 Tax and discount rules

Tenant-scoped APIs support creating, listing, updating and deleting:

- Tax rules with a name, rate, active state and default-rule setting.
- Discount rules with a name, percentage or fixed value and active state.

The quotation API can apply saved tax and discount rules. The frontend currently exposes read-focused lists for these rules; rule editing forms are not yet available.

### 5.10 Dashboard and reports

The dashboard summary API currently returns:

- Active subscription count.
- Monthly recurring revenue (MRR).
- Annual recurring revenue (ARR), derived from MRR.
- Net collected amount.
- Outstanding receivables.
- Overdue receivables.
- Upcoming renewals within the next seven days (up to ten records).

Collected and outstanding figures account for successful refunds. The frontend presents these metrics and upcoming renewal activity. Advanced analytics, exports and subscription intelligence are not yet implemented.

---

## 6. API route groups

All API routes are versioned under `/api/v1`. Tenant-scoped endpoints require authentication and a verified business context.

| Route group | Current purpose |
|---|---|
| `GET /health` | API health check |
| `/api/v1/auth` | Register and log in |
| `/api/v1/workspaces` | List workspaces, members and manage invitations/memberships |
| `/api/v1/customers` | Customer CRUD and search |
| `/api/v1/products` | Product and variant CRUD, search, filters and pagination |
| `/api/v1/plans` | Plan and plan-item management |
| `/api/v1/quotations` | Quotation creation, retrieval, updates, transitions and conversion |
| `/api/v1/subscriptions` | Subscription creation, retrieval and lifecycle actions |
| `/api/v1/invoices` | Invoice retrieval, confirmation, cancellation, billing run and invoice payments |
| `/api/v1/payments` | Payment and refund workflows |
| `/api/v1/pricing-rules` | Tax and discount rule CRUD |
| `/api/v1/dashboard` | Revenue summary and upcoming renewals |

### Tenant-aware request headers

After registration or login, send the JWT and the selected business ID on tenant-scoped requests:

```http
Authorization: Bearer <JWT>
x-business-id: <business-id>
```

The API verifies that the authenticated user is a member of the selected business. A client-supplied business ID or role is never accepted as proof of authorization.

### Important API behaviour

- Registration requires `email`, `password` (at least 12 characters) and `businessName`.
- Authentication is rate-limited.
- List endpoints support pagination where implemented.
- Payment creation requires an `Idempotency-Key` header.
- Financial values and related records are validated server-side.
- Deletion may be rejected when a record is referenced by financial or subscription records.

---

## 7. Local development setup

### Prerequisites

- Node.js LTS
- npm
- PostgreSQL
- Git
- Redis for running the BullMQ background worker

Docker Compose is optional. PostgreSQL and Redis can be run as separately installed local services.

### 7.1 Clone and install

```powershell
git clone https://github.com/NaurasShaji/Odoo-X-Make-a-ton.git
cd Odoo-X-Make-a-ton
npm install
```

### 7.2 Create the PostgreSQL database

Create a PostgreSQL database named `nexbill` using pgAdmin or psql. If it already exists, do not create it again.

### 7.3 Configure API environment

Copy the example environment file:

**Windows PowerShell**
```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

**macOS/Linux**
```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:

```env
NODE_ENV=development
PORT=4000
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/nexbill"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="replace-with-a-random-secret-at-least-32-characters-long"
```

Replace the database username and password with your local PostgreSQL credentials. Use a unique random JWT secret of at least 32 characters. Keep the real `.env` file private; never commit credentials.

Redis is needed for the background worker. The frontend and API can be started separately from the worker, but scheduled billing and renewal processing will not run unless Redis and the worker are available.

### 7.4 Generate Prisma Client and apply migrations

Run from the repository root:

```powershell
npm --workspace @nexbill/api run prisma:generate
npm --workspace @nexbill/api run prisma:deploy
```

For schema development where a new migration is being created, use:

```powershell
npm --workspace @nexbill/api run prisma:migrate
```

Do not use database reset commands on a database containing data you need.

### 7.5 Start the API

In one terminal:

```powershell
npm run dev:api
```

The API listens on `http://localhost:4000`.

Check:

```text
http://localhost:4000/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "nexbill-api"
}
```

### 7.6 Start the frontend

In a second terminal:

```powershell
npm run dev:web
```

Vite normally serves the frontend at:

```text
http://localhost:5173
```

The frontend API base defaults to `http://localhost:4000`. If the API is running on a different address, configure `VITE_API_URL` as supported by the web app.

### 7.7 Start the background worker (optional for basic UI/API use)

Start Redis first, then run in another terminal:

```powershell
npm --workspace @nexbill/api run dev:worker
```

The worker schedules recurring billing checks hourly and renewal checks every six hours. It requires a working Redis connection and a migrated PostgreSQL database.

---

## 8. Available commands

### Root workspace commands

| Command | Purpose |
|---|---|
| `npm install` | Install workspace dependencies |
| `npm run dev:api` | Run API in watch mode |
| `npm run dev:web` | Run Vite frontend |
| `npm run build:api` | Compile API TypeScript |
| `npm run build:web` | Build frontend |
| `npm run typecheck:api` | Type-check API |

### API workspace commands

```powershell
npm --workspace @nexbill/api run dev
npm --workspace @nexbill/api run dev:worker
npm --workspace @nexbill/api run typecheck
npm --workspace @nexbill/api test
npm --workspace @nexbill/api run build
npm --workspace @nexbill/api run prisma:generate
npm --workspace @nexbill/api run prisma:validate
npm --workspace @nexbill/api run prisma:migrate
npm --workspace @nexbill/api run prisma:deploy
```

---

## 9. Database and data integrity

The Prisma schema and migrations define the current relational data model, including users, businesses, memberships, invitations, customers, products, variants, plans, plan items, quotations, subscriptions, invoices, invoice lines, payments, refunds, tax rules and discount rules.

Key integrity rules include:

1. Tenant-owned records are scoped to a business/workspace.
2. Membership roles are assigned per business, not globally.
3. Product, plan, customer and financial record relationships are checked against the active tenant.
4. Quotation and invoice line pricing/tax values preserve historical snapshots.
5. Recurring invoice creation uses a deterministic unique key to guard against duplicate billing periods.
6. Payment creation is idempotent.
7. Refunds are stored as separate records and do not overwrite original payment amounts.
8. Invoice settlement and dashboard collection metrics are calculated net of successful refunds.
9. Financial state changes use database transactions where required.

These safeguards are application foundations, not a substitute for a complete security audit and production hardening.

---

## 10. Testing and continuous integration

The API includes automated tests for areas such as:

- Tenant context and authorization helpers.
- Product validation.
- Quotation pricing and discount calculations.
- Subscription lifecycle transitions.
- Payment settlement and refund calculations.
- Core business workflows.

The GitHub Actions validation workflow checks Prisma schema/client generation, API typechecking, API tests, API build and frontend build.

Run the relevant checks locally before pushing:

```powershell
npm --workspace @nexbill/api run prisma:validate
npm --workspace @nexbill/api run typecheck
npm --workspace @nexbill/api test
npm run build:api
npm run build:web
```

A successful build or CI run does not by itself prove every end-to-end business workflow works against a real configured database.

---

## 11. Security notes

- Never commit `.env` files, passwords, JWT secrets or production credentials.
- Use HTTPS and secure deployment secrets in production.
- Keep tenant authorization on the server; do not trust tenant IDs or roles from request bodies.
- Keep payment gateway credentials outside source control.
- Verify gateway webhook signatures before accepting provider events when gateway integration is implemented.
- Configure database backups, retention, monitoring and restore tests before production use.
- Complete a security review and end-to-end authorization testing before handling real customer or financial data.

---

## 12. Documentation

- [Software Requirements Specification](docs/SRS/01-project-definition.md)
- [System Architecture](docs/architecture/README.md)

The SRS describes the intended product scope. It includes capabilities that are not all implemented yet. Use the **Project status** section of this README and the architecture implementation notes to distinguish current functionality from planned functionality.

---

## 13. Development roadmap

The following work remains to bring the current foundation closer to the intended product:

1. Complete create/edit/delete user journeys in the UI for plans, subscriptions, quotations, invoices, payments and pricing rules.
2. Add full workspace settings and role/permission management screens.
3. Add a secure customer portal with customer identity linking and customer-scoped authorization.
4. Integrate a payment provider, signed webhooks, retries and reconciliation.
5. Add invoice PDF generation, email delivery and notification providers.
6. Improve reporting with filters, exports, drill-downs and subscription analytics.
7. Add end-to-end tests for complete billing journeys against PostgreSQL and Redis.
8. Complete deployment, observability, backup/restore, security and performance hardening.

---

## 14. Contribution and repository workflow

Development is maintained on the `main` branch.

Before committing:

- Keep changes scoped and describe them accurately.
- Add or update tests for business logic and API changes.
- Run Prisma validation, API typecheck, tests and both builds.
- Update this README when implementation status or setup instructions change.
- Never commit local environment files, generated secrets or credentials.

---

**NexBill — Subscription and recurring revenue management.**
