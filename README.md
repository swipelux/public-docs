# Swipelux public docs

This repository contains the Mintlify source for Swipelux Integration Docs, the generated API v3 reference, and the compliance and onboarding Knowledge Base.

## Prerequisites

- nvm
- Node.js 24.15.0
- npm 11.12.1

This repository requires nvm so `.nvmrc` can select the supported Node.js release. Run `nvm use` whenever you open a new shell in the repository. The repository also pins npm 11.12.1 and Mintlify CLI 4.2.775.

## Set up the repository

```bash
nvm install
nvm use
npm --version
npm ci
```

`nvm install` installs Node.js 24.15.0 when needed, and `nvm use` activates it in your current shell. If `npm --version` does not print `11.12.1`, install the pinned npm release and run `npm ci` again:

```bash
npm install --global npm@11.12.1
```

## Prepare the OpenAPI reference

The source contract is authoritative for technical behavior. Generate the repository-local public contract from the approved source file:

```bash
npm run prepare:openapi -- "/absolute/path/to/api-source.json"
```

The preparation step verifies the approved source hash before writing `openapi.json` and its verification artifacts. Do not edit generated OpenAPI artifacts by hand.

## Preview and verify locally

Start the local Mintlify preview:

```bash
npx mint dev
```

Run the focused repository tests:

```bash
npm test
```

Run the complete documentation verification suite before handoff:

```bash
npm run check
```

`npm run check` runs the repository tests, verifies the generated OpenAPI and documentation artifacts, validates the Mintlify site, checks links, and runs accessibility checks. It prepares no source data, so regenerate `openapi.json` first when the source contract changes.

Redirect verification is complete. The committed phase in `docs/redirect-verification-phase.json` is `final`, and all 62 redirects in `docs/redirect-inventory.json` are verified. `npm run check` validates the committed marker and inventory.

## CI and production deployment

GitHub Actions runs `npm run check` for every pull request and every push to `main` through `.github/workflows/docs.yml`.

The repository must first be connected to Mintlify through the GitHub App. The production deployment branch is `main`, and the Mintlify dashboard deployment branch must match `main`; use Mintlify's [Check deployment branch](https://www.mintlify.com/docs/deploy/github#check-deployment-branch) guidance to confirm the setting. Once connected and after local and CI verification, merging to `main` triggers Mintlify production deployment.

## Production release gate

Automated verification does not constitute legal approval. Rows marked `review-required` in `docs/content-migration-ledger.md` still require accountable legal/compliance approval before production release. The known jurisdiction-source contradictions remain a production-release blocker until resolved.
