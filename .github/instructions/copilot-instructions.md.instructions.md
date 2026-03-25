---
description: "Abacus monorepo project guidelines. Use when: writing TypeScript services or React components, adding routes or handlers, writing tests, publishing events, working with Prisma, preparing releases, writing commit messages, updating the changelog, reviewing PRs, or working with Azure Blob Storage or Redis in the Abacus accounting app."
applyTo: "**/*.{ts,tsx,prisma}"
---

# Abacus — GitHub Copilot Instructions

> Place this file at `.github/copilot-instructions.md` in the `wford26/abacus` repository.  
> Copilot and Copilot Chat will automatically load these instructions for every interaction in this repo.

---

## Project Overview

**Abacus** is a lightweight accounting and expense-tracking application for small businesses. It is a TypeScript monorepo built with pnpm workspaces and Turborepo, targeting Microsoft Azure for deployment.

- **Repo:** `wford26/abacus`
- **Architecture:** Microservices (Fastify + Node.js), Next.js 14 frontend, PostgreSQL, Redis, Azure Blob Storage
- **Monorepo tool:** Turborepo + pnpm workspaces
- **Primary language:** TypeScript (strict mode everywhere)
- **Infrastructure:** Azure Container Apps (production), local Docker Compose (development)

Refer to `docs/architecture.md` for the full service map, database schemas, event contracts, and task registry.

---

## Versioning — CalVer YYYY.MM.DD

This project uses **Calendar Versioning (CalVer)** with the format `YYYY.MM.DD`.

### Rules

- The version string is `YYYY.MM.DD` where the date is the date of the release commit.
- If multiple releases occur on the same calendar day, append a build counter: `YYYY.MM.DD.1`, `YYYY.MM.DD.2`, etc.
- This version is the **single source of truth** across the entire monorepo. It is not per-package.
- Pre-release suffixes are allowed: `YYYY.MM.DD-alpha`, `YYYY.MM.DD-beta`, `YYYY.MM.DD-rc.1`

### Where the versions live

The canonical release version is in the root `package.json`:

```json
{
  "name": "abacus",
  "version": "2026.03.25"
}
```

- The root version uses CalVer and represents the repository release.
- Backend service apps in `apps/*-service` and `apps/api-gateway` use normal semantic versioning.
- Internal packages in `packages/*` also use semantic versioning unless a task says otherwise.
- The web app may track the root release version when appropriate, but it is not used to drive backend service bumps.

### How to bump the version

When preparing a release:

1. Update `version` in the root `package.json` to today's date in `YYYY.MM.DD` format.
2. Run `pnpm version:bump` to:
   - bump the root release version to the newest CalVer date
   - bump changed backend services with semantic versioning
   - generate a release tracking file for change verification
   - optionally roll `CHANGELOG.md` `Unreleased` entries into the release section
3. Commit with message: `chore: release YYYY.MM.DD`
4. Tag the commit: `git tag vYYYY.MM.DD`

**Copilot should:**

- When asked to "bump the version" or "prepare a release", use today's date in `YYYY.MM.DD` format.
- Never suggest semver (`1.2.3`) for this project.
- Treat backend service versions as semver, not CalVer.
- Remind the developer to run `pnpm version:bump` when preparing a release.

---

## Changelog — CHANGELOG.md

