# NexBill

**Subscription & Recurring Revenue Management Platform**

NexBill is a web-based platform for managing the subscription lifecycle, recurring billing, invoices, payments, renewals and revenue analytics.

> One platform. Every subscription. Every transaction. Fully connected.

## Project Documentation

- [SRS – Part 1: Project Definition and Scope](docs/SRS/01-project-definition.md)
- [Initial System Architecture](docs/architecture/README.md)

## Project Status

The initial application architecture has been scaffolded on the `main` branch. The repository now contains the React frontend, Express API shell, Prisma domain foundation, PostgreSQL/Redis local infrastructure and BullMQ worker foundation.

## Technology Stack

- **Frontend:** React + TypeScript + Vite
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Background jobs:** Redis + BullMQ

## Repository Structure

```text
apps/
├── api/       # Express API, Prisma schema and background jobs
└── web/       # React frontend

docs/
├── SRS/       # Requirements
└── architecture/  # Architecture baseline

docker-compose.yml
.env.example
```

## Local Development

1. Copy `.env.example` to `.env`.
2. Start infrastructure:

```bash
docker compose up -d
```

3. Install dependencies:

```bash
npm install
```

4. Generate the Prisma client:

```bash
npm --workspace @nexbill/api run prisma:generate
```

5. Start the API:

```bash
npm run dev:api
```

6. Start the web app in another terminal:

```bash
npm run dev:web
```

The API exposes `GET /health` as the initial health check. Business modules are intentionally scaffolded as the next implementation step.
