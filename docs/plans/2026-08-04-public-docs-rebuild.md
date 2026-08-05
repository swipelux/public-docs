# Swipelux Public Docs Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Mintlify starter with a validated Swipelux public documentation site containing Integration Docs, an OpenAPI-generated v3 API Reference, and a migrated compliance/onboarding Knowledge Base.

**Architecture:** Keep Mintlify as a static MDX/docs.json repository. Generate a public `openapi.json` from the supplied authoritative contract through a deterministic preparation script, then use stable `x-mint.href` values for deep links. Treat narrative guides and policy pages as hand-written MDX, backed by static verification, migration/redirect inventories, and Mintlify CLI checks.

**Tech Stack:** Mintlify CLI 4.2.775, Node.js 24.15.0, OpenAPI 3.1 JSON, MDX, built-in `node:test`, GitHub Actions.

---

## Source material

- Approved design: `docs/specs/2026-08-04-public-docs-rebuild-design.md`
- Authoritative API input: `/Users/andry/Downloads/api-1 (23).json`
- API input SHA-256: `ac2cb435a7099da53e6028bca98a4d57f0a1bf684cddfe64c438106a2997e3a7`
- Policy source: `/Users/andry/brain/swipelux/docs-new`, fetched `origin/main` commit `b4c9b5b7101ec03e01424259f58a5c8763ea489b`
- Brand symbol: `/Users/andry/brain/swipelux/website/app/icon.svg`
- Branch: `codex/public-docs-rebuild`
- Worktree: `/Users/andry/brain/swipelux/.worktrees/public-docs-rebuild`

## File structure

### Project and verification

- `AGENTS.md`, `CLAUDE.md` — synchronized project rules and source-of-truth policy.
- `.gitignore`, `.mintignore`, `.nvmrc`, `package.json`, `package-lock.json` — local/CI toolchain.
- `scripts/lib/openapi.mjs` — pure OpenAPI preparation and comparison functions.
- `scripts/prepare-openapi.mjs` — CLI that creates the public OpenAPI artifacts.
- `scripts/lib/docs-validation.mjs` — pure MDX, navigation, redirect, and source-coverage checks.
- `scripts/verify-openapi.mjs`, `scripts/verify-docs.mjs` — repository verification CLIs.
- `tests/*.test.mjs` — built-in Node tests.
- `.github/workflows/docs.yml` — required CI checks.

### Generated/reference artifacts

- `openapi.json` — Mintlify-ready v3 public contract.
- `openapi-provenance.json` — input hash and exact transformations.
- `openapi-coverage.json` — operations, webhook names, stable hrefs, and schema hashes.

### Site and content

- `docs.json` — three-tab navigation, redirects, branding, disabled playground.
- `index.mdx` — root landing page.
- `integration/**/*.mdx` — 22 task-oriented integration pages.
- `knowledge-base/compliance/*.mdx` — 10 compliance pages.
- `knowledge-base/business-onboarding/*.mdx` — 6 business onboarding pages.
- `knowledge-base/individual-onboarding/*.mdx` — 4 individual onboarding pages.
- `docs/content-migration-ledger.md` — source-page/section disposition and legal review register.
- `docs/redirect-inventory.json` — exact legacy route mapping and verification status.
- `logo/light.svg`, `logo/dark.svg`, `favicon.svg` — approved Swipelux symbol assets.

---

### Task 1: Establish repository rules and pinned tooling

**Files:**
- Modify: `docs/specs/2026-08-04-public-docs-rebuild-design.md`
- Modify: `AGENTS.md`
- Create: `CLAUDE.md`
- Create: `.gitignore`
- Modify: `.mintignore`
- Create: `.nvmrc`
- Create: `package.json`
- Create: `tests/project-structure.test.mjs`
- Modify: `README.md`
- Generate: `package-lock.json`

- [ ] **Step 1: Write the failing project-structure test**

```js
// tests/project-structure.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("pins the supported Node and Mintlify versions", () => {
  assert.equal(read(".nvmrc").trim(), "24.15.0");
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.devDependencies.mint, "4.2.775");
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
});

test("keeps Codex and Claude repository instructions synchronized", () => {
  assert.ok(existsSync("AGENTS.md"));
  assert.ok(existsSync("CLAUDE.md"));
  for (const file of ["AGENTS.md", "CLAUDE.md"]) {
    const text = read(file);
    assert.match(text, /OpenAPI.*authoritative/i);
    assert.match(text, /v1.*v2.*must not/i);
    assert.match(text, /deployment branch.*main/i);
  }
});

test("ignores local agent and build artifacts", () => {
  const ignore = read(".gitignore");
  for (const entry of ["node_modules/", ".agents/", "skills-lock.json", ".DS_Store"]) {
    assert.ok(ignore.includes(entry), `missing ${entry}`);
  }
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH node --test tests/project-structure.test.mjs
```

