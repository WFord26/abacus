# Abacus Setup

This document covers local development setup for Abacus and the current deployment bootstrap scaffold.

## Prerequisites

- Node.js with `npm`
- Docker Desktop or a compatible local Docker runtime

Abacus uses a pnpm workspace, but the repo scripts already invoke `pnpm` through `npx --yes pnpm`, so a global `pnpm` install is optional.

## Quick Start

1. Create or validate the root environment file.

   ```bash
   npm run env:check -- --fix
   ```

2. Start local infrastructure and run all Prisma migrations.

   ```bash
   npm run bootstrap:local
   ```

3. Start the implemented app stack.

   ```bash
   npm run dev
   ```

4. Seed the first admin account for a fresh environment.

   ```bash
   npm run seed:local
   ```

## What The Local Stack Starts

`npm run dev` launches:

- identity service on `127.0.0.1:3001`
- ledger service on `127.0.0.1:3002`
- reporting service on `127.0.0.1:3003`
- documents service on `127.0.0.1:3004`
- invoicing service on `127.0.0.1:3006`
- API gateway on `127.0.0.1:3000`
- web on `127.0.0.1:3007`

Docker infrastructure provides:

- PostgreSQL on `localhost:15432`
- Redis on `localhost:16379`
- MinIO API on `localhost:9000`
- MinIO Console on `localhost:9001`
- MailHog SMTP on `localhost:1025`
- MailHog UI on `localhost:8025`

## Environment File

Use [`.env.example`](../.env.example) as the source of truth for local configuration. The local setup scripts can create [`.env`](../.env) automatically when it is missing.

Important values include:

- shared runtime settings such as `HOST`, `JWT_SECRET`, and `FRONTEND_ORIGIN`
- per-service database URLs such as `IDENTITY_DATABASE_URL` and `LEDGER_DATABASE_URL`
- local object-storage settings for MinIO-backed document, reporting, and invoicing buckets
- bootstrap user defaults through `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, and `SEED_ADMIN_PASSWORD`

For Resend-backed identity email flows, set:

```bash
RESEND_API_KEY='re_...'
RESEND_FROM_EMAIL='Abacus <auth@your-domain.example>'
RESEND_REPLY_TO='support@your-domain.example' # optional
FRONTEND_ORIGIN='http://127.0.0.1:3007'
```

## Local Commands

Validate the workspace:

```bash
npx --yes pnpm build
npx --yes pnpm typecheck
npx --yes pnpm test
```

Run setup steps individually:

```bash
npm run env:check
npm run migrate:all
```

Bootstrap local infrastructure without migrations:

```bash
npm run bootstrap:local -- --skip-migrate
```

Run the web app in Docker while keeping the API gateway on the host:

```bash
docker compose -f infrastructure/docker/docker-compose.yml --profile web up --build web
```

The Compose `web` service builds `apps/web/Dockerfile` with `NEXT_PUBLIC_API_BASE_URL` pointed at `http://host.docker.internal:3000/api/v1` by default so the containerized Next.js app can talk to a locally running API gateway. Override that variable when you need the web container to target a different gateway URL.

## Seeded Admin Account

On a fresh environment, `npm run seed:local` creates the first owner account through the identity bootstrap endpoints.

Default credentials:

- Email: `admin@example.com`
- Password: `password123`

Override them in [`.env`](../.env) with `SEED_ADMIN_EMAIL`, `SEED_ADMIN_NAME`, and `SEED_ADMIN_PASSWORD`.

The web app automatically routes fresh environments to `/bootstrap` until the first admin exists, then new users continue through `/setup` to create or choose a workspace.

## Running Services Individually

If you want to run apps outside the root launcher, use the environment values from [`.env.example`](../.env.example) and start the packages directly:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:15432/accounting?schema=identity' \
REDIS_URL='redis://localhost:16379' \
JWT_SECRET='development-secret' \
FRONTEND_ORIGIN='http://127.0.0.1:3007' \
RESEND_API_KEY='re_...' \
RESEND_FROM_EMAIL='Abacus <auth@your-domain.example>' \
npx --yes pnpm --filter @wford26/accounting-identity-service start

DATABASE_URL='postgresql://postgres:postgres@localhost:15432/accounting?schema=ledger' \
JWT_SECRET='development-secret' \
REDIS_URL='redis://localhost:16379' \
npx --yes pnpm --filter @wford26/accounting-ledger-service start

DATABASE_URL='postgresql://postgres:postgres@localhost:15432/accounting?schema=documents' \
DOCUMENTS_BUCKET='accounting-documents' \
S3_ENDPOINT='http://127.0.0.1:9000' \
S3_REGION='us-east-1' \
S3_ACCESS_KEY_ID='minioadmin' \
S3_SECRET_ACCESS_KEY='minioadmin' \
REDIS_URL='redis://localhost:16379' \
npx --yes pnpm --filter @wford26/accounting-documents-service start

DATABASE_URL='postgresql://postgres:postgres@localhost:15432/accounting?schema=reporting' \
REPORTS_BUCKET='accounting-reports' \
S3_ENDPOINT='http://127.0.0.1:9000' \
S3_REGION='us-east-1' \
S3_ACCESS_KEY_ID='minioadmin' \
S3_SECRET_ACCESS_KEY='minioadmin' \
REDIS_URL='redis://localhost:16379' \
npx --yes pnpm --filter @wford26/accounting-reporting-service start

DATABASE_URL='postgresql://postgres:postgres@localhost:15432/accounting?schema=invoicing' \
INVOICES_BUCKET='accounting-invoices' \
S3_ENDPOINT='http://127.0.0.1:9000' \
S3_REGION='us-east-1' \
S3_ACCESS_KEY_ID='minioadmin' \
S3_SECRET_ACCESS_KEY='minioadmin' \
REDIS_URL='redis://localhost:16379' \
npx --yes pnpm --filter @wford26/accounting-invoicing-service start

DOCUMENTS_SERVICE_URL='http://127.0.0.1:3004' \
LEDGER_SERVICE_URL='http://127.0.0.1:3002' \
IDENTITY_SERVICE_URL='http://127.0.0.1:3001' \
INVOICING_SERVICE_URL='http://127.0.0.1:3006' \
REPORTING_SERVICE_URL='http://127.0.0.1:3003' \
FRONTEND_ORIGIN='http://127.0.0.1:3007' \
JWT_SECRET='development-secret' \
npx --yes pnpm --filter @wford26/accounting-api-gateway start

npx --yes pnpm --filter @wford26/accounting-web start
```

## Deployment Scaffold

The repo includes an initial backend deployment scaffold:

- per-service Dockerfiles in `apps/*/Dockerfile`
- Azure infrastructure modules in [`infrastructure/bicep`](../infrastructure/bicep)
- helper scripts in [`infrastructure/scripts`](../infrastructure/scripts)

Typical deployment flow:

```bash
infrastructure/scripts/bootstrap-azure.sh dev
infrastructure/scripts/deploy.sh dev
IDENTITY_DATABASE_URL='postgresql://...' \
LEDGER_DATABASE_URL='postgresql://...' \
DOCUMENTS_DATABASE_URL='postgresql://...' \
REPORTING_DATABASE_URL='postgresql://...' \
INVOICING_DATABASE_URL='postgresql://...' \
infrastructure/scripts/seed-db.sh
```

The documents, reporting, and invoicing services currently expect S3-compatible object storage at runtime, so the Azure parameters keep that endpoint and credential wiring explicit rather than assuming native Blob compatibility.
