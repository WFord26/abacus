# Changelog

All notable changes to Abacus are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: CalVer YYYY.MM.DD

## [Unreleased]

### Added

- T-020: Identity service core routes for `/me`, organizations, and membership management with owner safeguards and integration coverage.
- T-021: Identity service auth routes for register, login, refresh, and logout with rotating refresh tokens and rate-limited login attempts.
- T-022: Identity service multi-org membership lifecycle with invite acceptance or decline, org switching, and role-aware owner versus admin permissions.
- T-031: API gateway identity-service routing coverage for auth, `/me`, and organization membership requests.
- T-041: Web auth and onboarding flow for sign-in, registration, first-run workspace setup, and org-aware session handoff.
- T-042: Authenticated web shell with responsive sidebar, org switcher, pending-invite context, and account controls tied to live org memberships.
- T-050: Ledger service accounts CRUD with default chart seeding, balance calculation, soft delete safeguards, and integration coverage.
- T-051: Ledger service category CRUD with one-time default seeding, nested tree responses, parent validation, and delete conflict safeguards.
- T-052: Ledger service transaction CRUD with paginated filters, soft delete behavior, and Redis-stream event publishing on create and update.
- T-053: Ledger service CSV import pipeline with multipart upload, bank-format detection, duplicate flagging, and persisted import-batch row results.
- T-054: Ledger service transaction review workflow with explicit review-status updates, a review queue shortcut, and event emission on status changes.
- T-060: Web accounts settings page with live balance loading, optimistic create/delete mutations, modal editing, and delete failure toasts.
- T-061: Web categories settings page with nested tree controls, a constrained 12-color palette, expand-collapse branches, and delete conflict toasts.
- T-062: Web transactions workspace with URL-backed filters, a virtualized TanStack table, inline category and review controls, bulk categorize, manual entry, and CSV import summaries.
- T-080: Documents service upload pipeline with presigned S3-compatible URLs, pending-to-finalized metadata persistence, signed downloads, delete cleanup, and `receipt.uploaded` events.
- T-081: Documents service transaction-linking routes with org-aware ledger validation and signed document retrieval by transaction.
- T-082: Web receipts workspace with thumbnail previews, unlinked filtering, XHR upload progress, mobile capture support, and transaction-row receipt attachment.
- T-090: Web dashboard summary cards with five-minute refreshes, ledger-backed month metrics, account balance snapshots, and recent transaction activity.
- T-091: Web CSV import wizard with upload, preview, column mapping memory, date-format detection, staged import progress, and result drilldowns.
- T-100: Reporting service event subscriber with Redis consumer-group startup, idempotent expense aggregate rebuilds, and unit coverage for handler and failure paths.
- T-101: Reporting service `GET /reports/pnl` route with authenticated period validation, aggregate-backed expense rollups, and empty-period handling.
- Identity bootstrap: one-time first-admin setup endpoints for fresh environments via `/api/v1/auth/bootstrap-status` and `/api/v1/auth/bootstrap-admin`.

### Changed

- Architecture: drafted the missing `T-041` and `T-042` task specs for web auth onboarding and the authenticated shell layout.
- API docs: updated `docs/api.md` to reflect the gateway-backed `/api/v1` routes and the implemented identity endpoints.

### Fixed

- Stabilization: made `apps/web` typechecking self-sufficient by generating Next build artifacts before `tsc`, fixed the identity-service `start` script to use the actual build output path, and corrected the local Docker Compose stack to use a runnable MinIO image plus conflict-free PostgreSQL and Redis host ports.
- Developer experience: root `npm run dev` now starts the implemented local stack by reading the root `.env` and launching identity, API gateway, and web together.
- Web auth: fresh environments now detect bootstrap mode and route users into a dedicated first-admin creation screen automatically.
- Web shell: organization hydration now shows an explicit syncing state instead of flashing empty-workspace UI, and organization switches no longer force a route refresh.
- Local stack: the root launcher and env templates now include the ledger service so `/api/v1/accounts` can be exercised through the gateway.

### Removed

## [2026.03.25.1]

### Added

- T-012: Auth SDK package with JWT helpers, Fastify auth plugin, and role-based pre-handler guard exports.
- T-013: Prisma service scaffolding for identity, ledger, documents, reporting, and invoicing services, including schema files, initial SQL migrations, and Fastify database plugins.
- T-030: API gateway scaffold with Fastify security plugins, normalized error handling, health checks, and service proxy routing.
- T-040: Next.js web scaffold with App Router, React Query, auth context, theme provider, and responsive shell layouts.

### Changed

- T-003: Re-enabled the Husky pre-commit hook so lint-staged runs before commits again.
- T-003: Updated the Husky pre-commit hook to use `npx --yes pnpm` so commits work even when `pnpm` is not on `PATH`.

### Fixed

### Removed

## [2026.03.25]

### Added

- T-001: Monorepo scaffold with pnpm workspaces, Turborepo, root tooling files, and placeholder app and package manifests.
- T-002: Shared TypeScript config package with strict base, Node, and Next.js configs wired into the workspace apps.
- T-003: Shared ESLint and Prettier configuration, Husky pre-commit hook, and lint-staged setup at the repo root.
- T-004: Local Docker Compose development stack for PostgreSQL, Redis, MinIO, and MailHog with named volumes and health checks.
- T-005: GitHub Actions workflows for CI, package publishing, web deployment, and service image deployment.
- T-006: Design tokens package, shared UI package exports, and web Tailwind preset integration.
- T-010: Shared cross-service TypeScript contracts for identity, ledger, documents, reporting, invoicing, and API responses.
- T-011: Event contract package with typed Abacus event payloads and a `createEvent` helper for Redis Stream publishers.
- Release tooling: Added a release manager script that generates change-tracking files, bumps the root release version with CalVer, and prepares backend service semver bumps separately.

### Changed

- Release tooling: Backend service app manifests now use semantic versioning instead of the root CalVer release version.
