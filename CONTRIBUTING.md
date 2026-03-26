# Contributing To Abacus

Abacus is developed as a self-hostable accounting platform under the GNU Affero General Public License, version 3 or any later version (`AGPL-3.0-or-later`).

## Before You Start

- Read the project overview in [README.md](./README.md), the setup guide in [docs/setup.md](./docs/setup.md), and the architecture guide in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).
- Prefer issues or discussions for large feature proposals, architectural changes, and licensing-sensitive questions before investing in a large implementation.
- Keep changes scoped, tested, and documented when behavior changes.

## Contribution Terms

Unless explicitly stated otherwise in writing, any contribution intentionally submitted for inclusion in this repository is licensed under `AGPL-3.0-or-later` as part of the project.

By contributing, you represent that:

- you have the right to submit the contribution
- the contribution may be distributed under the repository license
- you are not knowingly adding code, assets, or dependencies that conflict with the repository's license terms

## Project Boundary

This repository is the current core Abacus product. Contributions in this repo should strengthen the self-hostable application, shared packages, documentation, local development tooling, and deployment assets that make the product runnable by others.

Please do not add:

- proprietary or hosted-only code paths to this repository
- private operational tooling intended only for a managed service
- branding changes that assume trademark rights not granted by the project

If a change introduces a future commercial or hosted-service concern, prefer a documented service boundary or a separate repository rather than mixing closed code into this repo.

## Dependencies And Assets

When adding a new dependency or external asset:

- confirm its license is compatible with `AGPL-3.0-or-later`
- keep attribution or notice requirements intact
- call out any licensing implications in the pull request description

## Trademarks

Code contributions are accepted under the repository license, but trademark rights are reserved separately. Review [TRADEMARKS.md](./TRADEMARKS.md) before renaming forks, reusing logos, or shipping branded derivatives.
