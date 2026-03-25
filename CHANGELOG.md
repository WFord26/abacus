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

### Changed

- Architecture: drafted the missing `T-041` and `T-042` task specs for web auth onboarding and the authenticated shell layout.

### Fixed

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
