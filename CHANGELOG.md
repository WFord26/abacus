# Changelog

All notable changes to Abacus are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: CalVer YYYY.MM.DD

## [Unreleased]

### Added

### Changed

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
