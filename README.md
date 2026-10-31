# NexBill

**Subscription & Recurring Revenue Management Platform**

NexBill is a web-based platform being developed to help businesses manage customers, products, subscription plans, subscriptions, recurring invoices, payments and revenue operations from one workspace.

> One platform. Every subscription. Every transaction. Fully connected.

## Current project status

NexBill is under active development. The current implementation includes:

- Multi-tenant database foundation with business workspaces and per-business memberships.
- User registration and login using bcrypt password hashing and JWT authentication.
- Tenant-context and membership/role authorization middleware.
- Workspace listing, member listing, invitations, invitation acceptance, role updates and member removal.
- Customer management API and frontend interface (create, list/search, edit and delete).
- Initial React dashboard with login, registration and workspace selection.
- PostgreSQL/Prisma migrations and API health endpoint.

**Current focus:** validate the customer management workflow and continue with product, plan and subscription modules.

Product management, quotations, subscription workflows, invoice generation, payment processing, recurring billing and production deployment are not yet complete. Some API module routes are still placeholders.

## Technology stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend | Node.js, Express 5, TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Authentication | JWT, bcrypt |
| Validation | Zod |
| Background jobs | Redis, BullMQ (worker foundation) |
| Tests | Node test runner via `tsx` |
| CI | GitHub Actions |

## Repository structure

```text
.
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── migrations/       # Database migrations
│   │   │   └── schema.prisma     # Database schema
│   │   └── src/
│   │       ├── auth/             # Registration and login
│   │       ├── customers/        # Tenant-scoped customer API
│   │       ├── tenancy/          # Authentication and tenant context
│   │       ├── workspaces/       # Workspace and membership APIs
│   │       ├── db/               # Prisma client
│   │       └── app.ts            # Express application and routes
│   └── web/
│       └── src/                  # React application and styles
├── docs/
│   ├── SRS/                      # Software requirements
│   └── architecture/             # Architecture and implementation notes
├── .github/workflows/            # CI workflows
├── docker-compose.yml            # Optional local PostgreSQL and Redis
└── package.json                  # npm workspace scripts
```

## Prerequisites

- Node.js (use a current LTS release)
- npm
- PostgreSQL
- Git

Redis is used by the background-job foundation. The current authentication, workspace and customer API workflows can be developed without starting Redis; worker functionality will require it.

## Local development setup

### 1. Clone the repository and install dependencies

```bash
git clone https://github.com/NaurasShaji/Odoo-X-Make-a-ton.git
cd Odoo-X-Make-a-ton
npm install
```

### 2. Create a PostgreSQL database

Create a database named `nexbill` in your local PostgreSQL installation (or use the optional Docker Compose services).

### 3. Configure the API environment

Copy the API environment template:

**Windows PowerShell**
```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

**macOS/Linux**
```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env` and set `DATABASE_URL` to match your PostgreSQL username, password, host and database. Set `JWT_SECRET` to a unique random secret of at least 32 characters. Do not commit the real `.env` file or share its secrets.

Example connection string:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/nexbill"
JWT_SECRET="replace-with-a-unique-secret-of-at-least-32-characters"
```

### 4. Generate Prisma Client and apply migrations

Run these commands from the repository root:

```bash
npm --workspace @nexbill/api run prisma:generate
npm --workspace @nexbill/api run prisma:deploy
```

For local schema development, use `npm --workspace @nexbill/api run prisma:migrate` instead of `prisma:deploy` when creating a new migration.

### 5. Start the API

```bash
npm run dev:api
```

The API listens at `http://localhost:4000`. Health check:

```text
GET http://localhost:4000/health
```

### 6. Start the frontend

Open a second terminal at the repository root:

```bash
npm run dev:web
```

Vite normally serves the frontend at `http://localhost:5173`. The frontend defaults to the API at `http://localhost:4000`. To override it, set `VITE_API_URL` in the web app environment.

## Available root scripts

| Command | Purpose |
|---|---|
| `npm run dev:api` | Start the API in development mode |
| `npm run dev:web` | Start the frontend in development mode |
| `npm run build:api` | Compile the API |
| `npm run build:web` | Type-check and build the frontend |
| `npm run typecheck:api` | Type-check the API |

API workspace commands:

```bash
npm --workspace @nexbill/api run typecheck
npm --workspace @nexbill/api test
npm --workspace @nexbill/api run prisma:validate
```

## Authentication and tenant-aware requests

After registration or login, the API returns a JWT. Authenticated tenant-scoped requests must send both:

```http
Authorization: Bearer <JWT>
x-business-id: <business-id>
```

The API verifies that the authenticated user has a membership in the selected business. Never trust a business ID or role supplied only in a request body; tenant access is verified server-side.

Registration currently accepts `businessName`, `email` and `password`.

## Current API endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | API health check |
| `POST /api/v1/auth/register` | Register user and create a business workspace |
| `POST /api/v1/auth/login` | Authenticate user |
| `GET /api/v1/workspaces` | List user's workspaces |
| `GET /api/v1/workspaces/members` | List members in selected workspace |
| `POST /api/v1/workspaces/invitations` | Create a workspace invitation (ADMIN) |
| `POST /api/v1/workspaces/invitations/accept` | Accept an invitation |
| `PATCH /api/v1/workspaces/members/:userId/role` | Change a member role (ADMIN) |
| `DELETE /api/v1/workspaces/members/:userId` | Remove a member (ADMIN) |
| `GET /api/v1/customers` | List/search customers |
| `POST /api/v1/customers` | Create a customer |
| `GET /api/v1/customers/:customerId` | Get a customer |
| `PATCH /api/v1/customers/:customerId` | Update a customer |
| `DELETE /api/v1/customers/:customerId` | Delete a customer |

Workspace and customer endpoints require authentication and a valid selected business context. Customer deletion returns a conflict when the customer is still referenced by invoices or subscriptions.

## Documentation

- [Software Requirements Specification](docs/SRS/01-project-definition.md)
- [System Architecture](docs/architecture/README.md)

## Development status and contribution notes

Development is currently taking place on the `architecture/multi-tenant-hardening` branch in [PR #2](https://github.com/NaurasShaji/Odoo-X-Make-a-ton/pull/2).

Before submitting changes, run the relevant API typecheck/tests and frontend build. Keep secrets, local environment files and database credentials out of commits. Do not reset a development database unless you intentionally want to delete its data.