Expected: FAIL because `.nvmrc`, `package.json`, `CLAUDE.md`, and `.gitignore` do not exist.

- [ ] **Step 3: Add the pinned project configuration**

Create `.nvmrc`:

```text
24.15.0
```

Create `package.json`:

```json
{
  "name": "@swipelux/public-docs",
  "private": true,
  "scripts": {
    "test": "node --test tests/*.test.mjs",
    "prepare:openapi": "node scripts/prepare-openapi.mjs",
    "verify:openapi": "node scripts/verify-openapi.mjs",
    "verify:docs": "node scripts/verify-docs.mjs",
    "validate": "mint validate --telemetry=false",
    "links": "mint broken-links --check-anchors --check-redirects --telemetry=false",
    "a11y": "mint a11y --telemetry=false",
    "check": "npm test && npm run verify:openapi && npm run verify:docs && npm run validate && npm run links && npm run a11y"
  },
  "devDependencies": {
    "mint": "4.2.775"
  }
}
```

Create `.gitignore` with:

```gitignore
.DS_Store
.agents/
skills-lock.json
node_modules/
.mintlify/
```

Update `.mintignore` to exclude `docs/`, `scripts/`, `tests/`, `.github/`, and local agent/build files while leaving `openapi.json` and published MDX visible to Mintlify.

Replace the starter `AGENTS.md` and create a synchronized `CLAUDE.md` containing these exact rule sections:

```markdown
# Swipelux public docs

## Source of truth
- `/Users/andry/Downloads/api-1 (23).json` is authoritative for technical behavior.
- `docs-new` `origin/main` commit `b4c9b5b7101ec03e01424259f58a5c8763ea489b` is the policy-content source.

## Content boundaries
- Publish only API v3. v1 and v2 must not appear in published content.
- Do not invent legal, webhook-security, retry, permission, or availability claims.
- Keep Terms-of-Service pages out of the approved initial scope.

## Style
- Use active voice and second person.
- Use sentence-case headings and concise sentences.
- Use root-relative internal links and language-tagged code blocks.

## Verification
- Use Node.js 24.15.0 and Mintlify CLI 4.2.775.
- Run `npm run check` before handoff.
- Mintlify production builds from `main`.
```

Update the spec status to `Approved for implementation`. Rewrite `README.md` with local setup, preparation, validation, and deployment-branch instructions.

- [ ] **Step 4: Install the pinned dependency and generate the lockfile**

Run:

```bash
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH npm install
```

Expected: exit 0 and `package-lock.json` records `mint@4.2.775`.

- [ ] **Step 5: Run the project-structure test and verify GREEN**

Run the Step 2 command again.

Expected: 3 tests pass.

- [ ] **Step 6: Commit**

```bash
git add .gitignore .mintignore .nvmrc package.json package-lock.json AGENTS.md CLAUDE.md README.md tests/project-structure.test.mjs docs/specs/2026-08-04-public-docs-rebuild-design.md
git commit -m "chore: configure public docs repository"
```

---

### Task 2: Build the deterministic OpenAPI preparation pipeline

**Files:**
- Create: `scripts/lib/openapi.mjs`
- Create: `scripts/prepare-openapi.mjs`
- Create: `scripts/verify-openapi.mjs`
- Create: `tests/openapi-preparation.test.mjs`
- Generate: `openapi.json`
- Generate: `openapi-provenance.json`
- Generate: `openapi-coverage.json`

- [ ] **Step 1: Write failing OpenAPI unit tests**

The tests must import these public functions:

```js
import {
  prepareOpenApi,
  buildCoverage,
  compareCoverage,
  canonicalHash,
  SOURCE_SHA256
} from "../scripts/lib/openapi.mjs";
```

Cover these exact behaviors:

```js
test("rejects a source hash mismatch", () => {
  assert.throws(() => prepareOpenApi(fixture, "wrong"), /source SHA-256/i);
});

test("rejects non-v3 HTTP paths", () => {
  const bad = structuredClone(fixture);
  bad.paths["/v2/customers"] = { get: operation("legacy") };
  assert.throws(() => prepareOpenApi(bad, SOURCE_SHA256), /non-v3 path/i);
});

test("removes only legacy customer webhook branches", () => {
  const { spec, transformations } = prepareOpenApi(fixture, SOURCE_SHA256);
  assert.equal(spec.webhooks["customer.created"].post.requestBody.content["application/json"].schema.oneOf, undefined);
  assert.equal(spec.webhooks["customer.created"].post.requestBody.content["application/json"].examples.legacy, undefined);
  assert.ok(spec.webhooks["customer.created"].post.requestBody.content["application/json"].examples.v3);
  assert.ok(transformations.every((item) => item.pointer.startsWith("/webhooks/") || item.pointer.startsWith("/components/securitySchemes/")));
});

test("publishes only X-API-Key authentication", () => {
  const { spec } = prepareOpenApi(fixture, SOURCE_SHA256);
  assert.deepEqual(Object.keys(spec.components.securitySchemes), ["apiKey"]);
});

test("assigns stable x-mint hrefs and complete coverage", () => {
  const { spec } = prepareOpenApi(fixture, SOURCE_SHA256);
  const coverage = buildCoverage(spec);
  assert.equal(coverage.operations[0].href.startsWith("/api-reference/"), true);
  assert.doesNotThrow(() => compareCoverage(coverage, buildCoverage(spec)));
});
```

