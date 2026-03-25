# Abacus — Architecture & Agent Build Registry

> **wford26/abacus** | MVP Build Guide for Coding Agents

**Application:** Abacus — lightweight accounting and expense tracking for small business  
**Target platform:** Microsoft Azure (production) | Local dev with Azure-hosted database  
**Repo:** `github.com/wford26/abacus`

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Service Descriptions & Boundaries](#2-service-descriptions--boundaries)
3. [Database Strategy](#3-database-strategy)
4. [Tech Stack Reference](#4-tech-stack-reference)
5. [Monorepo Structure](#5-monorepo-structure)
6. [Event Contract Catalog](#6-event-contract-catalog)
7. [API Contract Summary](#7-api-contract-summary)
8. [Dependency Graph](#8-dependency-graph)
9. [Azure Infrastructure & Deployment](#9-azure-infrastructure--deployment)
   - [Stage 1 — Local Dev + Azure DB](#stage-1--local-dev--azure-db)
   - [Stage 2 — Full Azure MVP](#stage-2--full-azure-mvp)
   - [Stage 3 — Production Hardening](#stage-3--production-hardening)
   - [Cost Estimates](#cost-estimates)
   - [Azure Resource Naming](#azure-resource-naming)
   - [Infrastructure as Code](#infrastructure-as-code)
10. [Task Registry — Agent Build Instructions](#10-task-registry--agent-build-instructions)
    - [Task Checklist](#task-checklist)
    - [Tier 0 — Foundation (No Dependencies)](#tier-0--foundation-no-dependencies)
    - [Tier 1 — Core Infrastructure](#tier-1--core-infrastructure)
    - [Tier 2 — Identity & Gateway](#tier-2--identity--gateway)
    - [Tier 3 — Ledger & Transactions](#tier-3--ledger--transactions)
    - [Tier 4 — Expenses & Documents](#tier-4--expenses--documents)
    - [Tier 5 — Reporting](#tier-5--reporting)
    - [Tier 6 — Invoicing](#tier-6--invoicing)
11. [MVP Milestone Summary](#11-mvp-milestone-summary)
12. [Security Baseline](#12-security-baseline)
13. [Deployment Targets](#13-deployment-targets)

---

## 1. System Architecture Overview

### Core Principles

- **Monorepo first** — all services in `wford26/abacus`, separated into independent apps
- **Org-scoped everything** — every API call and database query is scoped to an `organizationId`
- **Services own their schemas** — single PostgreSQL cluster, logically separated by Postgres schema per service
- **Synchronous REST** for gateway-to-service communication in MVP
- **Async events** via Redis Streams for state changes (reporting, recurring detection, audit logs)
- **Ship the vertical slice first**: sign in → create org → import CSV → categorize → upload receipt → view report

### Service Map

```
Browser / Mobile
       │
       ▼
┌─────────────────────────┐
│   API Gateway / BFF      │  @wford26/accounting-api-gateway
│   (auth, routing,        │  Port: 3000
│    aggregation)          │
└──────────┬──────────────┘
           │  REST (internal)
    ┌──────┴───────────────────────────────────────┐
    │              Internal Services               │
    │                                              │
    │  ┌───────────────┐  ┌───────────────────┐   │
    │  │ Identity Svc  │  │   Ledger Svc       │   │
    │  │ Port: 3001    │  │   Port: 3002       │   │
    │  └───────────────┘  └───────────────────┘   │
    │                                              │
    │  ┌───────────────┐  ┌───────────────────┐   │
    │  │ Expenses Svc  │  │  Documents Svc     │   │
    │  │ Port: 3003    │  │  Port: 3004        │   │
    │  └───────────────┘  └───────────────────┘   │
    │                                              │
    │  ┌───────────────┐  ┌───────────────────┐   │
    │  │ Reporting Svc │  │  Invoicing Svc     │   │
    │  │ Port: 3005    │  │  Port: 3006        │   │
    │  └───────────────┘  └───────────────────┘   │
    └──────────────────────────────────────────────┘
           │
    ┌──────▼──────────────────────────────┐
    │   Infrastructure Layer              │
    │   PostgreSQL  │  Redis  │  S3/R2    │
    └─────────────────────────────────────┘
```

### MVP Deployment Decision

For V1, deploy only these services — fold Expenses and Invoicing logic into Ledger until demand justifies extraction:

| Priority | Service           | Deploy      |
| -------- | ----------------- | ----------- |
| Required | api-gateway       | ✅          |
| Required | identity-service  | ✅          |
| Required | ledger-service    | ✅          |
| Required | documents-service | ✅          |
| Required | reporting-service | ✅          |
| Defer    | expenses-service  | ⏳ Phase 4+ |
| Defer    | invoicing-service | ⏳ Phase 6  |

---

## 2. Service Descriptions & Boundaries

### 2.1 API Gateway (`@wford26/accounting-api-gateway`)

**Owns:** Nothing in the database. Pure routing, aggregation, and auth enforcement.

**Responsibilities:**

- Validate JWT tokens on all inbound requests
- Route requests to appropriate internal services
- Aggregate multi-service payloads for dashboard views
- Rate limiting and request logging
- Shape API responses for the web client

**Does NOT own:** User records, transactions, files, or any business data.

---

### 2.2 Identity Service (`@wford26/accounting-identity-service`)

**Owns:** `identity.*` schema in PostgreSQL

**Entities:** `User`, `Organization`, `Membership`, `Role`, `Session`

**Responsibilities:**

- User registration and login (email/password + magic link)
- JWT issuance and refresh
- Organization CRUD and membership management
- Role enforcement: `owner`, `admin`, `accountant`, `viewer`

**Key rule:** Every other service trusts the `organizationId` and `userId` claims in the JWT. They do NOT call back to identity service per-request.

---

### 2.3 Ledger Service (`@wford26/accounting-ledger-service`)

**Owns:** `ledger.*` schema in PostgreSQL

**Entities:** `Account`, `Transaction`, `TransactionLine`, `Category`, `ReconciliationSession`, `ImportBatch`

**Responsibilities:**

- Chart of accounts CRUD
- Transaction creation (manual + CSV import)
- Category assignment and management
- Transaction review states (`unreviewed`, `reviewed`, `flagged`)
- Reconciliation sessions and matching
- CSV import pipeline with duplicate detection

**Key rule:** Ledger is the source of truth for all financial records. Expenses and Reporting services read from ledger events or snapshots — they do not write to ledger schema directly.

---

### 2.4 Expenses Service (`@wford26/accounting-expenses-service`)

**Owns:** `expenses.*` schema in PostgreSQL

**Entities:** `ExpenseView`, `Merchant`, `ReceiptLink`, `ReviewRule`, `SplitRecord`

**Responsibilities:**

- Expense-focused views over ledger transactions
- Merchant normalization and deduplication
- Split transaction logic
- Expense categorization rules engine
- Receipt-to-transaction linking
- Review queue management

**Key rule:** Expenses service subscribes to `transaction.created` and `transaction.updated` events from Ledger. It maintains its own denormalized view for fast expense queries. It never modifies the ledger schema.

---

### 2.5 Documents Service (`@wford26/accounting-documents-service`)

**Owns:** `documents.*` schema in PostgreSQL + S3/R2 bucket

**Entities:** `Document`, `DocumentVersion`, `UploadJob`, `TransactionLink`

**Responsibilities:**

- Signed URL generation for secure uploads
- File metadata storage (type, size, checksum, upload status)
- OCR pipeline hooks (Phase 2+)
- Document-to-transaction associations
- Retention policy enforcement

**Key rule:** Actual files are stored in S3/R2. The database only stores metadata and S3 keys. Always return signed URLs — never public URLs.

---

### 2.6 Reporting Service (`@wford26/accounting-reporting-service`)

**Owns:** `reporting.*` schema in PostgreSQL (read-optimized snapshots)

**Entities:** `ReportSnapshot`, `MetricAggregate`, `ExportJob`

**Responsibilities:**

- Profit & Loss summaries by month/quarter
- Expense by category breakdowns
- Vendor/merchant spend analysis
- Cash flow summaries
- CSV/Excel export jobs
- Dashboard rollup aggregates

**Key rule:** Reporting service subscribes to ledger events and maintains pre-aggregated snapshots. It should NEVER do expensive real-time joins against the ledger. Stale-by-design is acceptable (up to 5-minute lag for MVP).

---

### 2.7 Invoicing Service (`@wford26/accounting-invoicing-service`)

**Owns:** `invoicing.*` schema in PostgreSQL

**Entities:** `Customer`, `Invoice`, `InvoiceLine`, `PaymentRecord`

**Responsibilities:**

- Customer CRUD
- Invoice creation and management
- Invoice PDF generation
- Payment status tracking (manual mark-as-paid for MVP)
- Emit `invoice.paid` event → Ledger creates income transaction

**Key rule:** When an invoice is marked paid, invoicing service emits an event. It does NOT write to the ledger directly. Ledger service consumes the event and creates the corresponding income transaction.

---

## 3. Database Strategy

### Cluster Layout

Single PostgreSQL cluster with per-service schemas. Migrate to separate clusters per service when load justifies it.

```sql
-- Each service gets its own schema
CREATE SCHEMA identity;
CREATE SCHEMA ledger;
CREATE SCHEMA expenses;
CREATE SCHEMA documents;
CREATE SCHEMA reporting;
CREATE SCHEMA invoicing;
```

### Per-Service Schema Designs

#### identity schema

```sql
identity.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

identity.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  business_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

identity.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES identity.users(id),
  organization_id UUID REFERENCES identity.organizations(id),
  role TEXT NOT NULL CHECK (role IN ('owner','admin','accountant','viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, organization_id)
)
```

#### ledger schema

```sql
ledger.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash','credit','expense','income','liability','equity')),
  code TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

ledger.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES ledger.categories(id),
  color TEXT,
  is_active BOOLEAN DEFAULT TRUE
)

ledger.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  account_id UUID REFERENCES ledger.accounts(id),
  date DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  description TEXT,
  merchant_raw TEXT,
  category_id UUID REFERENCES ledger.categories(id),
  review_status TEXT DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed','reviewed','flagged')),
  import_batch_id UUID,
  is_split BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)

ledger.transaction_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES ledger.transactions(id),
  organization_id UUID NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  category_id UUID REFERENCES ledger.categories(id),
  description TEXT
)

ledger.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  filename TEXT,
  row_count INTEGER,
  imported_count INTEGER,
  duplicate_count INTEGER,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
)

ledger.reconciliation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  account_id UUID REFERENCES ledger.accounts(id),
  statement_date DATE,
  statement_balance NUMERIC(15,2),
  status TEXT DEFAULT 'in_progress',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

#### documents schema

```sql
documents.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  uploaded_by UUID NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT,
  s3_key TEXT NOT NULL,
  s3_bucket TEXT NOT NULL,
  checksum TEXT,
  ocr_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
)

documents.transaction_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents.documents(id),
  transaction_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  linked_by UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

#### reporting schema

```sql
reporting.metric_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  metric_key TEXT NOT NULL,
  period TEXT NOT NULL,
  value NUMERIC(15,2),
  metadata JSONB,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, metric_key, period)
)

reporting.report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  report_type TEXT NOT NULL,
  period TEXT NOT NULL,
  data JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
)
```

#### invoicing schema

```sql
invoicing.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

invoicing.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  customer_id UUID REFERENCES invoicing.customers(id),
  invoice_number TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','void')),
  issue_date DATE,
  due_date DATE,
  subtotal NUMERIC(15,2),
  tax NUMERIC(15,2) DEFAULT 0,
  total NUMERIC(15,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

invoicing.invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoicing.invoices(id),
  description TEXT NOT NULL,
  quantity NUMERIC(10,2) DEFAULT 1,
  unit_price NUMERIC(15,2) NOT NULL,
  amount NUMERIC(15,2) NOT NULL
)
```

---

## 4. Tech Stack Reference

### Frontend

| Concern      | Choice                  |
| ------------ | ----------------------- |
| Framework    | Next.js 14 (App Router) |
| Language     | TypeScript              |
| Styling      | Tailwind CSS            |
| Components   | shadcn/ui               |
| Forms        | React Hook Form + Zod   |
| Server state | TanStack Query v5       |
| Tables       | TanStack Table          |
| Charts       | Recharts                |
| File upload  | react-dropzone          |

### Backend (all services)

| Concern    | Choice                                             |
| ---------- | -------------------------------------------------- |
| Runtime    | Node.js 20 LTS                                     |
| Framework  | Fastify (preferred for speed)                      |
| Language   | TypeScript                                         |
| ORM        | Prisma                                             |
| Database   | PostgreSQL 16                                      |
| Cache/Jobs | Redis 7                                            |
| Job Queue  | BullMQ                                             |
| Messaging  | Redis Streams (MVP), migrate to RabbitMQ if needed |
| Auth       | JWT (HS256), refresh token rotation                |
| Validation | Zod                                                |
| Testing    | Vitest + Supertest                                 |

### Infrastructure

| Concern         | Choice                                |
| --------------- | ------------------------------------- |
| Containers      | Docker + Docker Compose (dev)         |
| Registry        | GitHub Container Registry (ghcr.io)   |
| Frontend deploy | Vercel                                |
| Services deploy | Fly.io or Railway                     |
| Database        | Neon or Supabase (managed PostgreSQL) |
| Object storage  | Cloudflare R2 or AWS S3               |
| Secrets         | Doppler or environment-based          |
| Observability   | OpenTelemetry + Sentry                |

### Monorepo Tooling

| Concern            | Choice                              |
| ------------------ | ----------------------------------- |
| Workspace manager  | pnpm workspaces                     |
| Build orchestrator | Turborepo                           |
| Linting            | ESLint + shared config              |
| Formatting         | Prettier                            |
| Git hooks          | Husky + lint-staged                 |
| Commit format      | Conventional Commits                |
| Changesets         | Changesets (for package versioning) |

---

## 5. Monorepo Structure

```
wford26/accounting-platform/
├── apps/
│   ├── web/                          # Next.js frontend
│   ├── api-gateway/                  # BFF/routing layer
│   ├── identity-service/
│   ├── ledger-service/
│   ├── expenses-service/             # Phase 4
│   ├── documents-service/
│   ├── reporting-service/
│   └── invoicing-service/            # Phase 6
│
├── packages/
│   ├── shared-types/                 # @wford26/shared-types
│   │   └── src/
│   │       ├── identity.ts
│   │       ├── ledger.ts
│   │       ├── expenses.ts
│   │       ├── documents.ts
│   │       ├── reporting.ts
│   │       └── invoicing.ts
│   ├── event-contracts/              # @wford26/event-contracts
│   │   └── src/
│   │       └── events.ts
│   ├── auth-sdk/                     # @wford26/auth-sdk
│   │   └── src/
│   │       └── index.ts              # JWT verify, middleware factory
│   ├── ui/                           # @wford26/ui (shadcn + custom)
│   │   └── src/
│   │       ├── components/
│   │       └── index.ts
│   ├── design-tokens/                # @wford26/design-tokens
│   │   └── src/
│   │       └── tokens.ts
│   ├── config-eslint/                # Shared ESLint config
│   └── config-typescript/            # Shared tsconfig bases
│
└── infrastructure/
    ├── docker/
    │   ├── docker-compose.yml        # Full local stack
    │   └── docker-compose.dev.yml    # Dev overrides
    ├── github-actions/
    │   ├── ci.yml
    │   ├── publish-packages.yml
    │   ├── deploy-web.yml
    │   └── deploy-services.yml
    └── terraform/                    # Phase 2+
```

### Service Internal Structure (each service follows this pattern)

```
apps/{service-name}/
├── src/
│   ├── main.ts                   # Fastify app entry
│   ├── plugins/
│   │   ├── auth.ts               # JWT validation plugin
│   │   ├── database.ts           # Prisma client plugin
│   │   └── redis.ts              # Redis client plugin
│   ├── routes/
│   │   └── v1/
│   │       └── {domain}.routes.ts
│   ├── handlers/
│   │   └── {domain}.handlers.ts
│   ├── services/
│   │   └── {domain}.service.ts   # Business logic
│   ├── repositories/
│   │   └── {domain}.repo.ts      # DB access layer
│   ├── events/
│   │   ├── publisher.ts
│   │   └── subscribers/
│   ├── schemas/
│   │   └── {domain}.schema.ts    # Zod validation
│   └── types/
│       └── index.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── test/
│   ├── unit/
│   └── integration/
├── Dockerfile
├── package.json
└── tsconfig.json
```

---

## 6. Event Contract Catalog

All events are published to Redis Streams. Stream key format: `abacus:{event-name}`

```typescript
// @wford26/event-contracts

export interface BaseEvent {
  eventId: string; // UUID
  eventType: string;
  organizationId: string;
  userId: string;
  occurredAt: string; // ISO 8601
  version: "1.0";
}

// Ledger Events
export interface TransactionCreatedEvent extends BaseEvent {
  eventType: "transaction.created";
  payload: {
    transactionId: string;
    accountId: string;
    amount: number;
    date: string;
    description: string;
    merchantRaw: string | null;
    categoryId: string | null;
  };
}

export interface TransactionUpdatedEvent extends BaseEvent {
  eventType: "transaction.updated";
  payload: {
    transactionId: string;
    changes: Partial<{
      categoryId: string;
      reviewStatus: string;
      description: string;
    }>;
  };
}

export interface ExpenseCategorizedEvent extends BaseEvent {
  eventType: "expense.categorized";
  payload: { transactionId: string; categoryId: string; ruleApplied: boolean };
}

export interface AccountReconciledEvent extends BaseEvent {
  eventType: "account.reconciled";
  payload: { reconciliationSessionId: string; accountId: string; period: string };
}

// Document Events
export interface ReceiptUploadedEvent extends BaseEvent {
  eventType: "receipt.uploaded";
  payload: { documentId: string; s3Key: string; linkedTransactionId: string | null };
}

// Invoicing Events
export interface InvoiceCreatedEvent extends BaseEvent {
  eventType: "invoice.created";
  payload: { invoiceId: string; customerId: string; total: number };
}

export interface InvoicePaidEvent extends BaseEvent {
  eventType: "invoice.paid";
  payload: { invoiceId: string; customerId: string; amount: number; paidAt: string };
}
```

**Subscriber mapping:**

| Event                 | Published By      | Consumed By                                 |
| --------------------- | ----------------- | ------------------------------------------- |
| `transaction.created` | ledger-service    | expenses-service, reporting-service         |
| `transaction.updated` | ledger-service    | expenses-service, reporting-service         |
| `expense.categorized` | expenses-service  | reporting-service                           |
| `receipt.uploaded`    | documents-service | expenses-service                            |
| `account.reconciled`  | ledger-service    | reporting-service                           |
| `invoice.created`     | invoicing-service | reporting-service                           |
| `invoice.paid`        | invoicing-service | ledger-service (creates income transaction) |

---

## 7. API Contract Summary

All endpoints are prefixed with `/api/v1` through the gateway. All endpoints require `Authorization: Bearer <token>` and are scoped to the org in the JWT.

### Identity Service

```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /me
PATCH  /me

POST   /organizations
GET    /organizations/:orgId
PATCH  /organizations/:orgId
GET    /organizations/:orgId/members
POST   /organizations/:orgId/members/invite
DELETE /organizations/:orgId/members/:userId
PATCH  /organizations/:orgId/members/:userId/role
```

### Ledger Service

```
GET    /accounts
POST   /accounts
PATCH  /accounts/:id
DELETE /accounts/:id

GET    /categories
POST   /categories
PATCH  /categories/:id

GET    /transactions?page&limit&status&accountId&categoryId&dateFrom&dateTo
POST   /transactions
PATCH  /transactions/:id
GET    /transactions/:id
POST   /transactions/:id/review
POST   /transactions/:id/split

POST   /transactions/import/csv
GET    /import-batches
GET    /import-batches/:id

GET    /reconciliation-sessions
POST   /reconciliation-sessions
PATCH  /reconciliation-sessions/:id
POST   /reconciliation-sessions/:id/complete
```

### Documents Service

```
POST   /documents/upload-url        # Get signed upload URL
POST   /documents                   # Register doc after upload
GET    /documents
GET    /documents/:id
DELETE /documents/:id
POST   /documents/:id/link-transaction
DELETE /documents/:id/link-transaction/:transactionId
```

### Reporting Service

```
GET    /reports/dashboard           # Aggregated summary cards
GET    /reports/pnl?period=2026-03
GET    /reports/expenses-by-category?period=2026-03
GET    /reports/vendor-spend?period=2026-03&limit=20
GET    /reports/cash-flow?from=2026-01-01&to=2026-03-31
POST   /reports/export/csv          # Trigger export job
GET    /reports/export/:jobId       # Poll or get download URL
```

### Invoicing Service

```
GET    /customers
POST   /customers
PATCH  /customers/:id
DELETE /customers/:id

GET    /invoices
POST   /invoices
GET    /invoices/:id
PATCH  /invoices/:id
DELETE /invoices/:id
POST   /invoices/:id/send
POST   /invoices/:id/mark-paid
GET    /invoices/:id/pdf
```

---

## 8. Dependency Graph

Below is the dependency order. A task should not begin until all listed dependencies are complete.

```
TIER 0 (parallel — no deps)
  T-001  Monorepo scaffold
  T-002  Shared TypeScript configs
  T-003  ESLint + Prettier configs
  T-004  Docker Compose dev stack
  T-005  GitHub Actions CI pipeline
  T-006  Design tokens + shadcn setup

TIER 1 (requires: T-001, T-002, T-003)
  T-010  @wford26/shared-types package
  T-011  @wford26/event-contracts package
  T-012  @wford26/auth-sdk package
  T-013  Database schema + Prisma setup (all services)

TIER 2 (requires: T-010, T-012, T-013)
  T-020  Identity Service — core (users, orgs, memberships)
  T-021  Identity Service — auth (JWT, login, register, refresh)
  T-030  API Gateway — scaffold + auth middleware
  T-040  Web app — scaffold (Next.js, layout, providers)

TIER 3 (requires: T-020, T-021, T-030, T-040)
  T-022  Identity Service — org membership + roles
  T-031  API Gateway — identity service routing
  T-041  Web — auth pages (sign in, sign up, org setup)
  T-042  Web — shell layout (nav, sidebar, org context)

TIER 4 (requires: T-022, T-031, T-041, T-042)
  T-050  Ledger Service — accounts CRUD
  T-051  Ledger Service — categories CRUD
  T-052  Ledger Service — manual transaction entry
  T-053  Ledger Service — CSV import pipeline
  T-054  Ledger Service — transaction review states
  T-055  API Gateway — ledger service routing
  T-060  Web — accounts management page
  T-061  Web — categories management page
  T-062  Web — transactions table + filters

TIER 5 (requires: T-050–T-055, T-060–T-062)
  T-070  Ledger Service — reconciliation
  T-071  Ledger Service — transaction split
  T-072  Ledger Service — duplicate detection in import
  T-080  Documents Service — upload pipeline (signed URLs + S3)
  T-081  Documents Service — file metadata storage
  T-082  Documents Service — transaction linking
  T-090  Web — dashboard summary cards
  T-091  Web — CSV import UI + review
  T-092  Web — receipt upload UI (mobile-friendly)

TIER 6 (requires: T-080–T-082, T-090–T-092)
  T-100  Reporting Service — event subscribers setup
  T-101  Reporting Service — P&L report
  T-102  Reporting Service — expense by category report
  T-103  Reporting Service — vendor spend report
  T-104  Reporting Service — dashboard aggregates API
  T-105  Reporting Service — CSV export job
  T-110  Web — reports dashboard
  T-111  Web — expense review queue UI
  T-112  API Gateway — reporting service routing

TIER 7 (requires: T-100–T-112)
  T-120  Expenses Service — expense views + merchant normalization
  T-121  Expenses Service — review queue service
  T-122  Expenses Service — categorization rules engine
  T-130  Invoicing Service — customers CRUD
  T-131  Invoicing Service — invoices + line items
  T-132  Invoicing Service — invoice PDF generation
  T-133  Invoicing Service — mark-paid + ledger event
  T-140  Web — invoicing pages (customers, invoices)
  T-141  API Gateway — invoicing service routing
```

---

## 9. Azure Infrastructure & Deployment

Abacus targets Microsoft Azure as its production platform. The build progresses through three stages: local development with a shared Azure database, full Azure MVP deployment using low-cost consumption-based services, and production hardening with scaling and redundancy.

---

### Stage 1 — Local Dev + Azure DB

**Goal:** Developers run all services locally via Docker Compose. Only the database and blob storage live in Azure from day one. This gives everyone a shared, consistent dataset and avoids "works on my machine" schema drift.

```
Your Machine                        Azure (shared across devs)
──────────────────────────          ────────────────────────────────────
 Next.js  :3000                      Azure Database for PostgreSQL
 API Gateway :3100                     Flexible Server (Burstable B1ms)
 Identity :3001          ──────▶      abacus-dev.postgres.database.azure.com
 Ledger   :3002
 Documents :3004          ──────▶    Azure Blob Storage
 Reporting :3005                       abacusdevstorage / abacus-documents
 Redis     :6379 (local Docker)
 MinIO     :9000 (local Docker, mirrors Blob API)
```

**Azure resources to provision at Stage 1 (one-time):**

| Resource                                        | Tier                               | Estimated monthly cost |
| ----------------------------------------------- | ---------------------------------- | ---------------------- |
| Azure Database for PostgreSQL — Flexible Server | Burstable B1ms (1 vCore, 2 GB RAM) | ~$13–15                |
| Azure Blob Storage                              | LRS, hot tier                      | ~$1–3 (dev volumes)    |
| **Stage 1 total**                               |                                    | **~$15–18/month**      |

**Dev `.env` configuration for Azure DB:**

```env
DATABASE_URL=postgresql://{admin}:{password}@abacus-dev.postgres.database.azure.com:5432/abacus?sslmode=require

# Local infrastructure (Docker)
REDIS_URL=redis://localhost:6379
STORAGE_ENDPOINT=http://localhost:9000   # MinIO locally, swap for Azure in Stage 2
STORAGE_ACCOUNT_NAME=devlocal
STORAGE_CONTAINER=abacus-documents
```

**PostgreSQL connection hardening (required for Azure Flexible Server):**

- Enable `require_secure_transport = ON` on the server
- Use a strong admin password (generate at least 24 chars)
- Add developer IP addresses to the firewall allowlist via Azure Portal or CLI
- Create a `abacus_app` role with restricted permissions (not the admin user) for service connections:
  ```sql
  CREATE ROLE abacus_app WITH LOGIN PASSWORD '...';
  GRANT USAGE ON SCHEMA identity, ledger, documents, reporting, invoicing TO abacus_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity TO abacus_app;
  -- repeat for each schema
  ```

---

### Stage 2 — Full Azure MVP

**Goal:** All services containerized and running in Azure Container Apps. This is the first version accessible from anywhere, suitable for a beta or client demo.

#### Architecture

```
Internet
    │
    ▼
Azure Static Web Apps          (Next.js frontend — free tier)
    │
    ▼
Azure Container Apps Environment — "abacus-aca-env"
    ├── abacus-api-gateway        (min 0, max 2 replicas)
    ├── abacus-identity-service   (min 0, max 2 replicas)
    ├── abacus-ledger-service     (min 0, max 2 replicas)
    ├── abacus-documents-service  (min 0, max 2 replicas)
    └── abacus-reporting-service  (min 0, max 2 replicas)
          │
          ├── Azure Database for PostgreSQL Flexible Server
          │     (Burstable B2s — 2 vCores, 4 GB RAM)
          │
          ├── Azure Cache for Redis
          │     (Basic C0 — 250 MB)
          │
          └── Azure Blob Storage
                (LRS — documents, exports, invoice PDFs)
```

#### Why Azure Container Apps

Azure Container Apps (ACA) is the right fit for Abacus at MVP scale because:

- **Scale-to-zero** — idle services cost nothing when nobody is using the app
- **No Kubernetes to manage** — ACA abstracts the orchestration layer
- **Per-second billing** — you only pay for actual CPU/memory consumption
- **Built-in ingress** — no separate load balancer to configure
- **Dapr optional** — can adopt later for service-to-service calls without rewriting

Container Apps vs alternatives at this scale:

| Option                   | Notes                                               | MVP fit             |
| ------------------------ | --------------------------------------------------- | ------------------- |
| Azure Container Apps     | Scale-to-zero, consumption pricing, simple          | ✅ Best choice      |
| Azure App Service        | Always-on, simpler but no scale-to-zero             | ⚠️ Higher cost      |
| Azure Kubernetes Service | Full control, significant ops overhead              | ❌ Overkill for MVP |
| Azure Functions          | Great for single functions, not services with state | ❌ Wrong model      |

#### Stage 2 Azure Resources

| Resource                                        | SKU / Tier        | Notes                               | Est. monthly cost  |
| ----------------------------------------------- | ----------------- | ----------------------------------- | ------------------ |
| Azure Container Apps (consumption)              | Serverless        | 5 services, low traffic             | ~$5–20             |
| Azure Container Registry                        | Basic             | Store Docker images                 | ~$5                |
| Azure Database for PostgreSQL — Flexible Server | Burstable B2s     | Shared cluster, per-service schemas | ~$35–40            |
| Azure Cache for Redis                           | Basic C0 (250 MB) | Sessions, streams, cache            | ~$16               |
| Azure Blob Storage                              | LRS hot           | Receipts, PDFs, exports             | ~$2–5              |
| Azure Static Web Apps                           | Free tier         | Next.js frontend                    | $0                 |
| Azure Key Vault                                 | Standard          | Secrets management                  | ~$2–3              |
| Azure Monitor + Log Analytics                   | Pay-per-GB        | Logs + metrics                      | ~$3–8              |
| **Stage 2 total**                               |                   | Low-traffic MVP                     | **~$70–100/month** |

> **Cost optimization tip:** Container Apps scale to zero replicas when idle. At low traffic (nights, weekends), the compute portion can approach $0. The PostgreSQL and Redis instances are the fixed floor cost.

---

### Stage 3 — Production Hardening

**Goal:** Add redundancy, observability, and security controls before serving real customer financial data at scale.

#### Additional resources at Stage 3

| Resource                   | Addition                                          | Purpose                                |
| -------------------------- | ------------------------------------------------- | -------------------------------------- |
| PostgreSQL Flexible Server | Upgrade to General Purpose D2s (2 vCores, 8 GB)   | Handles concurrent users               |
| PostgreSQL                 | Enable high availability (zone-redundant standby) | Automatic failover                     |
| Redis Cache                | Upgrade to Standard C1 (1 GB, replicated)         | HA + more headroom                     |
| Container Apps             | Set min replicas = 1 for gateway + ledger         | Eliminate cold start for core paths    |
| Azure Front Door           | Standard tier                                     | Global CDN + WAF for the frontend      |
| Azure Application Gateway  | WAF v2 (optional)                                 | Layer 7 WAF in front of Container Apps |
| Azure Backup               | Automated PostgreSQL backups                      | Point-in-time recovery                 |
| Defender for Cloud         | Free tier                                         | Security posture alerts                |

**Estimated Stage 3 cost:** ~$200–350/month depending on traffic and HA choices.

---

### Cost Estimates

| Stage          | What's running                              | Monthly estimate |
| -------------- | ------------------------------------------- | ---------------- |
| Stage 1 — Dev  | Azure DB + Blob only, everything else local | ~$15–18          |
| Stage 2 — MVP  | Full Azure, scale-to-zero, low traffic      | ~$70–100         |
| Stage 3 — Prod | HA PostgreSQL, Redis Standard, WAF          | ~$200–350        |

---

### Azure Resource Naming

All resources follow the convention: `abacus-{environment}-{resource-type}`

| Resource           | Dev                  | Staging                  | Production            |
| ------------------ | -------------------- | ------------------------ | --------------------- |
| Resource Group     | `rg-abacus-dev`      | `rg-abacus-staging`      | `rg-abacus-prod`      |
| Container Apps Env | `abacus-dev-aca-env` | `abacus-staging-aca-env` | `abacus-prod-aca-env` |
| PostgreSQL         | `abacus-dev-pg`      | `abacus-staging-pg`      | `abacus-prod-pg`      |
| Redis              | `abacus-dev-redis`   | `abacus-staging-redis`   | `abacus-prod-redis`   |
| Container Registry | `abacusdevcr`        | `abacusstagingcr`        | `abacusprodcr`        |
| Blob Storage       | `abacusdevstorage`   | `abacusstgstorage`       | `abacusprodstorage`   |
| Key Vault          | `abacus-dev-kv`      | `abacus-staging-kv`      | `abacus-prod-kv`      |
| Static Web App     | `abacus-dev-web`     | `abacus-staging-web`     | `abacus-prod-web`     |
| Log Analytics      | `abacus-dev-logs`    | `abacus-staging-logs`    | `abacus-prod-logs`    |

> Note: Storage account names must be globally unique and lowercase alphanumeric only (no hyphens). The names above follow that pattern.

---

### Infrastructure as Code

All Azure resources are managed via Bicep. Terraform is an alternative but Bicep is preferred given the Azure-only footprint and native ARM integration.

**File layout:**

```
infrastructure/
├── bicep/
│   ├── main.bicep                    # Root module — deploys all resources
│   ├── modules/
│   │   ├── container-apps.bicep      # ACA environment + all services
│   │   ├── postgresql.bicep          # Flexible Server + firewall rules
│   │   ├── redis.bicep               # Azure Cache for Redis
│   │   ├── storage.bicep             # Blob Storage + containers
│   │   ├── keyvault.bicep            # Key Vault + access policies
│   │   ├── registry.bicep            # Azure Container Registry
│   │   ├── staticweb.bicep           # Static Web App
│   │   └── monitoring.bicep          # Log Analytics + App Insights
│   └── parameters/
│       ├── dev.bicepparam
│       ├── staging.bicepparam
│       └── prod.bicepparam
├── docker/
│   ├── docker-compose.yml            # Full local stack (all services)
│   └── docker-compose.stage1.yml     # Local services only (uses Azure DB)
└── scripts/
    ├── bootstrap-azure.sh            # One-time resource group + registry setup
    ├── deploy.sh                     # Deploy to a given environment
    └── seed-db.sh                    # Run migrations + seed data against target DB
```

**Bootstrap commands (Stage 1 setup, run once):**

```bash
# Login and set subscription
az login
az account set --subscription "<your-subscription-id>"

# Create resource group
az group create --name rg-abacus-dev --location eastus2

# Create PostgreSQL Flexible Server
az postgres flexible-server create \
  --name abacus-dev-pg \
  --resource-group rg-abacus-dev \
  --location eastus2 \
  --admin-user abacusadmin \
  --admin-password "<strong-password>" \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16 \
  --public-access 0.0.0.0   # Tighten to dev IPs after creation

# Create database
az postgres flexible-server db create \
  --server-name abacus-dev-pg \
  --resource-group rg-abacus-dev \
  --database-name abacus

# Create blob storage
az storage account create \
  --name abacusdevstorage \
  --resource-group rg-abacus-dev \
  --location eastus2 \
  --sku Standard_LRS

az storage container create \
  --name abacus-documents \
  --account-name abacusdevstorage
```

**Container image build + push (per service, CI/CD handles this automatically):**

```bash
# Build and push a service image
SERVICE=ledger-service
TAG=$(date +%Y.%m.%d).${GITHUB_SHA::7}

az acr build \
  --registry abacusdevcr \
  --image abacus/${SERVICE}:${TAG} \
  --file apps/${SERVICE}/Dockerfile \
  .
```

**GitHub Actions — Stage 2 deploy workflow additions:**

```yaml
# .github/workflows/deploy-services.yml
- name: Deploy to Azure Container Apps
  uses: azure/container-apps-deploy-action@v1
  with:
    containerAppName: abacus-${{ env.SERVICE_NAME }}
    resourceGroup: rg-abacus-${{ env.ENVIRONMENT }}
    imageToDeploy: ${{ env.ACR_LOGIN_SERVER }}/abacus/${{ env.SERVICE_NAME }}:${{ env.IMAGE_TAG }}
```

---

## 10. Task Registry — Agent Build Instructions

> **Instructions for coding agents:** Each task below is self-contained. Read the full task spec before writing any code. Respect the acceptance criteria exactly. Emit no files outside the paths listed in the task. Ask for clarification if the task references a type or schema not yet defined in shared-types.

### Task Checklist

Use this checklist to track implementation progress across the architecture plan. Mark a task complete only after its acceptance criteria and tests are done.

#### Foundation

- [ ] T-001 — Monorepo Scaffold
- [ ] T-002 — Shared TypeScript Configs
- [ ] T-003 — ESLint + Prettier Configs
- [ ] T-004 — Docker Compose Dev Stack
- [ ] T-005 — GitHub Actions CI Pipeline
- [ ] T-006 — Design Tokens + UI Package

#### Core Infrastructure

- [ ] T-010 — Shared Types Package
- [ ] T-011 — Event Contracts Package
- [ ] T-012 — Auth SDK Package
- [ ] T-013 — Database Schema + Prisma Setup

#### Identity & Gateway

- [ ] T-020 — Identity Service — Core (Users, Orgs, Memberships)
- [ ] T-021 — Identity Service — Auth (JWT, Login, Register, Refresh)
- [ ] T-022 — Identity Service — Org Membership + Roles
- [ ] T-030 — API Gateway — Scaffold + Auth Middleware
- [ ] T-031 — API Gateway — Identity Service Routing
- [ ] T-040 — Web App Scaffold
- [ ] T-041 — Web — Auth Pages (Sign In, Sign Up, Org Setup)
- [x] T-042 — Web — Shell Layout (Nav, Sidebar, Org Context)

#### Ledger & Transactions

- [x] T-050 — Ledger Service — Accounts CRUD
- [ ] T-051 — Ledger Service — Categories CRUD
- [ ] T-052 — Ledger Service — Manual Transaction Entry
- [ ] T-053 — Ledger Service — CSV Import Pipeline
- [ ] T-054 — Ledger Service — Transaction Review States
- [ ] T-060 — Web — Accounts Management Page
- [ ] T-061 — Web — Categories Management Page
- [ ] T-062 — Web — Transactions Table

#### Expenses & Documents

- [ ] T-080 — Documents Service — Upload Pipeline
- [ ] T-081 — Documents Service — Transaction Linking
- [ ] T-082 — Web — Receipt Upload UI
- [ ] T-090 — Web — Dashboard Summary Cards
- [ ] T-091 — Web — CSV Import UI

#### Reporting

- [ ] T-100 — Reporting Service — Event Subscriber Setup
- [ ] T-101 — Reporting Service — P&L Report
- [ ] T-102 — Reporting Service — Expense by Category
- [ ] T-103 — Reporting Service — Vendor Spend Report
- [ ] T-104 — Reporting Service — Dashboard Aggregates API
- [ ] T-105 — Reporting Service — CSV Export
- [ ] T-110 — Web — Reports Dashboard Page

#### Invoicing

- [ ] T-130 — Invoicing Service — Customers + Invoices
- [ ] T-131 — Invoicing Service — PDF Generation
- [ ] T-140 — Web — Invoicing Pages

> Note: `T-031` appears in the dependency graph but does not yet have detailed task specs in this registry. Keep it on the checklist so it is not lost during planning.

---

### Tier 0 — Foundation (No Dependencies)

---

#### T-001 — Monorepo Scaffold

**Priority:** MUST-HAVE  
**Tier:** 0  
**Dependencies:** none  
**Estimated complexity:** Medium

**Objective:** Initialize the `wford26/abacus` monorepo with Turborepo and pnpm workspaces. Create all placeholder `apps/` and `packages/` directories with stub `package.json` files. Do not implement any application logic in this task.

**Deliverables:**

1. Root `package.json` with:
   - `name: "abacus"`
   - `private: true`
   - pnpm workspace configuration
   - Scripts: `dev`, `build`, `test`, `lint`, `typecheck`

2. `pnpm-workspace.yaml`:

   ```yaml
   packages:
     - "apps/*"
     - "packages/*"
   ```

3. `turbo.json` with pipeline:
   - `build` depends on `^build`
   - `test` depends on `^build`
   - `lint` runs independently
   - `typecheck` depends on `^build`

4. Stub `package.json` in each of the following (no source files yet):
   - `apps/web`
   - `apps/api-gateway`
   - `apps/identity-service`
   - `apps/ledger-service`
   - `apps/expenses-service`
   - `apps/documents-service`
   - `apps/reporting-service`
   - `apps/invoicing-service`
   - `packages/shared-types`
   - `packages/event-contracts`
   - `packages/auth-sdk`
   - `packages/ui`
   - `packages/design-tokens`
   - `packages/config-eslint`
   - `packages/config-typescript`

5. Root `.gitignore`, `.npmrc` if needed for workspace-specific package-manager settings, and `README.md`

**Acceptance criteria:**

- `pnpm install` completes without error from repo root
- `turbo run build` runs and reports "no tasks found" (not an error, since source is empty)
- All directories exist with valid stub `package.json`

---

#### T-002 — Shared TypeScript Configs

**Priority:** MUST-HAVE  
**Tier:** 0  
**Dependencies:** T-001  
**Estimated complexity:** Small

**Objective:** Create the `packages/config-typescript` package with base tsconfig files for apps and packages.

**Deliverables:**

1. `packages/config-typescript/package.json`:

   ```json
   {
     "name": "@wford26/config-typescript",
     "version": "0.1.0",
     "private": true,
     "exports": {
       "./base": "./tsconfig.base.json",
       "./nextjs": "./tsconfig.nextjs.json",
       "./node": "./tsconfig.node.json"
     }
   }
   ```

2. `tsconfig.base.json` — strict TypeScript defaults
3. `tsconfig.node.json` — extends base, targets Node 20, module commonjs
4. `tsconfig.nextjs.json` — extends base, includes Next.js types

Each service `tsconfig.json` should extend `@wford26/config-typescript/node`. The web app should extend `@wford26/config-typescript/nextjs`.

**Acceptance criteria:**

- Each tsconfig extends the appropriate base
- `"strict": true` is set in base
- No `any` escape hatches in base configs

---

#### T-003 — ESLint + Prettier Configs

**Priority:** MUST-HAVE  
**Tier:** 0  
**Dependencies:** T-001  
**Estimated complexity:** Small

**Objective:** Create `packages/config-eslint` with shared ESLint and Prettier configurations.

**Deliverables:**

1. `packages/config-eslint/index.js` — shared ESLint config with:
   - `@typescript-eslint/recommended`
   - `import/order` rule (enforce import grouping)
   - No `console.log` in production code (warn)
   - No unused variables (error)

2. `packages/config-eslint/next.js` — extends base, adds Next.js plugin
3. Root `.prettierrc.json` — standard formatting rules
4. Root `.eslintignore` and `.prettierignore`
5. Add `husky` + `lint-staged` to root `package.json` — run lint and format on commit

**Acceptance criteria:**

- `pnpm lint` from root runs without unconfigured error
- Prettier formats `.ts`/`.tsx`/`.json` files consistently

---

#### T-004 — Docker Compose Dev Stack

**Priority:** MUST-HAVE  
**Tier:** 0  
**Dependencies:** none  
**Estimated complexity:** Small

**Objective:** Create a `docker-compose.yml` that stands up all infrastructure dependencies for local development.

**File path:** `infrastructure/docker/docker-compose.yml`

**Services to include:**

1. **postgres** — PostgreSQL 16
   - Port: `5432:5432`
   - Env: `POSTGRES_DB=accounting`, `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`
   - Volume for persistence
   - Health check via `pg_isready`

2. **redis** — Redis 7
   - Port: `6379:6379`
   - Volume for persistence

3. **minio** — S3-compatible object storage for local dev
   - Port: `9000:9000` (API), `9001:9001` (console)
   - Default credentials: `minioadmin/minioadmin`
   - Env: `MINIO_DEFAULT_BUCKETS=accounting-documents`

4. **mailhog** — SMTP trap for local email testing
   - Port: `1025:1025` (SMTP), `8025:8025` (web UI)

**Acceptance criteria:**

- `docker compose up` from repo root starts all 4 services
- All health checks pass within 30 seconds
- Volumes are named (not anonymous)

---

#### T-005 — GitHub Actions CI Pipeline

**Priority:** MUST-HAVE  
**Tier:** 0  
**Dependencies:** T-001, T-002, T-003  
**Estimated complexity:** Medium

**Objective:** Create GitHub Actions workflows for CI and package publishing.

**Deliverables:**

1. `.github/workflows/ci.yml`:
   - Triggers: push to `main`, all pull requests
   - Steps: `pnpm install`, `turbo run lint typecheck build test`
   - Matrix: Node 20
   - Cache: pnpm store

2. `.github/workflows/publish-packages.yml`:
   - Triggers: push to `main`
   - Uses Changesets action to publish `packages/*` to GitHub Packages (npm registry with `@wford26` scope)
   - Requires `NPM_TOKEN` secret

3. `.github/workflows/deploy-web.yml`:
   - Triggers: push to `main` (after CI passes)
   - Deploy `apps/web` to Vercel via Vercel CLI
   - Requires `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` secrets

4. `.github/workflows/deploy-services.yml`:
   - Triggers: push to `main`
   - Build Docker image for changed services (using Turborepo affected)
   - Push to `ghcr.io/wford26/{service-name}:{sha}`
   - Requires `GHCR_TOKEN` secret

**Acceptance criteria:**

- CI workflow runs on pull request creation
- Lint/typecheck/build failures block merge
- Package publish only runs if changesets are present

---

#### T-006 — Design Tokens + UI Package

**Priority:** MUST-HAVE  
**Tier:** 0  
**Dependencies:** T-001  
**Estimated complexity:** Medium

**Objective:** Create the `packages/ui` and `packages/design-tokens` packages. Set up shadcn/ui components and a custom token system that the web app and any future surfaces consume.

**Deliverables:**

1. `packages/design-tokens/src/tokens.ts`:

   ```typescript
   export const colors = {
     primary: { 50: '...', 500: '#2563EB', 900: '...' },
     neutral: { ... },
     success: '#16a34a',
     warning: '#d97706',
     error: '#dc2626',
   };
   export const spacing = { ... };
   export const typography = { ... };
   ```

2. `packages/ui/`:
   - Initialize shadcn/ui with the following components: `Button`, `Input`, `Label`, `Badge`, `Card`, `Table`, `Dialog`, `Dropdown`, `Select`, `Tabs`, `Toast`, `Skeleton`, `Avatar`
   - Export all from `packages/ui/src/index.ts`
   - Include Tailwind preset that imports design tokens

3. Each component should be re-exported from the shared package so the web app imports `from '@wford26/ui'` not from shadcn directly.

**Acceptance criteria:**

- `import { Button } from '@wford26/ui'` resolves correctly in `apps/web`
- All exported components render without TypeScript errors
- Tailwind config in web app extends `@wford26/design-tokens`

---

### Tier 1 — Core Infrastructure

---

#### T-010 — Shared Types Package

**Priority:** MUST-HAVE  
**Tier:** 1  
**Dependencies:** T-001, T-002  
**Estimated complexity:** Medium

**Objective:** Build the `@wford26/shared-types` package. This is the single source of truth for all TypeScript interfaces used across services and the frontend. No runtime code — types only.

**File:** `packages/shared-types/src/`

**Required type files:**

1. `identity.ts` — `User`, `Organization`, `Membership`, `Role`, `AuthTokens`, `JWTPayload`
2. `ledger.ts` — `Account`, `AccountType`, `Transaction`, `TransactionLine`, `Category`, `ReviewStatus`, `ImportBatch`, `ReconciliationSession`
3. `documents.ts` — `Document`, `DocumentStatus`, `TransactionLink`, `UploadUrlRequest`, `UploadUrlResponse`
4. `reporting.ts` — `PnLReport`, `ExpenseByCategoryReport`, `VendorSpendReport`, `DashboardSummary`, `MetricAggregate`
5. `invoicing.ts` — `Customer`, `Invoice`, `InvoiceLine`, `InvoiceStatus`, `PaymentRecord`
6. `api.ts` — `PaginatedResponse<T>`, `ApiError`, `ApiResponse<T>`, `PaginationParams`
7. `index.ts` — re-exports all of the above

**Rules:**

- All IDs are `string` (UUID)
- All timestamps are `string` (ISO 8601)
- All money amounts are `number` (decimal — UI formats, do not store as integer cents in types)
- Use discriminated unions for status fields

**Acceptance criteria:**

- Zero runtime code — `types only`
- All types exported from `index.ts`
- Zero TypeScript errors with `strict: true`

---

#### T-011 — Event Contracts Package

**Priority:** MUST-HAVE  
**Tier:** 1  
**Dependencies:** T-010  
**Estimated complexity:** Small

**Objective:** Build the `@wford26/event-contracts` package with typed event payloads for all Redis Stream events.

**Content:** Implement all event interfaces defined in Section 6 of this document exactly.

**Additionally include:**

```typescript
export function createEvent<T extends BaseEvent>(
  type: T["eventType"],
  organizationId: string,
  userId: string,
  payload: T["payload"]
): T;
```

**Acceptance criteria:**

- All 8 event types exported
- `createEvent` helper function exported
- Zero TypeScript errors

---

#### T-012 — Auth SDK Package

**Priority:** MUST-HAVE  
**Tier:** 1  
**Dependencies:** T-010  
**Estimated complexity:** Medium

**Objective:** Build the `@wford26/auth-sdk` package. This package provides JWT signing/verification utilities and a Fastify plugin that services use to protect routes.

**Exports:**

1. `signToken(payload: JWTPayload, secret: string, expiresIn: string): string`
2. `verifyToken(token: string, secret: string): JWTPayload`
3. `fastifyAuthPlugin` — a Fastify plugin that:
   - Reads `Authorization: Bearer <token>` header
   - Verifies the JWT using `JWT_SECRET` env var
   - Attaches `request.user: JWTPayload` to the request
   - Returns `401` if missing or invalid
   - Returns `403` if org in JWT doesn't match the org in the route params

4. `requireRole(roles: Role[])` — a Fastify `preHandler` hook factory that checks `request.user.role`

**Acceptance criteria:**

- Plugin works with Fastify 4+
- `401` returned for missing/expired token
- `403` returned for valid token but insufficient role
- JWT uses HS256 algorithm only
- Token payload includes: `userId`, `organizationId`, `email`, `role`

---

#### T-013 — Database Schema + Prisma Setup

**Priority:** MUST-HAVE  
**Tier:** 1  
**Dependencies:** T-001, T-002  
**Estimated complexity:** Medium

**Objective:** Set up Prisma in each service with the correct schema for that service's Postgres schema namespace. Create a base migration that initializes all schemas.

**Deliverables (repeat for each service below):**

For each of: `identity-service`, `ledger-service`, `documents-service`, `reporting-service`, `invoicing-service`:

1. `prisma/schema.prisma` with:

   ```prisma
   generator client {
     provider = "prisma-client-js"
   }
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

   Plus all models for that service's schema (see Section 3 of this document for exact column definitions)

2. Initial migration file: `prisma/migrations/0001_init/migration.sql`

3. `src/plugins/database.ts` — Fastify plugin that connects Prisma client and attaches it to the Fastify instance as `fastify.db`

**DATABASE_URL format for each service:**

```
postgresql://postgres:postgres@localhost:5432/accounting?schema={service_schema}
```

**Acceptance criteria:**

- `prisma generate` runs without error for each service
- `prisma migrate dev` creates tables in correct schema namespace
- Prisma client accessible as `fastify.db` in route handlers

---

### Tier 2 — Identity & Gateway

---

#### T-020 — Identity Service — Core (Users, Orgs, Memberships)

**Priority:** MUST-HAVE  
**Tier:** 2  
**Dependencies:** T-012, T-013  
**Estimated complexity:** Medium

**Objective:** Implement the non-auth CRUD for users, organizations, and memberships in the identity service.

**Implement these routes** (no auth required on POST /auth routes; all others require auth):

```
GET    /me                           # Get current user from JWT
PATCH  /me                           # Update name, avatar

POST   /organizations                # Create org (auto-assigns owner role)
GET    /organizations/:orgId         # Get org details
PATCH  /organizations/:orgId         # Update org (owner only)

GET    /organizations/:orgId/members
POST   /organizations/:orgId/members/invite    # Create pending invite
DELETE /organizations/:orgId/members/:userId
PATCH  /organizations/:orgId/members/:userId/role
```

**Business rules:**

- An organization must have at least one `owner` at all times
- `slug` is auto-generated from org `name`, must be unique
- Invite creates a `Membership` record with `status: 'pending'` — email sending is out of scope for now

**Acceptance criteria:**

- All routes return correct HTTP status codes
- Owner cannot remove themselves if they are the only owner
- All routes are org-scoped and validated
- Integration tests for each route using Supertest + test database

---

#### T-021 — Identity Service — Auth (JWT, Login, Register, Refresh)

**Priority:** MUST-HAVE  
**Tier:** 2  
**Dependencies:** T-012, T-013, T-020  
**Estimated complexity:** Medium

**Objective:** Implement authentication endpoints for the identity service.

**Implement these routes:**

```
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
```

**Implementation details:**

- `register`: create user, hash password with `bcrypt` (12 rounds), auto-create a personal org, return access + refresh tokens
- `login`: verify password, issue tokens
- `refresh`: verify refresh token from httpOnly cookie, issue new access token
- `logout`: invalidate refresh token in Redis

**Token strategy:**

- Access token: JWT, 15 minute expiry, signed with `JWT_SECRET`
- Refresh token: opaque UUID stored in Redis with 7-day TTL, also set as `httpOnly` cookie
- Access token payload: `{ userId, organizationId, email, role }`

**Security requirements:**

- bcrypt for password hashing
- Refresh tokens stored in Redis with `rt:{userId}:{tokenId}` key pattern
- Rate limit login endpoint: 5 attempts per IP per 15 minutes (use `@fastify/rate-limit`)
- Never return password hash in any response

**Acceptance criteria:**

- Register → Login → Refresh → Logout flow works end-to-end
- Expired access token returns 401
- Used refresh token cannot be reused (rotation)
- Integration tests for all flows

---

#### T-022 — Identity Service — Org Membership + Roles

**Priority:** MUST-HAVE  
**Tier:** 3  
**Dependencies:** T-020, T-021  
**Estimated complexity:** Medium

**Objective:** Complete the multi-organization membership lifecycle so users can accept invites, switch their active organization, and receive JWT claims with the correct `organizationId` and `role` for downstream services.

**Implement or extend these routes:**

```
GET  /organizations                        # List current user's organizations with membership status + role
POST /organizations/:orgId/accept-invite  # Accept pending invite for authenticated user
POST /organizations/:orgId/decline-invite # Decline pending invite for authenticated user

POST /auth/switch-organization            # Issue new access + refresh tokens for selected org
```

**Extend these existing membership routes with role-aware authorization:**

```
GET    /organizations/:orgId/members
POST   /organizations/:orgId/members/invite
DELETE /organizations/:orgId/members/:userId
PATCH  /organizations/:orgId/members/:userId/role
```

**Business rules:**

- A user may belong to multiple organizations, but each access token represents exactly one active organization context
- Pending invites can only be accepted or declined by an authenticated user whose email matches the invited membership
- `POST /auth/switch-organization` may only issue tokens for an `active` membership; pending or revoked memberships must return `403`
- Role matrix for org membership management:
  - `owner`: full org control, including promoting or demoting other owners
  - `admin`: may invite or remove non-owner members and change roles except `owner`
  - `accountant` and `viewer`: no membership-management permissions
- An organization must have at least one `owner` at all times
- JWT claims are always derived from the stored membership record, never trusted from request input

**Acceptance criteria:**

- `GET /organizations` returns all memberships for the current user, including `organization`, `role`, and `status`
- Accepting an invite changes membership status from `pending` to `active`
- Declining an invite prevents that membership from being used for org switching
- Switching organizations rotates the refresh token and returns a new access token with the selected `organizationId` and `role`
- `admin` cannot promote a user to `owner` or remove the last remaining `owner`
- Integration tests cover multi-org users, invite acceptance or decline, org switching, and unauthorized role changes

---

#### T-030 — API Gateway — Scaffold + Auth Middleware

**Priority:** MUST-HAVE  
**Tier:** 2  
**Dependencies:** T-012  
**Estimated complexity:** Medium

**Objective:** Create the API Gateway service with Fastify, register the auth plugin from `@wford26/auth-sdk`, and set up the proxy infrastructure for routing to internal services.

**Deliverables:**

1. Fastify app with:
   - `@fastify/cors` — allow frontend origin
   - `@fastify/helmet` — security headers
   - `@fastify/rate-limit` — global rate limiting (100 req/min default)
   - `@wford26/auth-sdk` — auth plugin registered globally (skip on `/api/v1/auth/*` routes)
   - `pino` — structured logging

2. Proxy setup using `@fastify/http-proxy` or manual `undici` fetch:
   - Define service URL map via environment variables:
     ```
     IDENTITY_SERVICE_URL=http://identity-service:3001
     LEDGER_SERVICE_URL=http://ledger-service:3002
     DOCUMENTS_SERVICE_URL=http://documents-service:3004
     REPORTING_SERVICE_URL=http://reporting-service:3005
     INVOICING_SERVICE_URL=http://invoicing-service:3006
     ```

3. Health check endpoint: `GET /health` → `{ status: 'ok', services: { ... } }`

4. Error handler that normalizes all error responses to:
   ```json
   { "error": { "code": "ERROR_CODE", "message": "...", "statusCode": 400 } }
   ```

**Acceptance criteria:**

- `GET /health` returns 200
- Unauthenticated request to protected route returns `{ error: { code: 'UNAUTHORIZED', ... } }`
- CORS allows configured frontend origin only
- Structured logs include `requestId`, `method`, `path`, `statusCode`, `duration`

---

#### T-040 — Web App Scaffold

**Priority:** MUST-HAVE  
**Tier:** 2  
**Dependencies:** T-006, T-010  
**Estimated complexity:** Medium

**Objective:** Initialize the Next.js 14 web application with App Router, TanStack Query, auth context, and the base layout shell. No pages yet — just the infrastructure.

**Deliverables:**

1. `apps/web/` Next.js 14 app with:
   - TypeScript + Tailwind configured with `@wford26/design-tokens`
   - shadcn/ui initialized (components come from `@wford26/ui`)
   - `@tanstack/react-query` provider at root layout
   - `next-themes` for dark mode support

2. `src/lib/api-client.ts` — typed fetch wrapper:
   - Automatically attaches `Authorization: Bearer {token}` from `localStorage`
   - Auto-refreshes token on 401 (calls `/auth/refresh` once, retries, then redirects to login)
   - Returns typed responses using `@wford26/shared-types`

3. `src/contexts/auth-context.tsx` — React context for:
   - `user: User | null`
   - `organization: Organization | null`
   - `login(email, password)`
   - `logout()`
   - `isLoading: boolean`

4. Route groups:
   - `(auth)/` — unauthenticated pages (login, register)
   - `(app)/` — authenticated pages (everything else), with auth guard

5. Base `(app)/layout.tsx` with:
   - Sidebar navigation (collapsed on mobile)
   - Top header with org switcher and user menu
   - Main content area

**Navigation items (link targets are placeholders for now):**

- Dashboard (`/`)
- Transactions (`/transactions`)
- Expenses (`/expenses`)
- Receipts (`/receipts`)
- Invoices (`/invoices`)
- Reports (`/reports`)
- Settings (`/settings`)

**Acceptance criteria:**

- App starts with `pnpm dev`
- Unauthenticated users are redirected to `/login`
- `api-client.ts` handles 401 refresh correctly
- Sidebar collapses on mobile

---

#### T-041 — Web — Auth Pages (Sign In, Sign Up, Org Setup)

**Priority:** MUST-HAVE  
**Tier:** 3  
**Dependencies:** T-021, T-022, T-030, T-040  
**Estimated complexity:** Medium

**Objective:** Build the user-facing authentication and onboarding pages in the web app so new and returning users can sign in, create an account, and complete their first organization setup before entering the main shell.

**Implement these routes in `apps/web/app/(auth)/`:**

```
GET /login    # Sign in
GET /register # Sign up
GET /setup    # First-run organization setup / onboarding
```

**Page requirements:**

1. `login/page.tsx`
   - Email and password form
   - Clear loading and validation states
   - On success, store the returned auth session and redirect into the app
   - Respect `next` query params when present

2. `register/page.tsx`
   - Name, email, and password form
   - On success, bootstrap the new user session and route them into org setup or the app shell
   - Present registration errors inline without losing form state

3. `setup/page.tsx`
   - First-run workspace setup UI for creating the initial organization
   - Support the base company/workspace details already modeled by identity, including organization name and optional business type
   - Present a simple path for users who arrive here after registration, invite acceptance, or an org switch failure

**Integration requirements:**

- Use the existing auth context and `api-client.ts` from `T-040`
- Keep unauthenticated pages inside the `(auth)` route group
- Send authenticated users away from `/login` and `/register` if a valid session already exists
- Use the identity service responses directly, without duplicating session-shaping logic in the page layer

**Acceptance criteria:**

- Sign in succeeds and lands on the app shell
- Sign up creates a usable session and lands on organization setup or the app shell as appropriate
- The org setup page creates the first usable organization context for a new user
- Auth errors are rendered inline and do not reset the form
- Mobile layouts remain usable on small screens

---

#### T-042 — Web — Shell Layout (Nav, Sidebar, Org Context)

**Priority:** MUST-HAVE  
**Tier:** 3  
**Dependencies:** T-021, T-022, T-031, T-040  
**Estimated complexity:** Medium

**Objective:** Build the authenticated application shell that keeps the user's active organization, navigation, and account controls visible across all signed-in pages.

**Implement the authenticated shell in:**

1. `src/components/app-shell.tsx` or equivalent shell component with:
   - Responsive sidebar navigation for desktop and mobile
   - Active-route highlighting for the dashboard, transactions, expenses, receipts, invoices, reports, and settings sections
   - Top header with current organization context
   - User menu with settings and sign-out actions
   - Theme toggle and mobile drawer behavior that closes on navigation

2. `app/(app)/layout.tsx` with:
   - `AuthGuard` protection around all authenticated routes
   - `AppShell` wrapper around route content
   - A content area that remains usable on small screens and large desktops

3. Org context wiring that:
   - Reads the selected organization from the auth/session state
   - Handles loading and empty-org states gracefully
   - Supports organization switching once `T-022` lands, without requiring page reloads

**Acceptance criteria:**

- Authenticated pages render inside a shared shell with consistent navigation and header chrome
- Sidebar opens and closes cleanly on mobile, with no layout shift on desktop
- The current organization is shown in the header and updates when the selected org changes
- Signing out clears session state and returns the user to `/login`
- Shell behavior works across all authenticated routes without hardcoded page-specific state

---

### Tier 3 — Ledger & Transactions

---

#### T-050 — Ledger Service — Accounts CRUD

**Priority:** MUST-HAVE  
**Tier:** 4  
**Dependencies:** T-013, T-021, T-030  
**Estimated complexity:** Medium

**Objective:** Implement account management in the Ledger Service.

**Routes:**

```
GET    /accounts              # List all active accounts for org
POST   /accounts              # Create account
PATCH  /accounts/:id          # Update name, code
DELETE /accounts/:id          # Soft-delete (set is_active = false)
GET    /accounts/:id/balance  # Compute current balance from transactions
```

**Seed data logic:** On first org setup, create default accounts:

- Checking Account (cash)
- Credit Card (credit)
- General Expenses (expense)
- Revenue (income)

**Balance calculation:**

- cash accounts: sum of positive amounts minus sum of negative amounts
- credit accounts: sum of absolute values (negative = charge, positive = payment)

**Acceptance criteria:**

- Cannot delete account with associated transactions (return 409)
- Balance endpoint returns `{ accountId, balance, currency: 'USD', asOf: ISO_DATE }`
- Default accounts created when first account list is empty

---

#### T-051 — Ledger Service — Categories CRUD

**Priority:** MUST-HAVE  
**Tier:** 4  
**Dependencies:** T-013, T-021, T-030  
**Estimated complexity:** Small

**Objective:** Implement category management in the Ledger Service.

**Routes:**

```
GET    /categories                  # List all categories (nested tree)
POST   /categories                  # Create category
PATCH  /categories/:id              # Update name, color, parent
DELETE /categories/:id              # Soft-delete
```

**Seed data:** On org creation, seed these default categories:

- Food & Dining, Travel, Software & Subscriptions, Office Supplies, Marketing, Professional Services, Utilities, Payroll (inactive by default), Other

**Acceptance criteria:**

- Cannot delete category with assigned transactions (return 409)
- `GET /categories` returns hierarchical tree (parent → children)
- Default categories are seeded once per org

---

#### T-052 — Ledger Service — Manual Transaction Entry

**Priority:** MUST-HAVE  
**Tier:** 4  
**Dependencies:** T-050, T-051  
**Estimated complexity:** Medium

**Objective:** Implement manual transaction creation and editing.

**Routes:**

```
GET    /transactions           # Paginated list with filters
POST   /transactions           # Create transaction
GET    /transactions/:id       # Get single transaction
PATCH  /transactions/:id       # Update (category, description, date, amount)
DELETE /transactions/:id       # Soft-delete
POST   /transactions/:id/review # Toggle review status
```

**Required query params for GET /transactions:**

- `page`, `limit` (default 50)
- `accountId`
- `categoryId`
- `status` (unreviewed | reviewed | flagged)
- `dateFrom`, `dateTo` (ISO dates)
- `q` (text search on description/merchant)
- `amountMin`, `amountMax`

**On create/update, publish event:**

```
transaction.created or transaction.updated → Redis Stream
```

**Acceptance criteria:**

- Pagination returns `{ data: Transaction[], meta: { total, page, limit, hasMore } }`
- All filters work independently and in combination
- Events published on create/update with correct payload
- `organizationId` from JWT — never trusted from request body

---

#### T-053 — Ledger Service — CSV Import Pipeline

**Priority:** MUST-HAVE  
**Tier:** 4  
**Dependencies:** T-052  
**Estimated complexity:** High

**Objective:** Implement CSV transaction import with format detection, validation, duplicate detection, and batch tracking.

**Routes:**

```
POST   /transactions/import/csv   # Upload and process CSV
GET    /import-batches             # List import batches
GET    /import-batches/:id         # Get batch status + row results
```

**Implementation details:**

1. Accept CSV upload via multipart form (`@fastify/multipart`)
2. Auto-detect CSV format (bank export formats):
   - Column detection for: Date, Amount, Description, possibly Debit/Credit split
   - Supported date formats: MM/DD/YYYY, YYYY-MM-DD, M/D/YYYY
3. Validate each row:
   - Required: date, amount
   - Skip rows where amount is 0
4. Duplicate detection:
   - Consider duplicate if same `(date, amount, description)` already exists for the org+account
   - Return `status: 'duplicate'` for those rows — do not insert
5. Create `ImportBatch` record tracking: `rowCount`, `importedCount`, `duplicateCount`, `errorCount`
6. Return `ImportBatch` with per-row results

**CSV format must support at minimum:**

- Chase/BofA bank export format
- Generic 3-column: Date, Amount, Description

**Acceptance criteria:**

- 500-row CSV processes in under 5 seconds
- Duplicate rows are flagged, not silently dropped
- Batch record stores accurate counts
- Malformed rows return validation errors with row numbers

---

#### T-054 — Ledger Service — Transaction Review States

**Priority:** MUST-HAVE  
**Tier:** 4  
**Dependencies:** T-052  
**Estimated complexity:** Small

**Objective:** Implement the review state machine for transactions.

**Routes:**

```
POST /transactions/:id/review   # body: { status: 'reviewed' | 'flagged' | 'unreviewed' }
GET  /transactions/review-queue # shorthand for GET /transactions?status=unreviewed
```

**Business rules:**

- Only `owner`, `admin`, `accountant` can mark transactions reviewed
- Marking reviewed publishes a `transaction.updated` event
- `review-queue` endpoint sorts by date descending, limit 100

**Acceptance criteria:**

- `viewer` role cannot update review status (403)
- Reviewing a transaction updates `updated_at`
- Review queue returns only `unreviewed` transactions

---

#### T-060 — Web — Accounts Management Page

**Priority:** MUST-HAVE  
**Tier:** 4  
**Dependencies:** T-040, T-050  
**Estimated complexity:** Small

**Objective:** Build the `/settings/accounts` page in the web app.

**Features:**

- Table of accounts with: name, type, code, balance
- "Add Account" button → modal with form (name, type, code)
- Edit account inline or via modal
- Delete account (confirm dialog, show error if transactions exist)
- Balance shown per account

**Component structure:**

- `AccountsTable` — uses TanStack Table
- `AccountForm` — React Hook Form + Zod schema matching `@wford26/shared-types`
- `AccountBalanceBadge` — formatted currency display

**Acceptance criteria:**

- Optimistic UI on create/delete using TanStack Query mutations
- Form validates before submitting
- Error toast shown if delete fails due to existing transactions

---

#### T-061 — Web — Categories Management Page

**Priority:** MUST-HAVE  
**Tier:** 4  
**Dependencies:** T-040, T-051  
**Estimated complexity:** Small

**Objective:** Build the `/settings/categories` page.

**Features:**

- Nested category tree display (parent → children indented)
- Add category (name, color picker, optional parent)
- Edit / delete inline
- Color swatch next to each category

**Acceptance criteria:**

- Parent categories expandable/collapsible
- Color picker uses a 12-color palette (no free-form input for MVP)
- Cannot delete category with assigned transactions

---

#### T-062 — Web — Transactions Table

**Priority:** MUST-HAVE  
**Tier:** 4  
**Dependencies:** T-040, T-052, T-053, T-054  
**Estimated complexity:** High

**Objective:** Build the `/transactions` page — the primary data view of the app.

**Features:**

1. Filterable, sortable data table using TanStack Table:
   - Columns: Date | Merchant/Description | Account | Category | Amount | Status | Actions
   - Inline category assignment (dropdown, searchable)
   - Row-level review toggle
   - Multi-row select for bulk categorize

2. Filter panel (collapsible on mobile):
   - Date range picker
   - Account multi-select
   - Category multi-select
   - Review status filter
   - Amount range
   - Search text

3. CSV import button → opens `ImportModal`:
   - File drop zone
   - Account selector
   - Column mapping UI (auto-detected, manually adjustable)
   - Import progress and results summary

4. "Add Transaction" button → `TransactionForm` modal

**Acceptance criteria:**

- Table virtualizes rows for 500+ transactions (use `@tanstack/virtual`)
- Filters persist in URL search params
- Category dropdown shows recently used categories first
- Import modal shows row-level success/duplicate/error breakdown

---

### Tier 4 — Expenses & Documents

---

#### T-080 — Documents Service — Upload Pipeline

**Priority:** MUST-HAVE  
**Tier:** 5  
**Dependencies:** T-013  
**Estimated complexity:** Medium

**Objective:** Implement the signed URL upload flow in the Documents Service using S3/R2.

**Flow:**

1. Client requests upload URL: `POST /documents/upload-url` with `{ filename, contentType, size }`
2. Service generates presigned S3 PUT URL (15 min TTL) + a `documentId`
3. Client uploads directly to S3 using the presigned URL
4. Client notifies service: `POST /documents` with `{ documentId, s3Key }` to finalize
5. Service verifies the file exists in S3, stores metadata

**Routes:**

```
POST   /documents/upload-url    # Step 1: get presigned URL
POST   /documents               # Step 2: finalize after upload
GET    /documents               # List documents for org (paginated)
GET    /documents/:id           # Get doc metadata + fresh signed GET URL
DELETE /documents/:id           # Delete from S3 + DB
```

**Allowed file types:** `image/jpeg`, `image/png`, `image/heic`, `application/pdf`
**Max file size:** 25MB

**Publish event:** `receipt.uploaded` when document is finalized

**Acceptance criteria:**

- Presigned URLs expire in 15 minutes
- GET requests return a fresh signed URL (5 min expiry) — never a public URL
- File type validated on finalize (not just on URL request)
- `DELETE` removes from both S3 and database

---

#### T-081 — Documents Service — Transaction Linking

**Priority:** MUST-HAVE  
**Tier:** 5  
**Dependencies:** T-080  
**Estimated complexity:** Small

**Objective:** Allow documents to be linked to transactions.

**Routes:**

```
POST   /documents/:id/link-transaction          # body: { transactionId }
DELETE /documents/:id/link-transaction/:txId    # Remove link
GET    /documents/by-transaction/:transactionId  # Get docs for a transaction
```

**Business rules:**

- One document can be linked to multiple transactions (one receipt, multiple line items)
- A transaction can have multiple documents
- Link is org-scoped — cannot link across orgs

**Acceptance criteria:**

- Linking non-existent transaction returns 404
- Cross-org link attempt returns 403
- `GET /documents/by-transaction/:id` includes signed download URLs

---

#### T-082 — Web — Receipt Upload UI

**Priority:** MUST-HAVE  
**Tier:** 5  
**Dependencies:** T-040, T-080, T-081  
**Estimated complexity:** Medium

**Objective:** Build the receipt upload experience, optimized for mobile capture and desktop drag-and-drop.

**Features:**

1. `/receipts` page:
   - Grid of uploaded receipts with thumbnails
   - Each receipt shows: filename, upload date, linked transactions (if any), link icon
   - "Unlinked" filter to find orphan receipts

2. Upload modal (accessible from Receipts page AND from transaction row actions):
   - Drag and drop zone
   - Camera capture on mobile (`accept="image/*" capture="environment"`)
   - Upload progress bar (using presigned URL + XHR, not fetch, for progress)
   - On success, offer to link to a transaction

3. Link modal:
   - Transaction search/select (fuzzy search by description/amount)
   - Shows selected transaction summary before confirming

**Acceptance criteria:**

- Upload works on iOS Safari and Android Chrome
- Progress bar shows real upload progress
- Files over 25MB show an error before upload starts
- Thumbnail shown for images (not PDFs)

---

#### T-090 — Web — Dashboard Summary Cards

**Priority:** MUST-HAVE  
**Tier:** 5  
**Dependencies:** T-040, T-052, T-053  
**Estimated complexity:** Medium

**Objective:** Build the `/` (dashboard) page with summary metric cards. Data comes from the Reporting Service (T-104) but this task uses placeholder/mock data until that task is complete. The component must be wired to the real API endpoint once T-104 is done.

**Cards to display:**

1. **Total Expenses This Month** — `$X,XXX` with trend vs last month
2. **Unreviewed Transactions** — count with "Review" CTA link
3. **Uncategorized Transactions** — count with "Categorize" CTA
4. **Top Spending Category** — name + amount this month
5. **Account Balances** — mini table of accounts + balances
6. **Recent Transactions** — last 5 transactions table

**Layout:**

- 2-column card grid on desktop, 1-column on mobile
- Recent Transactions spans full width

**Acceptance criteria:**

- Loading skeletons shown while data fetches
- Cards refresh every 5 minutes (TanStack Query `staleTime`)
- Empty state when no transactions exist (onboarding prompt)

---

#### T-091 — Web — CSV Import UI

**Priority:** MUST-HAVE  
**Tier:** 5  
**Dependencies:** T-040, T-053, T-062  
**Estimated complexity:** Medium

**Objective:** Build the CSV import modal/wizard (as a standalone component importable by T-062 and the onboarding flow).

**Steps:**

1. **Upload step** — file picker or drag-and-drop, account selector
2. **Preview step** — show first 5 rows, let user map columns (Date, Amount, Description, Debit, Credit)
3. **Import step** — submit, show progress, then show results:
   - `X transactions imported`
   - `Y duplicates skipped`
   - `Z rows with errors` (expandable list)
4. **Done step** — "View Transactions" button

**Acceptance criteria:**

- Column mapping remembers the last mapping per file format (localStorage)
- Date format is auto-detected and shown to user for confirmation
- Cannot proceed past Step 1 without selecting an account
- Import button disabled until column mapping is valid

---

### Tier 5 — Reporting

---

#### T-100 — Reporting Service — Event Subscriber Setup

**Priority:** MUST-HAVE  
**Tier:** 6  
**Dependencies:** T-011, T-013  
**Estimated complexity:** Medium

**Objective:** Set up the Reporting Service event subscription infrastructure. This service maintains pre-aggregated snapshots and responds to events from the Ledger and Invoicing services.

**Implement:**

1. Redis Stream consumer group setup:
   - Consumer group: `reporting-service`
   - Subscribe to: `transaction.created`, `transaction.updated`, `expense.categorized`, `account.reconciled`, `invoice.paid`

2. Handler for `transaction.created`:
   - Upsert `reporting.metric_aggregates` for:
     - `total_expenses:{YYYY-MM}` — running total for the period
     - `category_spend:{categoryId}:{YYYY-MM}` — per-category total
     - `vendor_spend:{merchantNormalized}:{YYYY-MM}` — per-merchant total

3. Handler for `transaction.updated`:
   - Recalculate affected aggregates if category or amount changed

4. Dead letter handling — log and continue on processing errors

**Acceptance criteria:**

- Consumer group created on service startup if it doesn't exist
- Each event handler is idempotent (safe to replay)
- Failed events logged with event ID and error, not silently dropped
- Unit tests for each handler with mock events

---

#### T-101 — Reporting Service — P&L Report

**Priority:** MUST-HAVE  
**Tier:** 6  
**Dependencies:** T-100  
**Estimated complexity:** Medium

**Route:** `GET /reports/pnl?period=YYYY-MM`

**Response shape:**

```json
{
  "period": "2026-03",
  "totalIncome": 12500.00,
  "totalExpenses": 8340.50,
  "netIncome": 4159.50,
  "incomeByCategory": [...],
  "expensesByCategory": [...],
  "generatedAt": "2026-03-25T..."
}
```

**Implementation:** Read from `reporting.metric_aggregates` — do not query the ledger schema directly. If aggregates are missing for the requested period, return empty data (do not fallback to ledger).

**Acceptance criteria:**

- Response time under 200ms (reading from aggregates)
- Returns 200 with empty data for future periods (not 404)
- `period` parameter validated as `YYYY-MM` format

---

#### T-102 — Reporting Service — Expense by Category

**Priority:** MUST-HAVE  
**Tier:** 6  
**Dependencies:** T-100  
**Estimated complexity:** Small

**Route:** `GET /reports/expenses-by-category?period=YYYY-MM&limit=10`

**Response:** Array of `{ categoryId, categoryName, amount, percentage, transactionCount }` sorted by amount descending.

**Acceptance criteria:**

- Percentages sum to 100 (rounded to 2 decimal places)
- "Uncategorized" bucket included if any uncategorized transactions exist

---

#### T-103 — Reporting Service — Vendor Spend Report

**Priority:** SHOULD-HAVE  
**Tier:** 6  
**Dependencies:** T-100  
**Estimated complexity:** Small

**Route:** `GET /reports/vendor-spend?period=YYYY-MM&limit=20`

**Response:** Array of `{ merchant, amount, transactionCount }` sorted by amount descending.

---

#### T-104 — Reporting Service — Dashboard Aggregates API

**Priority:** MUST-HAVE  
**Tier:** 6  
**Dependencies:** T-101, T-102, T-103  
**Estimated complexity:** Small

**Route:** `GET /reports/dashboard`

**Response:** Aggregated payload for the dashboard:

```json
{
  "currentMonth": {
    "totalExpenses": 8340.50,
    "expenseTrend": -3.2,         // % change vs last month
    "topCategory": { "name": "...", "amount": ... }
  },
  "unreviewedCount": 14,
  "uncategorizedCount": 6,
  "accountBalances": [...],
  "recentTransactions": [...]
}
```

**Note:** `unreviewedCount`, `uncategorizedCount`, and `recentTransactions` require reading from the Ledger schema. This is the **one exception** where Reporting reads from another service's schema — justified because these are operational counters, not aggregates, and reporting service shares the same PostgreSQL cluster.

**Acceptance criteria:**

- Response under 300ms
- Cached in Redis for 60 seconds per org
- Cache invalidated on `transaction.created` event

---

#### T-105 — Reporting Service — CSV Export

**Priority:** SHOULD-HAVE  
**Tier:** 6  
**Dependencies:** T-101  
**Estimated complexity:** Medium

**Routes:**

```
POST /reports/export/csv     # Start export job, returns { jobId }
GET  /reports/export/:jobId  # Returns { status, downloadUrl } when ready
```

**Implementation:**

- Use BullMQ job for async export
- Generate CSV with headers: Date, Description, Merchant, Account, Category, Amount, Status
- Upload to S3, return signed URL
- Job timeout: 60 seconds

**Acceptance criteria:**

- Export of 10,000 transactions completes under 30 seconds
- Signed download URL expires in 1 hour
- Job status: `pending`, `processing`, `complete`, `failed`

---

#### T-110 — Web — Reports Dashboard Page

**Priority:** MUST-HAVE  
**Tier:** 6  
**Dependencies:** T-040, T-101, T-102, T-103  
**Estimated complexity:** Medium

**Objective:** Build the `/reports` page with interactive charts.

**Sections:**

1. **Period selector** — month picker (default: current month)

2. **P&L Summary cards** — Income / Expenses / Net Income

3. **Expense by Category** — donut chart (Recharts) + table below
   - Clicking a category filters the transaction list

4. **Spending Trend** — bar chart: last 6 months of total expenses by month

5. **Top Vendors** — table: Merchant | Total | Transactions

6. **Export button** — triggers CSV export job, polls for completion, auto-downloads

**Acceptance criteria:**

- Charts are responsive (scale to container width)
- Period change re-fetches all data via TanStack Query
- Export button shows spinner while polling, disables to prevent double-click
- Empty state with illustration when no data exists

---

### Tier 6 — Invoicing

---

#### T-130 — Invoicing Service — Customers + Invoices

**Priority:** SHOULD-HAVE  
**Tier:** 7  
**Dependencies:** T-013  
**Estimated complexity:** Medium

**Objective:** Implement the Invoicing Service for customer management and invoice CRUD.

**Routes:** All routes listed in Section 7 under Invoicing Service.

**Invoice number generation:** Auto-increment per org: `INV-0001`, `INV-0002`, etc.

**On `mark-paid`:**

1. Update invoice status to `paid`
2. Publish `invoice.paid` event
3. Ledger service (subscribed to this event) creates an income transaction

**Acceptance criteria:**

- Invoice number is unique per org and auto-generated
- Status transitions: `draft → sent → paid`, `* → void` (no reversals)
- Cannot delete non-draft invoice (return 409)
- `invoice.paid` event published with correct payload

---

#### T-131 — Invoicing Service — PDF Generation

**Priority:** SHOULD-HAVE  
**Tier:** 7  
**Dependencies:** T-130  
**Estimated complexity:** Medium

**Route:** `GET /invoices/:id/pdf` — returns a presigned S3 URL to the PDF

**Implementation:**

- Use `@react-pdf/renderer` or `puppeteer` to generate PDF
- PDF layout: org logo placeholder, customer info, line items table, subtotal/tax/total, due date, notes
- Cache generated PDF in S3 keyed by `invoice-{id}-{updatedAt-hash}`
- Regenerate only when invoice has been updated since last generation

**Acceptance criteria:**

- PDF generated in under 3 seconds
- Professional layout matching the design system typography
- Cached PDF served on repeat requests

---

#### T-140 — Web — Invoicing Pages

**Priority:** SHOULD-HAVE  
**Tier:** 7  
**Dependencies:** T-040, T-130, T-131  
**Estimated complexity:** High

**Objective:** Build `/invoices` and `/customers` pages.

**Customers page (`/customers`):**

- Table: Name | Email | Outstanding Balance | Invoice Count
- Add/Edit customer modal
- Click row → customer detail with invoice history

**Invoices page (`/invoices`):**

- Table: Invoice # | Customer | Date | Due Date | Total | Status
- Status badge (Draft, Sent, Paid, Void)
- "New Invoice" button → full-page invoice editor

**Invoice editor (`/invoices/new`, `/invoices/:id`):**

- Customer selector
- Line items table (add/remove rows, description, qty, price, calculated amount)
- Notes field
- Totals section (subtotal, tax %, total)
- Actions: Save Draft, Send, Mark Paid, Download PDF, Void

**Acceptance criteria:**

- Line items auto-calculate amounts
- PDF download uses pre-generated presigned URL
- Sent invoice shows a read-only view (no editing)
- Confirmation dialog before voiding

---

## 11. MVP Milestone Summary

### Phase 0 — Foundation (Week 1–2)

Complete tasks: T-001, T-002, T-003, T-004, T-005, T-006, T-010, T-011, T-012, T-013

**Infrastructure gate:** Provision Stage 1 Azure resources (PostgreSQL + Blob Storage) before Phase 1 begins.

**Exit criteria:** Monorepo builds, CI/CD runs, local dev stack starts with Azure DB connected, shared packages published.

### Phase 1 — Auth & Shell (Week 2–3)

Complete tasks: T-020, T-021, T-030, T-040

**Exit criteria:** User can register, log in, create an org, and see the empty app shell with navigation.

### Phase 2 — Core Accounting (Week 3–6)

Complete tasks: T-050, T-051, T-052, T-053, T-054, T-060, T-061, T-062

**Exit criteria:** User can add accounts, create categories, manually enter transactions, import a CSV, and review/categorize transactions.

### Phase 3 — Receipts & Documents (Week 6–7)

Complete tasks: T-080, T-081, T-082, T-090, T-091

**Infrastructure gate:** Configure Azure Blob Storage for documents-service (bucket, CORS, lifecycle policy).

**Exit criteria:** User can upload receipts, link them to transactions, see the dashboard summary, and use the full CSV import wizard.

### Phase 4 — Reporting (Week 7–9)

Complete tasks: T-100, T-101, T-102, T-103, T-104, T-105, T-110

**Exit criteria:** User can view P&L, expense breakdown by category, vendor spend, and export a CSV of transactions.

### Phase 5 — Azure MVP Deploy (Week 9–10)

**Infrastructure gate:** Provision Stage 2 Azure resources. Deploy all services to Azure Container Apps.

**Deliverables:**

- All services containerized with production Dockerfiles
- Bicep modules deployed to `rg-abacus-staging`
- Azure Static Web Apps serving the Next.js frontend
- GitHub Actions deploy workflow pushing to ACA on merge to `main`
- Secrets migrated to Azure Key Vault

### Phase 6 — Invoicing (Week 10–12)

Complete tasks: T-130, T-131, T-140

**Exit criteria:** User can create customers, issue invoices, generate PDFs, and mark invoices paid (which records income in the ledger).

---

## 12. Security Baseline

The following must be implemented by the time Phase 1 is complete — they are not optional:

| Requirement             | Implementation                                          |
| ----------------------- | ------------------------------------------------------- |
| All tokens short-lived  | Access token: 15 min                                    |
| Refresh token rotation  | Used token invalidated immediately                      |
| Org-scoped queries      | `organizationId` from JWT, never from request body      |
| Parameterized queries   | Prisma ORM — no raw SQL with string interpolation       |
| Input validation        | Zod on all request body/query params                    |
| Signed file URLs        | Azure Blob SAS tokens, never public URLs                |
| Audit log for mutations | `updated_by`, `updated_at` on all financial records     |
| Rate limiting           | Login: 5/15min per IP. API: 100/min global              |
| CORS                    | Only allow configured frontend origins                  |
| Security headers        | `@fastify/helmet` on all services                       |
| Password hashing        | bcrypt, 12 rounds minimum                               |
| Secrets management      | Azure Key Vault in production, `.env` locally           |
| PostgreSQL SSL          | `sslmode=require` enforced for all connections to Azure |
| Azure RBAC              | `abacus_app` role with least-privilege schema grants    |

---

## 13. Deployment Targets

### Local (Stage 1) — Services local, DB in Azure

```bash
# Start local infrastructure only (no PostgreSQL — that's in Azure)
docker compose -f infrastructure/docker/docker-compose.stage1.yml up -d
# Starts: Redis, MinIO, MailHog

# Start all services (pointing at Azure PostgreSQL)
pnpm dev

# Services available at:
# Web:              http://localhost:3000
# API Gateway:      http://localhost:3100
# Identity:         http://localhost:3001
# Ledger:           http://localhost:3002
# Documents:        http://localhost:3004
# Reporting:        http://localhost:3005
# Invoicing:        http://localhost:3006
# Redis:            localhost:6379
# MinIO (S3):       http://localhost:9000
# MinIO Console:    http://localhost:9001
# MailHog:          http://localhost:8025
# PostgreSQL:       abacus-dev-pg.postgres.database.azure.com (Azure)
```

### Environment Variables

**Stage 1 local `.env` (services run locally, DB in Azure):**

```env
NODE_ENV=development
DATABASE_URL=postgresql://abacus_app:{password}@abacus-dev-pg.postgres.database.azure.com:5432/abacus?sslmode=require
REDIS_URL=redis://localhost:6379
JWT_SECRET=<32-byte-random-secret>
JWT_REFRESH_SECRET=<32-byte-random-secret>

# Documents service (MinIO locally mirrors Azure Blob)
STORAGE_ENDPOINT=http://localhost:9000
STORAGE_ACCOUNT_NAME=devlocal
STORAGE_CONTAINER=abacus-documents
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin

# API Gateway
FRONTEND_ORIGIN=http://localhost:3000
IDENTITY_SERVICE_URL=http://localhost:3001
LEDGER_SERVICE_URL=http://localhost:3002
DOCUMENTS_SERVICE_URL=http://localhost:3004
REPORTING_SERVICE_URL=http://localhost:3005
INVOICING_SERVICE_URL=http://localhost:3006
```

**Stage 2 production (Azure Container Apps — set in Key Vault + ACA secrets):**

```env
NODE_ENV=production
DATABASE_URL=postgresql://abacus_app:{password}@abacus-prod-pg.postgres.database.azure.com:5432/abacus?sslmode=require
REDIS_URL=rediss://:{password}@abacus-prod-redis.redis.cache.windows.net:6380
JWT_SECRET=<from Key Vault>
JWT_REFRESH_SECRET=<from Key Vault>

# Azure Blob Storage
AZURE_STORAGE_ACCOUNT_NAME=abacusprodstorage
AZURE_STORAGE_ACCOUNT_KEY=<from Key Vault>
STORAGE_CONTAINER=abacus-documents

# Service-to-service URLs (internal ACA FQDNs)
IDENTITY_SERVICE_URL=https://abacus-identity.internal.{aca-env}.io
LEDGER_SERVICE_URL=https://abacus-ledger.internal.{aca-env}.io
DOCUMENTS_SERVICE_URL=https://abacus-documents.internal.{aca-env}.io
REPORTING_SERVICE_URL=https://abacus-reporting.internal.{aca-env}.io
INVOICING_SERVICE_URL=https://abacus-invoicing.internal.{aca-env}.io
```

### Production URLs (Stage 2+)

```
Frontend:   https://abacus-prod-web.azurestaticapps.net
            (custom domain: app.abacus.dev — configured via Static Web Apps)
API:        https://abacus-api-gateway.{region}.azurecontainerapps.io
```

---

_Document version: 1.0 | Abacus — wford26/abacus MVP_
