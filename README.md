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
npm install
```

`nvm install` installs Node.js 24.15.0 when needed, and `nvm use` activates it in your current shell. If `npm --version` does not print `11.12.1`, install the pinned npm release before installing dependencies:

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

`npm run verify:docs` and `npm run check` read the committed phase from
`docs/redirect-verification-phase.json`. It is `current` during the rebuild,
when every redirect inventory entry remains `verified: false`. In Task 11,
after the preview redirect checks pass, change every inventory entry to
`verified: true` and set the marker's `phase` to `final` in the same commit.
No package-script change is required.

For diagnostics, you can override the committed marker explicitly:

```bash
npm run verify:docs -- --redirect-phase=final
```

The complete check prepares no source data. Generate `openapi.json` first when the source contract changes. During the staged rebuild, Tasks 2 and 3 add the `verify:openapi` and `verify:docs` implementations. Until then, use `npm test` for the runnable Task 1 checks.

## Deploy

Mintlify production builds use the `main` branch. Work on a feature branch, verify the documentation locally, and merge the reviewed changes into `main` to deploy them.
