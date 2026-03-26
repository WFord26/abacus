# Abacus

Abacus is a lightweight accounting and expense-tracking platform for small businesses. The current MVP combines a Next.js web app with backend services for identity, ledger, documents, reporting, and invoicing behind a single API gateway.

## What The App Supports Today

- Email/password auth, bootstrap admin creation, email verification, magic-link sign-in, and multi-workspace membership flows
- Dashboard reporting with financial summaries, recent activity, and reporting-service-backed aggregates
- Transaction management with manual entry, CSV import, review queues, bulk categorization, and chart-of-accounts tooling
- Receipt and document uploads with signed object-storage access and transaction linking
- Customer and invoice workflows with PDF generation and invoice payment handoff into the ledger
- Workspace administration for invites, membership roles, and workspace profile management

## Architecture At A Glance

- `apps/web`: Next.js application for auth, dashboard, transactions, receipts, reports, customers, invoices, and settings
- `apps/api-gateway`: Fastify gateway that fronts the internal services for the web client
- `apps/identity-service`: authentication, sessions, organizations, memberships, invites, and email flows
- `apps/ledger-service`: accounts, categories, transactions, reconciliation-oriented review, and CSV imports
- `apps/documents-service`: document metadata, presigned uploads, signed downloads, and transaction attachments
- `apps/reporting-service`: report aggregates, dashboard rollups, and export jobs
- `apps/invoicing-service`: customers, invoices, payment lifecycle, and PDF generation
- `infrastructure/docker`: local PostgreSQL, Redis, MinIO, and MailHog for development
- `infrastructure/bicep`: Azure deployment scaffold for backend infrastructure

## Repository Layout

```text
apps/              Runtime applications and services
packages/          Shared TypeScript config, contracts, UI, and auth packages
docs/              Product, API, architecture, and setup documentation
infrastructure/    Docker and Azure deployment assets
scripts/           Local development and release helper scripts
```

## Documentation

- [Local setup](./docs/setup.md)
- [API reference](./docs/api.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Licensing](./docs/licensing.md)
- [Contributing](./CONTRIBUTING.md)
- [Trademark note](./TRADEMARKS.md)
- [Changelog](./CHANGELOG.md)

## License

Abacus is licensed under the GNU Affero General Public License, version 3 or any later version (`AGPL-3.0-or-later`). The current repository is the self-hostable core product, including the application code, shared packages, documentation, and deployment assets.

If you modify Abacus and make that modified version available to users over a network, the AGPL requires you to make the corresponding source available to those users as well. See [LICENSE](./LICENSE), [docs/licensing.md](./docs/licensing.md), and [CONTRIBUTING.md](./CONTRIBUTING.md) for the project policy.

The `Abacus` name, logos, and related brand assets are not licensed under the AGPL. See [TRADEMARKS.md](./TRADEMARKS.md).

## Development Workflow

Abacus is a pnpm workspace powered by Turborepo. For local bootstrapping, service startup, environment details, and deployment scaffold notes, use the dedicated setup guide in [docs/setup.md](./docs/setup.md).

Common verification commands:

```bash
npx --yes pnpm build
npx --yes pnpm typecheck
npx --yes pnpm test
```