The fixture must include one v3 path, customer-created/updated legacy+v3 webhook branches, all three security schemes, and one component `$ref`.

- [ ] **Step 2: Run the tests and verify RED**

```bash
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH node --test tests/openapi-preparation.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/lib/openapi.mjs`.

- [ ] **Step 3: Implement the pure OpenAPI functions**

`scripts/lib/openapi.mjs` must export the following exact API:

```ts
type CoverageEntry = { name?: string; method?: string; path?: string; operationId: string; href: string; hash: string };
type Coverage = { operations: CoverageEntry[]; webhooks: CoverageEntry[]; components: Array<{ name: string; hash: string }> };
type Transformation = { pointer: string; beforeHash: string; afterHash: string | null; reason: string };
type PreparationResult = { spec: object; transformations: Transformation[]; sourceCoverage: Coverage; preparedCoverage: Coverage };

export const SOURCE_SHA256 = "ac2cb435a7099da53e6028bca98a4d57f0a1bf684cddfe64c438106a2997e3a7";
export const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);
export declare function canonicalHash(value: unknown): string;
export declare function operationSlug(tag: string, operationId: string): string;
export declare function buildCoverage(spec: object): Coverage;
export declare function compareCoverage(expected: Coverage, actual: Coverage): void;
export declare function compareSourceToPrepared(source: object, prepared: object, transformations: Transformation[]): void;
export declare function prepareOpenApi(source: object, actualSha: string): PreparationResult;
```

Implement those bodies with these exact algorithms:

- `canonicalHash`: recursively sort plain-object keys, preserve array order, serialize with `JSON.stringify`, and return a lowercase SHA-256 hex digest.
- `operationSlug`: insert hyphens at camelCase boundaries, replace non-alphanumeric runs with one hyphen, trim hyphens, and lowercase the result.
- `buildCoverage`: return sorted arrays for operations (`method`, `path`, `operationId`, `href`, `hash`), webhooks (`name`, `operationId`, `href`, `hash`), and components (`name`, `hash`).
- `compareCoverage`: deep-compare the canonical hashes of the three sorted arrays and throw a message naming the changed collection.
- `compareSourceToPrepared`: prove the exact path-method-operationId set, servers, parameters, response codes, and component names are unchanged; permit differences only at transformation pointers recorded by `prepareOpenApi`.
- `prepareOpenApi`: verify `actualSha`, clone with `structuredClone`, validate the source, apply the four transformations below, validate the prepared document, then return `{ spec, transformations, sourceCoverage, preparedCoverage }`.

`prepareOpenApi` must perform only these unconditional transformations:

1. Delete `components.securitySchemes.serviceToken` and `.uploadToken`.
2. For `customer.created` and `customer.updated`, replace the webhook schema with `schema.oneOf[1]` and delete `examples.legacy`.
3. Add `x-mint.href` to every HTTP operation using `/api-reference/<tag-slug>/<operation-slug>`.
4. Add stable webhook href metadata when Mintlify accepts it; otherwise record fallback hrefs in coverage without altering unsupported fields.

It must reject non-v3 paths, missing operation IDs, duplicate generated hrefs, dangling internal `$ref`s, and any unexpected transformation pointer.

- [ ] **Step 4: Implement the preparation and verification CLIs**

`scripts/prepare-openapi.mjs` usage:

```bash
node scripts/prepare-openapi.mjs "/absolute/path/to/source.json"
```

It must verify the byte-level source SHA-256, write formatted `openapi.json`, `openapi-provenance.json`, and `openapi-coverage.json`, then print:

```text
Prepared OpenAPI: 49 paths, 74 operations, 87 schemas, 12 webhooks
```

`scripts/verify-openapi.mjs` must load all three artifacts, verify their hashes and semantic manifest, enforce v3-only paths, and print:

```text
OpenAPI verification passed: 74 operations, 12 webhooks
```

- [ ] **Step 5: Run tests and verify GREEN**

Run the Step 2 command.

Expected: all OpenAPI preparation tests pass.

- [ ] **Step 6: Generate the real artifacts**

```bash
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH npm run prepare:openapi -- "/Users/andry/Downloads/api-1 (23).json"
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH npm run verify:openapi
```

Expected: 49 paths, 74 operations, 87 schemas, and 12 webhooks; no `/v1/` or `/v2/` paths; no legacy webhook examples.