The project maintains a `CHANGELOG.md` in the repo root following the [Keep a Changelog](https://keepachangelog.com/) format.

### File format

```markdown
# Changelog

All notable changes to Abacus are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: CalVer YYYY.MM.DD

## [Unreleased]

### Added

- ...

### Changed

- ...

### Fixed

- ...

### Removed

- ...

---

## [2026.03.25]

### Added

- T-001: Monorepo scaffold with Turborepo and pnpm workspaces
- T-002: Shared TypeScript configuration packages

### Fixed

- Resolved pnpm hoisting conflict in config-eslint package

---
```

### Changelog update workflow

**After a PR is merged and approved**, Copilot should help update `CHANGELOG.md` by:

1. Moving all entries under `## [Unreleased]` into a new versioned section `## [YYYY.MM.DD]` using today's date.
2. Adding a new empty `## [Unreleased]` section at the top.
3. Including the PR title, task ID (e.g. `T-052`), and a plain-language description of what changed.
4. Grouping entries under the correct heading: `Added`, `Changed`, `Fixed`, `Removed`, `Security`, `Deprecated`.

**Copilot should:**

- When completing a task or feature, suggest the appropriate `CHANGELOG.md` entry before committing.
- Use the task ID prefix from the architecture doc (e.g. `T-052`) in changelog entries when applicable.
- Keep entries concise — one sentence per change, written for a developer audience, not marketing.
- Never skip the changelog update step when prompted to finalize or commit a change.

**Example entry Copilot should generate after completing T-052:**

```markdown
## [Unreleased]

### Added

- T-052: Manual transaction entry endpoint in ledger-service with Zod validation and org-scoped writes
- T-052: `transaction.created` Redis Stream event published on every new transaction
```

---

## Testing Requirements

Every new or changed implementation **must include tests**. Testing is not optional and is not deferred. Copilot should always generate or update tests as part of completing any task.

### Test stack

| Layer                        | Tool                           | Location                                       |
| ---------------------------- | ------------------------------ | ---------------------------------------------- |
| Unit tests                   | Vitest                         | `src/__tests__/unit/` or colocated `*.test.ts` |
| Integration tests (services) | Vitest + Supertest             | `src/__tests__/integration/`                   |
| Component tests (frontend)   | Vitest + React Testing Library | `src/__tests__/components/`                    |
| E2E (future)                 | Playwright                     | `e2e/`                                         |

### Test file naming

- Unit: `{module}.test.ts` — colocated next to the source file
- Integration: `{resource}.integration.test.ts` — in `src/__tests__/integration/`
- Components: `{ComponentName}.test.tsx` — colocated next to the component

### Test structure — services (Fastify + Prisma)

```typescript
// ledger-service/src/routes/v1/__tests__/transactions.integration.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildApp } from "../../../app";
import { createTestOrg, createTestUser, getAuthToken } from "../../../../test/helpers";

describe("POST /transactions", () => {
  let app: ReturnType<typeof buildApp>;
  let authToken: string;
  let orgId: string;

  beforeAll(async () => {
    app = buildApp({ logger: false });
    await app.ready();
    const { org, user } = await createTestOrg();
    orgId = org.id;
    authToken = await getAuthToken(user);
  });

  afterAll(async () => {
    await app.close();
  });

  it("creates a transaction for a valid request", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        accountId: "test-account-id",
        date: "2026-03-25",
        amount: -45.0,
        description: "Coffee shop",
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.data.organizationId).toBe(orgId);
    expect(body.data.reviewStatus).toBe("unreviewed");
  });

  it("returns 401 when no token is provided", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/transactions",
      payload: { amount: -10 },
    });
    expect(response.statusCode).toBe(401);
  });

  it("returns 400 for missing required fields", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/transactions",
      headers: { authorization: `Bearer ${authToken}` },
      payload: { description: "No amount or date" },
    });
    expect(response.statusCode).toBe(400);
  });
});
```

### Test structure — frontend components (React)

```typescript
// apps/web/src/components/__tests__/TransactionRow.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TransactionRow } from '../TransactionRow';
import { mockTransaction } from '../../../test/fixtures';

describe('TransactionRow', () => {
  it('renders the merchant name and amount', () => {
    render(<TransactionRow transaction={mockTransaction()} onReview={vi.fn()} />);
    expect(screen.getByText('Coffee shop')).toBeInTheDocument();
    expect(screen.getByText('-$45.00')).toBeInTheDocument();
  });

  it('calls onReview when mark reviewed is clicked', () => {
    const onReview = vi.fn();
    render(<TransactionRow transaction={mockTransaction()} onReview={onReview} />);
    fireEvent.click(screen.getByRole('button', { name: /mark reviewed/i }));
    expect(onReview).toHaveBeenCalledWith(mockTransaction().id);
  });
});
```

### Test structure — utility / service logic (unit)

```typescript
// ledger-service/src/services/__tests__/csv-parser.test.ts
import { describe, it, expect } from "vitest";
import { parseCsvRow, detectCsvFormat } from "../csv-parser";

describe("detectCsvFormat", () => {
  it("detects Chase format from headers", () => {
    const headers = [
      "Transaction Date",
      "Post Date",
      "Description",
      "Category",
      "Type",
      "Amount",
      "Memo",
    ];
    expect(detectCsvFormat(headers)).toBe("chase");
  });

  it("falls back to generic format for unknown headers", () => {
    expect(detectCsvFormat(["Date", "Amount", "Desc"])).toBe("generic");
  });
});
```

### What Copilot must always do when writing implementation code

1. **New route or endpoint** → Write at minimum: one happy-path integration test, one 401 unauthenticated test, one 400 validation test.
2. **New service function** → Write unit tests for the logic, covering the main path and at least one error/edge case.
3. **New React component** → Write a render test and at least one interaction test if the component has user-facing actions.
4. **Bug fix** → Add a regression test that fails before the fix and passes after.
5. **Event handler** → Unit test the handler with a mock event payload in the shape of `@wford26/event-contracts`.
6. **Database query** → Test against a real test database (using a test schema or `beforeEach` transaction rollback) — do not mock Prisma in integration tests.

### Test helpers and fixtures

Shared test utilities live in:

```
apps/{service}/test/
  helpers.ts      # createTestOrg(), getAuthToken(), cleanDatabase()
  fixtures.ts     # mockTransaction(), mockOrg(), mockUser()
  setup.ts        # globalSetup and globalTeardown for Vitest
```

Frontend test utilities:

```
apps/web/src/test/
  setup.ts        # @testing-library/jest-dom setup
  fixtures.ts     # mockTransaction(), mockOrg() with realistic data
  render.tsx      # Custom render with providers (QueryClient, AuthContext)
```

### Running tests

```bash
# All tests across monorepo
pnpm test

# Tests for a specific service
pnpm --filter ledger-service test

# Watch mode during development
pnpm --filter ledger-service test:watch

# Coverage report
pnpm --filter ledger-service test:coverage
```

### Coverage expectations

| Service layer                  | Minimum coverage target              |
| ------------------------------ | ------------------------------------ |
| Service logic (`*.service.ts`) | 80%                                  |
| Route handlers (integration)   | All public routes covered            |
| Repositories (`*.repo.ts`)     | Integration tested via service tests |
| React components               | Render + primary interactions        |
| Shared packages (`@wford26/*`) | 90% — these are foundational         |

Coverage is reported but not hard-enforced as a CI gate during early development. It becomes a gate at Phase 3+.

---

## Code Style & Patterns

These patterns apply across all services and packages. Copilot should follow them consistently.

### TypeScript

- `strict: true` always — no `any`, no type assertions without a comment explaining why
- Prefer `unknown` over `any` when the type cannot be determined
- Use `@wford26/shared-types` for domain interfaces — do not redefine types locally
- Zod schemas are the source of truth for request validation; infer TypeScript types from them:
  ```typescript
  const CreateTransactionSchema = z.object({
    accountId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount: z.number().nonzero(),
    description: z.string().max(500).optional(),
  });
  type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;
  ```

### Naming conventions

| Thing                 | Convention                   | Example                                 |
| --------------------- | ---------------------------- | --------------------------------------- |
| Files                 | kebab-case                   | `transaction.service.ts`                |
| Variables / functions | camelCase                    | `getTransactionById`                    |
| Classes               | PascalCase                   | `TransactionService`                    |
| Interfaces / types    | PascalCase                   | `Transaction`, `CreateTransactionInput` |
| Zod schemas           | PascalCase + `Schema` suffix | `CreateTransactionSchema`               |
| Database tables       | snake_case (Prisma maps)     | `transactions`, `import_batches`        |
| Event types           | dot.notation                 | `transaction.created`                   |
| Environment variables | UPPER_SNAKE_CASE             | `DATABASE_URL`                          |
| React components      | PascalCase                   | `TransactionRow`                        |
| React hooks           | camelCase + `use` prefix     | `useTransactions`                       |

### Error handling in services

All route handlers follow this pattern — never let errors bubble up unhandled:

```typescript
// Route handler pattern
handler: async (request, reply) => {
  try {
    const result = await transactionService.create(request.user.organizationId, request.body);
    return reply.status(201).send({ data: result });
  } catch (error) {
    if (error instanceof NotFoundError) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: error.message } });
    }
    if (error instanceof ValidationError) {
      return reply
        .status(400)
        .send({ error: { code: "VALIDATION_ERROR", message: error.message } });
    }
    request.log.error(error, "Unexpected error in transaction create handler");
    return reply
      .status(500)
      .send({ error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred" } });
  }
};
```

Custom error classes live in `packages/shared-types/src/errors.ts`: `NotFoundError`, `ValidationError`, `ForbiddenError`, `ConflictError`.

### Organization ID is always from the JWT

```typescript
// ✅ Correct — always use JWT claim
const { organizationId, userId } = request.user;

// ❌ Never trust org from request body or params for write operations
const { organizationId } = request.body; // NEVER
```

### Database access pattern

Services use a repository layer. Never query Prisma directly in a route handler or service:

```typescript
// ✅ Route handler → Service → Repository
class TransactionRepository {
  async findById(id: string, organizationId: string): Promise<Transaction | null> {
    return this.db.transaction.findFirst({
      where: { id, organizationId },
    });
  }
}
```

### Event publishing

Always use the `@wford26/event-contracts` helpers — never construct events manually:

```typescript
import { createEvent } from "@wford26/event-contracts";

await eventPublisher.publish(
  createEvent("transaction.created", orgId, userId, {
    transactionId: tx.id,
    accountId: tx.accountId,
    amount: tx.amount,
    date: tx.date.toISOString(),
    description: tx.description ?? null,
    merchantRaw: tx.merchantRaw ?? null,
    categoryId: tx.categoryId ?? null,
  })
);
```

---

## Commit Message Convention

All commits follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(scope): <short description>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`

**Scope:** the service or package name — `ledger-service`, `identity-service`, `web`, `shared-types`, `infra`

**Examples:**

```
feat(ledger-service): add CSV import pipeline with duplicate detection (T-053)
fix(identity-service): prevent refresh token reuse after rotation (T-021)
test(ledger-service): add integration tests for transaction review states (T-054)
chore: release 2026.03.25
docs: update architecture doc with Azure Stage 2 infrastructure
```

**Copilot should:**

- Always suggest commit messages following this convention.
- Include the task ID in parentheses at the end when the commit relates to a specific task: `(T-XXX)`.
- Use `feat` for new functionality, `fix` for bugs, `test` for test-only changes, `chore` for version bumps and maintenance.

---

## Pull Request Checklist

When Copilot helps draft or review a PR, verify these items are addressed:

- [ ] Version in root `package.json` updated to `YYYY.MM.DD` (if this is a release PR)
- [ ] `CHANGELOG.md` updated with entries under `## [Unreleased]`
- [ ] New or changed routes have integration tests
- [ ] New or changed service functions have unit tests
- [ ] New or changed React components have render + interaction tests
- [ ] No raw SQL — only Prisma ORM calls
- [ ] No `organizationId` read from request body or params for write operations
- [ ] Zod schema added or updated for any new request shape
- [ ] Event published using `@wford26/event-contracts` if applicable
- [ ] No secrets hardcoded — all config via environment variables
- [ ] No `any` types introduced (use `unknown` + type guard if unavoidable)
- [ ] Dockerfile updated if new environment variables were added
- [ ] `docs/architecture.md` updated if a new service, route, or database table was added

---

## Azure-Specific Patterns

### Blob Storage (documents-service)

Use Azure Blob SAS tokens for all file access — never public blob URLs.

```typescript
// Generate a SAS upload URL
const sasUrl = await blobService.generateSasUrl({
  containerName: process.env.STORAGE_CONTAINER!,
  blobName: `${orgId}/${documentId}/${filename}`,
  permissions: BlobSASPermissions.parse("cw"), // create + write
  expiresOn: new Date(Date.now() + 15 * 60 * 1000), // 15 min
});

// Generate a SAS read URL
const readUrl = await blobService.generateSasUrl({
  containerName: process.env.STORAGE_CONTAINER!,
  blobName: document.s3Key,
  permissions: BlobSASPermissions.parse("r"),
  expiresOn: new Date(Date.now() + 5 * 60 * 1000), // 5 min
});
```

Blob keys always follow the pattern: `{organizationId}/{documentId}/{filename}` — this enforces org-level isolation at the storage layer.

### Environment-aware storage client

The documents-service should use MinIO (S3-compatible) locally and Azure Blob SDK in production, abstracted behind a common interface:

```typescript
interface StorageClient {
  generateUploadUrl(key: string, expiresInMs: number): Promise<string>;
  generateReadUrl(key: string, expiresInMs: number): Promise<string>;
  delete(key: string): Promise<void>;
}
```

Swap the implementation based on `NODE_ENV` or a `STORAGE_PROVIDER=azure|minio` env var.

### Redis TLS in Azure

Azure Cache for Redis requires TLS. Use `rediss://` (double-s) in the connection string and ensure the Redis client has `tls: {}` enabled:

```typescript
const redis = new Redis(process.env.REDIS_URL!, {
  tls: process.env.NODE_ENV === "production" ? {} : undefined,
});
```

---

## What Copilot Should Never Do

- Never introduce `console.log` in production code — use `request.log` (Fastify's pino logger) or `fastify.log`
- Never add a route without a corresponding Zod input schema
- Never read `organizationId` from the request body or URL params for mutation operations
- Never use public blob URLs — always generate SAS tokens
- Never commit secrets, connection strings, or API keys
- Never add a new npm dependency without checking if it's already available in an existing package (avoid duplication across services)
- Never skip the changelog entry after a change is approved
- Never define domain types locally in a service — they belong in `@wford26/shared-types`
- Never write raw SQL — Prisma ORM only, except for the initial migration SQL in `prisma/migrations/`
