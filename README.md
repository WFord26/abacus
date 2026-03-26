# Abacus

Abacus is a lightweight accounting and expense-tracking platform for small businesses.

This repository is organized as a pnpm workspace powered by Turborepo. The initial scaffold follows the implementation plan in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Current local startup

The implemented local stack today is:

- `apps/identity-service`
- `apps/ledger-service`
- `apps/documents-service`
- `apps/reporting-service`
- `apps/api-gateway`
- `apps/web`
- `infrastructure/docker/docker-compose.yml` for PostgreSQL, Redis, MinIO, and MailHog

### Infrastructure ports

- PostgreSQL: `localhost:15432`
- Redis: `localhost:16379`
- MinIO API: `localhost:9000`
- MinIO Console: `localhost:9001`
- MailHog SMTP: `localhost:1025`
- MailHog UI: `localhost:8025`

### Verify the workspace

```bash
npx --yes pnpm build
npx --yes pnpm typecheck
npx --yes pnpm test
```

### Bring up infrastructure

```bash
docker compose -f infrastructure/docker/docker-compose.yml up -d
docker compose -f infrastructure/docker/docker-compose.yml exec -T postgres \
  psql -U postgres -d accounting -v ON_ERROR_STOP=1 \
  < apps/identity-service/prisma/migrations/0001_init/migration.sql
```

### Start the implemented apps

The easiest path now is:

```bash
npm run dev
```

That root launcher reads [`.env`](/Users/will/git/abacus/.env) and starts:

- identity service on `127.0.0.1:3001`
- ledger service on `127.0.0.1:3002`
- documents service on `127.0.0.1:3004`
- reporting service on `127.0.0.1:3003`
- API gateway on `127.0.0.1:3000`
- web on `127.0.0.1:3007`

For a fresh local environment with no existing auth accounts, you can create the first owner account with:

```bash
curl -X POST http://127.0.0.1:3000/api/v1/auth/bootstrap-admin \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","name":"Admin","password":"password123"}'
```

The web app now detects that bootstrap state automatically and routes fresh environments to
`/bootstrap` instead of the normal sign-in screen.

If you want to run them individually instead, use:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:15432/accounting?schema=identity' \
REDIS_URL='redis://localhost:16379' \
JWT_SECRET='development-secret' \
npx --yes pnpm --filter @wford26/accounting-identity-service start

DATABASE_URL='postgresql://postgres:postgres@localhost:15432/accounting?schema=ledger' \
JWT_SECRET='development-secret' \
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

DOCUMENTS_SERVICE_URL='http://127.0.0.1:3004' \
LEDGER_SERVICE_URL='http://127.0.0.1:3002' \
IDENTITY_SERVICE_URL='http://127.0.0.1:3001' \
REPORTING_SERVICE_URL='http://127.0.0.1:3003' \
FRONTEND_ORIGIN='http://127.0.0.1:3007' \
JWT_SECRET='development-secret' \
npx --yes pnpm --filter @wford26/accounting-api-gateway start

npx --yes pnpm --filter @wford26/accounting-web start
```