- [ ] **Step 7: Commit**

```bash
git add scripts tests/openapi-preparation.test.mjs openapi.json openapi-provenance.json openapi-coverage.json
git commit -m "feat: prepare the public v3 OpenAPI reference"
```

---

### Task 3: Add static documentation guards and migration inventories

**Files:**
- Create: `scripts/lib/docs-validation.mjs`
- Create: `scripts/verify-docs.mjs`
- Create: `tests/docs-validation.test.mjs`
- Create: `tests/helpers/content.mjs`
- Create: `docs/content-migration-ledger.md`
- Create: `docs/redirect-inventory.json`
- Create: `docs/redirect-verification-phase.json`

- [ ] **Step 1: Write failing validation tests**

Define and test these exports:

```js
import {
  validateFrontmatter,
  validatePublishedText,
  validateNavigation,
  validateRedirectInventory,
  validateMigrationCoverage
} from "../scripts/lib/docs-validation.mjs";
```

Tests must prove that validation rejects:

- Missing `title` or `description` frontmatter.
- `/v1/`, `/v2/`, `wallet.swipelux.com`, `Mintlify Starter Kit`, real-looking `sk.live.*`/`sk.sbx.*` values, and untagged code fences in published MDX.
- Navigation entries whose files do not exist.
- Redirect destinations missing from navigation.
- A current source page absent from the migration ledger.

Tests must also prove version words are allowed under `docs/specs/` and `docs/plans/` because those paths are excluded from publication.

- [ ] **Step 2: Run the tests and verify RED**

```bash
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH node --test tests/docs-validation.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/lib/docs-validation.mjs`.

- [ ] **Step 3: Implement the validation library and CLI**

`scripts/verify-docs.mjs` must scan only published surfaces:

```text
index.mdx
integration/**/*.mdx
knowledge-base/**/*.mdx
docs.json
openapi.json examples/vendor extensions
```

It must exclude `docs/`, `tests/`, `scripts/`, `.agents/`, and dependencies. It must verify the complete required-page list from the approved navigation skeleton and print a deterministic failure list.

Commit `docs/redirect-verification-phase.json` with `{"phase":"current"}`. With no CLI override, `verify:docs` must read this marker. Accept only the diagnostic override `--redirect-phase=current|final`; reject every other argument form before validation begins.

- [ ] **Step 4: Create the redirect inventory**

`docs/redirect-inventory.json` must contain exact entries for every non-Terms page under these current `docs-new` roots:

```text
get-started
compliance
business-onboarding
individual-onboarding
concepts
onboarding
receive
send
transfers
reference
```

Each object uses:

```json
{
  "source": "/compliance/supported-verticals",
  "destination": "/knowledge-base/compliance/supported-business-models",
  "reason": "Renamed for the Knowledge Base",
  "verified": false
}
```

Do not add `/t-c/*`; those routes intentionally return 404 in the approved scope.

- [ ] **Step 5: Create the migration ledger**

For each source page, add a table row with source commit, destination, disposition (`preserved-policy`, `contract-rewrite`, `redirect-only`, or `omitted`), and legal review state. Every compliance or onboarding claim involving licensing, availability, limits, custody, Travel Rule, retention, UBO thresholds, document rules, or timelines starts as `review-required`.

- [ ] **Step 6: Run tests and verify GREEN**

Run the Step 2 command.

Expected: all validation-library tests pass. `npm run verify:docs` is expected to fail at this stage because published pages do not exist yet; confirm the failure lists the missing approved pages.

- [ ] **Step 7: Commit**

```bash
git add scripts tests docs/content-migration-ledger.md docs/redirect-inventory.json docs/redirect-verification-phase.json
git commit -m "test: add documentation migration guards"
```

---

### Task 4: Configure Mintlify navigation, branding, and landing page

**Files:**
- Modify: `docs.json`
- Modify: `index.mdx`
- Delete: `quickstart.mdx`
- Replace: `favicon.svg`
- Replace: `logo/light.svg`
- Replace: `logo/dark.svg`
- Create: `tests/site-config.test.mjs`

- [ ] **Step 1: Write the failing site-config tests**

Test that:

- `docs.json.name` is `Swipelux`.
- `navigation.tabs` names are exactly `Integration Docs`, `API Reference`, `Knowledge Base`.
- The API Reference tab uses `openapi.json`.
- `api.playground.display` is `none`.
- Contextual options are exactly `copy` and `view`.
- Docs UI colors are `#B8381D`, `#FA9B51`, and `#E2471D`; the official logo assets retain their original `#F4663E` brand path.
- `docs.json.redirects` exactly matches the source/destination pairs in `docs/redirect-inventory.json`.
- Starter Mintlify links, email addresses, logos, and page names are absent.

- [ ] **Step 2: Run the tests and verify RED**

```bash
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH node --test tests/site-config.test.mjs
```

