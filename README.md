# Swipelux public docs

This repository contains the Mintlify source for Swipelux Integration Docs, the generated API v3 reference, and the compliance and onboarding Knowledge Base.

## Requirements

- Node.js 24.15.0
- npm

The repository pins Mintlify CLI 4.2.775 as a development dependency.

## Set up the repository

```bash
nvm use
npm install
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

The complete check prepares no source data. Generate `openapi.json` first when the source contract changes.

## Deploy

Mintlify production builds use the `main` branch. Work on a feature branch, verify the documentation locally, and merge the reviewed changes into `main` to deploy them.
