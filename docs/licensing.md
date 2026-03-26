# Abacus Licensing

This document explains how licensing works in the Abacus repository and how we intend to keep the project developable by others while preserving a clean path for future hosted-service differentiation.

## Repository License

Except where a file or directory says otherwise, the contents of this repository are licensed under the GNU Affero General Public License, version 3 or any later version (`AGPL-3.0-or-later`).

The canonical license text lives in [LICENSE](../LICENSE).

## What Is In Scope Today

Today, this repository is the self-hostable core Abacus product. That includes:

- `apps/`
- `packages/`
- `docs/`
- `infrastructure/docker/`
- `infrastructure/bicep/`
- `infrastructure/scripts/`
- root-level scripts and configuration needed to build, run, test, and deploy the core product

At the moment, there is no internal open-core split inside this repository. The current app, service, shared-package, and infrastructure folders are all treated as part of the core product others should be able to study, run, and improve.

## Trademark Rights

The AGPL covers copyright licensing for the repository contents. Trademark rights are reserved separately.

See [TRADEMARKS.md](../TRADEMARKS.md) for the project trademark note.

## Why AGPL For Abacus

Abacus is intended to remain developable and self-hostable by others. `AGPL-3.0-or-later` supports that goal while also requiring people who modify the software and make it available for remote network use to provide the corresponding source code for that modified version.

In practical terms, if someone runs a modified version of Abacus as a networked service, they should also make the corresponding source for that modified version available to the users interacting with it.

## Guidance For Future Commercial Or Hosted-Only Work

If Abacus later grows a managed SaaS offering, the cleanest way to preserve this repository as the open core is to keep hosted-only or commercial-only additions outside this repository unless they are meant to be part of the self-hostable product.

Good candidates to keep outside this repository:

- internal admin tooling used only by the hosted service operator
- tenant operations, billing, or support back-office systems
- private deployment automation tied to a managed service business
- proprietary integrations or add-ons that are intentionally not part of the self-hostable core

Good candidates to keep inside this repository:

- end-user product features needed for a complete self-hosted Abacus deployment
- shared domain models, migrations, event contracts, and APIs used by the product itself
- local development and deployment assets required to run or evaluate the core product
- infrastructure templates that are part of the documented deployment path for the core app

When in doubt, prefer one of these patterns:

- keep the feature in this repo if it is part of the product a third party should be able to self-host
- move the feature to a separate repo if it is operated only by the managed service provider
- use a stable service boundary rather than mixing closed and AGPL code inside the same runtime

## Contributor Guidance

Contributions to this repository are accepted for the AGPL-licensed core product. Contributors should assume that code merged here is intended to remain part of the self-hostable core unless maintainers clearly document an exception.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the current contribution terms.

## Operational Guidance

Before offering Abacus publicly over a network, maintainers should make sure users can find the corresponding source for the running version. For a web product, that usually means exposing a visible source link in the UI, docs, or service footer that points to the relevant source repository or release archive.

This document is project policy and engineering guidance, not legal advice.