Expected: FAIL because the starter configuration is still present.

- [ ] **Step 3: Replace `docs.json`**

Use the exact three-tab navigation from the approved design. Add:

```json
"api": {
  "playground": {
    "display": "none"
  }
},
"contextual": {
  "options": ["copy", "view"]
},
"colors": {
  "primary": "#B8381D",
  "light": "#FA9B51",
  "dark": "#E2471D"
}
```

Copy all redirect pairs from `docs/redirect-inventory.json`. Use `https://www.swipelux.com` for the public company link, `mailto:support@swipelux.com` for support, and no unverified dashboard URL.

- [ ] **Step 4: Replace branding assets and landing content**

Use the three-path Swipelux symbol from `/Users/andry/brain/swipelux/website/app/icon.svg` for favicon and both logo variants. Rewrite `index.mdx` with frontmatter and three cards linking to `/integration/overview`, the API Reference tab, and `/knowledge-base/compliance/overview`. Remove starter marketing language and `quickstart.mdx`.

- [ ] **Step 5: Run tests and verify GREEN**

Run the Step 2 command.

Expected: all site-config tests pass.

- [ ] **Step 6: Commit**

```bash
git add docs.json index.mdx favicon.svg logo tests/site-config.test.mjs docs/redirect-inventory.json
git rm quickstart.mdx
git commit -m "feat: configure the Swipelux Mintlify site"
```

---

### Task 5: Write Integration Docs start pages

**Files:**
- Create: `integration/overview.mdx`
- Create: `integration/quickstart.mdx`
- Create: `integration/starter-kit.mdx`
- Create: `integration/authentication.mdx`
- Create: `integration/environments.mdx`
- Create: `integration/using-the-api-reference.mdx`
- Create: `integration/request-safety.mdx`
- Create: `integration/errors.mdx`
- Create: `integration/pagination-and-sync.mdx`
- Create: `tests/integration-start.test.mjs`

- [ ] **Step 1: Write failing content tests**

Use `tests/helpers/content.mjs` to assert all nine pages have title/description frontmatter, are present in navigation, contain no banned text, and use language-tagged code blocks. Add focused assertions:

```js
assert.match(read("integration/authentication.mdx"), /X-API-Key/);
assert.doesNotMatch(read("integration/authentication.mdx"), /serviceToken|uploadToken|Bearer/);
assert.match(read("integration/environments.mdx"), /same base URL/i);
assert.match(read("integration/quickstart.mdx"), /POST \/v3\/customers/);
assert.match(read("integration/errors.mdx"), /correlationId/);
assert.match(read("integration/pagination-and-sync.mdx"), /updatedAfter/);
```

- [ ] **Step 2: Run and verify RED**

Run `node --test tests/integration-start.test.mjs` under the pinned Node path.

Expected: FAIL because the pages do not exist.

- [ ] **Step 3: Write the nine pages**

Use the current OpenAPI descriptions/examples for every technical statement. Required content:

- `overview`: v3 object map and customer → capability → task → account → quote → transfer lifecycle.
- `quickstart`: coherent sandbox sequence with webhook setup, customer creation, supported capability lookup, capability request, task completion, account creation, quote, transfer, and state check.
- `starter-kit`: migrate current demo/repository links, clearly separate demo credentials from live credentials, and avoid the old “single key makes it live” claim.
- `authentication`: only `X-API-Key`, server-side storage, environment selected by key.
- `environments`: `https://platform.swipelux.com` for both environments and the six `/v3/sandbox/*` helpers.
- `using-the-api-reference`: explain generated schemas and stable deep links.
- `request-safety`: `Idempotency-Key`, replay behavior, safe retry boundaries.
- `errors`: shared problem shape, field errors, retry guidance, and correlation IDs.
- `pagination-and-sync`: cursor pagination, deterministic ordering, `updatedAfter`, resource refetch, and missed-webhook recovery.

Use `<Steps>`, `<Card>`, `<Columns>`, `<Note>`, and `<Warning>` sparingly. Do not import built-in Mintlify components.

- [ ] **Step 4: Run and verify GREEN**

Run the Step 2 command and `npm run verify:docs`.

Expected: start-page tests pass; `verify:docs` still reports only later missing pages.

- [ ] **Step 5: Commit**

```bash
git add integration tests/integration-start.test.mjs
git commit -m "docs: add API v3 getting-started guides"
```

---

### Task 6: Write v3 onboarding integration guides

**Files:**
- Create: `integration/onboarding/individuals.mdx`
- Create: `integration/onboarding/businesses.mdx`
- Create: `integration/onboarding/tasks-and-submissions.mdx`
- Create: `integration/onboarding/documents.mdx`
- Create: `tests/integration-onboarding.test.mjs`

- [ ] **Step 1: Write failing onboarding tests**

Assert the pages contain the v3 routes for customers, related parties, supported capabilities, capability creation, task details, submissions, and documents. Assert they do not contain `/kyc`, `/kyb`, `/customers/business`, or any `/v1/`/`/v2/` route.

- [ ] **Step 2: Run and verify RED**

Expected: missing-page failures.

- [ ] **Step 3: Write the onboarding guides**

Required exact flow:

1. `POST /v3/customers` with `type: individual|business`.
2. For businesses, manage `/v3/customers/{customerId}/related-parties`.
3. Read `/capabilities/supported`, optionally preview tasks, then request a capability.
4. Follow capability/application `openTaskIds`.
5. Fetch customer-scoped task details to receive authorized hosted-session URLs.
6. Upload customer documents and submit a complete immutable answer set for the current task revision.
7. Monitor task, application, and capability status until ready or rejected.

Document the authoritative status vocabularies and the 25 MB accepted document formats. Link each route through the corresponding stable `x-mint.href` from `openapi-coverage.json`.

- [ ] **Step 4: Run and verify GREEN**

Run onboarding tests and `npm run verify:docs`.

- [ ] **Step 5: Commit**

```bash
git add integration/onboarding tests/integration-onboarding.test.mjs
git commit -m "docs: explain v3 customer onboarding"
```

---

### Task 7: Write accounts and money-movement guides

**Files:**
- Create: `integration/accounts.mdx`
- Create: `integration/recipients.mdx`
- Create: `integration/quotes-and-transfers.mdx`
- Create: `integration/receive-funds.mdx`
- Create: `integration/send-funds.mdx`
- Create: `integration/rules.mdx`
- Create: `tests/integration-money-movement.test.mjs`

- [ ] **Step 1: Write failing money-movement tests**

Assert the pages cover issued/external accounts, settlement accounts, first-party accounts versus third-party destinations, quote execution, transfer instructions, transfer-scoped tasks, and rules. Require only `/v3/` routes and stable API-reference links.

- [ ] **Step 2: Run and verify RED**

Expected: missing-page failures.

- [ ] **Step 3: Write the six guides**

Use the contract’s exact distinctions:

- Accounts can be wallet or bank and `issued` or `external`; issued bank accounts settle into an issued wallet account.
- First-party transfers target customer accounts; third-party payouts target recipient destinations.
- `POST /v3/quotes` prices movement; `POST /v3/transfers` executes the selected quote.
- Funding instructions exist for applicable inbound transfers; payout-side transfers return `transfer_has_no_instructions`.
- Transfer states and action-required tasks come from the current schemas.
- Rules watch a custodial wallet account and sweep funds to an account or destination.

- [ ] **Step 4: Run and verify GREEN**

Run the focused tests and `npm run verify:docs`.

- [ ] **Step 5: Commit**

```bash
git add integration tests/integration-money-movement.test.mjs
git commit -m "docs: add v3 money movement guides"
```

---

### Task 8: Write webhook, sandbox, and launch guides

**Files:**
- Create: `integration/webhooks.mdx`
- Create: `integration/sandbox.mdx`
- Create: `integration/production-readiness.mdx`
- Create: `tests/integration-events.test.mjs`

- [ ] **Step 1: Write failing event/launch tests**

Require all 12 defined webhook event names, event-ID deduplication, resource refetch, portal replay, and `updatedAfter` recovery. Reject `HMAC`, `signature`, retry timing, ordering guarantees, or any other unverified webhook-security claim. Require all six v3 sandbox endpoints.

- [ ] **Step 2: Run and verify RED**

Expected: missing-page failures.

- [ ] **Step 3: Write the three guides**

- `webhooks`: configure/list/update/archive endpoints, portal URL, canonical envelope, 12 event types, partial/redacted payload caution, refetch, dedupe, and recovery. Explicitly state that signing/delivery guarantees are not documented here.
- `sandbox`: top-up, transfer state, task create/review, customer verification, capability state; same host and environment-by-key.
- `production-readiness`: server-side keys, idempotency, polling/recovery, legal approval, redirect review, and environment cutover.

- [ ] **Step 4: Run and verify GREEN**

Run the focused tests. At this point all Integration Docs pages should be present.

- [ ] **Step 5: Commit**

```bash
git add integration tests/integration-events.test.mjs
git commit -m "docs: add webhook sandbox and launch guidance"
```

---

### Task 9: Migrate the compliance Knowledge Base

**Files:**
- Create: `knowledge-base/compliance/overview.mdx`
- Create: `knowledge-base/compliance/regulatory-perimeter.mdx`
- Create: `knowledge-base/compliance/supported-business-models.mdx`
- Create: `knowledge-base/compliance/jurisdictions-and-availability.mdx`
- Create: `knowledge-base/compliance/transaction-limits.mdx`
- Create: `knowledge-base/compliance/custody-and-wallet-controls.mdx`
- Create: `knowledge-base/compliance/payment-methods.mdx`
- Create: `knowledge-base/compliance/travel-rule.mdx`
- Create: `knowledge-base/compliance/screening-and-monitoring.mdx`
- Create: `knowledge-base/compliance/governance-retention-and-privacy.mdx`
- Modify: `docs/content-migration-ledger.md`
- Create: `tests/knowledge-compliance.test.mjs`

- [ ] **Step 1: Write failing compliance tests**

Assert all ten pages exist, have frontmatter, contain no v1/v2 routes, and preserve the expected headings from each source page. Assert each destination appears in the migration ledger with the source commit and a legal review state.

- [ ] **Step 2: Run and verify RED**

Expected: missing-page failures.

- [ ] **Step 3: Migrate policy content from the fetched remote tree**

Read source with `git -C /Users/andry/brain/swipelux/docs-new show origin/main:<path>`; do not read the dirty working copy. Map:

```text
compliance/index.mdx                  -> compliance/overview.mdx
compliance/general-information.mdx    -> compliance/regulatory-perimeter.mdx
compliance/supported-verticals.mdx    -> compliance/supported-business-models.mdx
compliance/jurisdiction-framework.mdx -> compliance/jurisdictions-and-availability.mdx
compliance/limits.mdx                 -> compliance/transaction-limits.mdx
compliance/wallet-architecture.mdx    -> compliance/custody-and-wallet-controls.mdx
compliance/payment-methods.mdx        -> compliance/payment-methods.mdx
compliance/travel-rule.mdx            -> compliance/travel-rule.mdx
compliance/screening-monitoring.mdx   -> compliance/screening-and-monitoring.mdx
compliance/governance.mdx             -> compliance/governance-retention-and-privacy.mdx
```

Preserve substantive policy meaning. Remove Fumadocs imports and technical endpoint material. Link to Integration Docs for implementation. Mark every review-sensitive claim in the ledger, not with visible unresolved-review text in the public page.

- [ ] **Step 4: Run and verify GREEN**

Run the compliance tests and `npm run verify:docs`.

- [ ] **Step 5: Commit**

```bash
git add knowledge-base/compliance docs/content-migration-ledger.md tests/knowledge-compliance.test.mjs
git commit -m "docs: migrate the compliance knowledge base"
```

---

### Task 10: Migrate business and individual onboarding knowledge

**Files:**
- Create: `knowledge-base/business-onboarding/overview.mdx`
- Create: `knowledge-base/business-onboarding/entity-and-business-types.mdx`
- Create: `knowledge-base/business-onboarding/document-requirements.mdx`
- Create: `knowledge-base/business-onboarding/shareholders-ubos-and-control-persons.mdx`
- Create: `knowledge-base/business-onboarding/kyb-workflow.mdx`
- Create: `knowledge-base/business-onboarding/faq.mdx`
- Create: `knowledge-base/individual-onboarding/overview.mdx`
- Create: `knowledge-base/individual-onboarding/verification-levels.mdx`
- Create: `knowledge-base/individual-onboarding/status-and-workflow.mdx`
- Create: `knowledge-base/individual-onboarding/api-workflow.mdx`
- Modify: `docs/content-migration-ledger.md`
- Create: `tests/knowledge-onboarding.test.mjs`

- [ ] **Step 1: Write failing onboarding-knowledge tests**

Assert all ten pages exist, map to all source pages, contain no direct KYC/KYB v1 flow, and link technical procedures to `/integration/onboarding/*`. Require the FAQ questions, document categories, shareholder/UBO concepts, verification levels, rejection categories, and workflow status concepts from the source.

- [ ] **Step 2: Run and verify RED**

Expected: missing-page failures.

- [ ] **Step 3: Migrate business onboarding**

Map the six `content/business-onboarding/*.mdx` source pages one-to-one. Keep policy definitions and review requirements. Rewrite endpoint-heavy workflow material into policy-level sequencing and link to `/integration/onboarding/businesses`, `/integration/onboarding/tasks-and-submissions`, and `/integration/onboarding/documents`.

- [ ] **Step 4: Migrate individual onboarding**

Map the four `content/individual-onboarding/*.mdx` source pages one-to-one. Replace the old hand-written API reference page with a v3 workflow summary that links to `/integration/onboarding/individuals` and the generated Customers, Capabilities, Tasks, Submissions, and Documents groups.

- [ ] **Step 5: Run and verify GREEN**

Run onboarding-knowledge tests and `npm run verify:docs`.

Expected: the static docs verifier passes for required pages, migration coverage, banned content, and navigation.

- [ ] **Step 6: Commit**

```bash
git add knowledge-base docs/content-migration-ledger.md tests/knowledge-onboarding.test.mjs
git commit -m "docs: migrate customer onboarding knowledge"
```

---

### Task 11: Finalize redirects, deep links, and source coverage

**Files:**
- Modify: `docs/redirect-inventory.json`
- Modify: `docs/redirect-verification-phase.json`
- Modify: `docs.json`
- Modify: published MDX cross-links as identified
- Create: `tests/redirects-and-links.test.mjs`

- [ ] **Step 1: Write failing redirect/deep-link tests**

Test that every current non-Terms source page is represented in the migration ledger and either has a published destination or an exact redirect. Test that each `x-mint.href` referenced by MDX exists in `openapi-coverage.json`. Test that `/t-c/*` is absent from redirects.

- [ ] **Step 2: Run and verify RED**

Expected: failures for any inventory entries not yet synchronized with `docs.json` or cross-links.

- [ ] **Step 3: Synchronize redirects and links**

Add exact redirects for the current `concepts`, `onboarding`, `receive`, `send`, `transfers`, and `reference` pages to the closest new Integration Docs or API Reference pages. Replace any broad API Reference link in guides with the exact stable href from `openapi-coverage.json` when a single operation is intended.

- [ ] **Step 4: Run local link validation**

```bash
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH npm run verify:docs
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH npm run links
```

Expected: both commands exit 0. Update every inventory entry’s `verified` field to `true` only after the Mintlify redirect check passes, then set `docs/redirect-verification-phase.json` to `{"phase":"final"}` in the same commit. `npm run check` will enforce the final state automatically through the committed marker.

- [ ] **Step 5: Commit**

```bash
git add docs.json docs/redirect-inventory.json docs/redirect-verification-phase.json integration knowledge-base tests/redirects-and-links.test.mjs
git commit -m "docs: preserve public documentation routes"
```

---

### Task 12: Add CI and perform full Mintlify verification

**Files:**
- Create: `.github/workflows/docs.yml`
- Modify: `README.md`
- Modify: `docs.json`
- Modify: `docs/plans/2026-08-04-public-docs-rebuild.md`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/ci-config.test.mjs`
- Modify: `tests/project-structure.test.mjs`
- Modify: `tests/site-config.test.mjs`
- Review: `docs/content-migration-ledger.md` without inventing approval

- [ ] **Step 1: Write the failing CI configuration test**

Assert the workflow uses `actions/checkout@v4`, `actions/setup-node@v4`, `.nvmrc`, `npm ci`, and `npm run check`, and triggers on pull requests plus pushes to `main`.

- [ ] **Step 2: Run and verify RED**

Expected: FAIL because `.github/workflows/docs.yml` does not exist.

- [ ] **Step 3: Add CI**

Create:

```yaml
name: Docs

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run check
```

- [ ] **Step 4: Run automated verification**

```bash
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH npm test
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH npm run verify:openapi
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH npm run verify:docs
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH npm run validate
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH npm run links
PATH=/Users/andry/.nvm/versions/node/v24.15.0/bin:$PATH npm run a11y
```

Expected: every command exits 0 with no warnings treated as errors.

- [ ] **Step 5: Run a local preview smoke test**

Start `mint dev --no-open` under the pinned Node path in a reusable PTY. Verify HTTP 200 and expected page titles for:

```text
/
/integration/overview
/integration/onboarding/individuals
/integration/quotes-and-transfers
/knowledge-base/compliance/overview
/knowledge-base/business-onboarding/overview
/knowledge-base/individual-onboarding/overview
one generated API operation href from openapi-coverage.json
one generated webhook href or deterministic fallback page
```

Fetch the operation and webhook pages once with JavaScript disabled through a browser check and once with `Accept: text/markdown`. Confirm no API-key input appears on webhook-event pages and the API playground is hidden everywhere.

- [ ] **Step 6: Review the migration and legal gate**

Confirm every migration-ledger row has a disposition. Do not mark `review-required` legal claims approved without evidence from the accountable owner. Report unresolved review items as production-merge blockers, not implementation failures.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/docs.yml README.md docs.json docs/plans/2026-08-04-public-docs-rebuild.md package.json package-lock.json tests/ci-config.test.mjs tests/project-structure.test.mjs tests/site-config.test.mjs
git commit -m "ci: verify Mintlify public documentation"
```

- [ ] **Step 8: Final independent review and branch handoff**

Run a read-only Azure review against the complete branch and attempt the required Fable `review-result` consultation. Verify any Fable receipt before using it. Resolve every Critical or Important finding, rerun the full verification commands, then use `superpowers:finishing-a-development-branch` to present merge/PR/keep/discard options.

---

## Plan self-review checklist

- Every approved Integration Docs, API Reference, and Knowledge Base requirement maps to a task.
- Terms-of-Service pages remain explicitly out of scope and unredirected.
- No task depends on the dirty `docs-new` working tree.
- OpenAPI transformations are explicit, minimal, hash-verified, and semantically compared.
- The API playground remains disabled.
- Legal approval is a production-merge gate, not something the implementer may infer.
- Every implementation task includes a RED command, a GREEN command, and a commit.
