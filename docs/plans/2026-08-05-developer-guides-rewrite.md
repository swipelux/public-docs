# Swipelux Developer Guides Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current contract-audit-style Integration Docs with concise, outcome-led developer guides for customer onboarding, capability onboarding, pay-ins, payouts, and issued bank accounts.

**Architecture:** Keep Mintlify and the generated API Reference unchanged. Reorganize only the hand-written Integration Docs into Get started, Onboard, Build money flows, Operate, and Resources. Consolidate repeated reliability and onboarding guidance into canonical pages, preserve removed routes with direct redirects, and validate every narrative claim against `openapi.json`.

**Tech Stack:** Mintlify CLI 4.2.775, Node.js 24.15.x, MDX, `docs.json`, OpenAPI 3.1 JSON, built-in `node:test`.

---

## Source material

- Approved design: `docs/specs/2026-08-05-developer-guides-rewrite-design.md`
- Authoritative API contract: `openapi.json`
- Operation link inventory used only by repository tests: `openapi-coverage.json`
- Existing redirect registry: `docs/redirect-inventory.json`
- Repository instructions: `AGENTS.md` and `CLAUDE.md`

## Target file structure

### Canonical Integration pages

```text
integration/
  overview.mdx
  quickstart.mdx
  authentication.mdx
  sandbox.mdx
  common-flows.mdx
  accounts.mdx
  issue-bank-account.mdx
  recipients.mdx
  receive-funds.mdx
  send-funds.mdx
  quotes-and-transfers.mdx
  rules.mdx
  webhooks.mdx
  api-reliability.mdx
  sync-and-reconciliation.mdx
  production-readiness.mdx
  starter-kit.mdx
  onboarding/
    customers.mdx
    capabilities-and-requirements.mdx
```

### Retired Integration pages

```text
integration/environments.mdx
integration/errors.mdx
integration/pagination-and-sync.mdx
integration/request-safety.mdx
integration/using-the-api-reference.mdx
integration/onboarding/individuals.mdx
integration/onboarding/businesses.mdx
integration/onboarding/tasks-and-submissions.mdx
integration/onboarding/documents.mdx
```

## Task 1: Encode the new information architecture and public-writing boundary

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs.json`
- Modify: `scripts/lib/docs-validation.mjs`
- Modify: `docs/redirect-inventory.json`
- Modify: `docs/content-migration-ledger.md`
- Modify: `tests/site-config.test.mjs`
- Modify: `tests/docs-validation.test.mjs`
- Modify: `tests/redirects-and-links.test.mjs`
- Create: `integration/common-flows.mdx`
- Create: `integration/issue-bank-account.mdx`
- Create: `integration/api-reliability.mdx`
- Create: `integration/sync-and-reconciliation.mdx`
- Create: `integration/onboarding/customers.mdx`
- Create: `integration/onboarding/capabilities-and-requirements.mdx`
- Delete: the nine retired Integration pages listed above

- [ ] **Step 1: Add failing navigation and redirect expectations**

Replace the Integration group fixture in `tests/site-config.test.mjs` with:

```js
const INTEGRATION_GROUPS = [
  {
    group: "Get started",
    pages: [
      "integration/overview",
      "integration/quickstart",
      "integration/authentication",
      "integration/sandbox",
    ],
  },
  {
    group: "Onboard",
    pages: [
      "integration/onboarding/customers",
      "integration/onboarding/capabilities-and-requirements",
    ],
  },
  {
    group: "Build money flows",
    pages: [
      "integration/common-flows",
      "integration/accounts",
      "integration/issue-bank-account",
      "integration/recipients",
      "integration/receive-funds",
      "integration/send-funds",
      "integration/quotes-and-transfers",
      "integration/rules",
    ],
  },
  {
    group: "Operate",
    pages: [
      "integration/webhooks",
      "integration/api-reliability",
      "integration/sync-and-reconciliation",
      "integration/production-readiness",
    ],
  },
  {
    group: "Resources",
    pages: ["integration/starter-kit"],
  },
];
```

Add the nine retired `/integration/...` routes to the redirect inventory and expect these exact destinations:

```js
const STRUCTURE_REDIRECTS = {
  "/integration/environments": "/integration/authentication#sandbox-and-production",
  "/integration/errors": "/integration/api-reliability#handle-errors",
  "/integration/pagination-and-sync": "/integration/sync-and-reconciliation",
  "/integration/request-safety": "/integration/api-reliability",
  "/integration/using-the-api-reference": "/api-reference/customers/post-v3-customers",
  "/integration/onboarding/individuals": "/integration/onboarding/customers#individual-customers",
  "/integration/onboarding/businesses": "/integration/onboarding/customers#business-customers",
  "/integration/onboarding/tasks-and-submissions": "/integration/onboarding/capabilities-and-requirements#complete-requirements",
  "/integration/onboarding/documents": "/integration/onboarding/capabilities-and-requirements#upload-documents",
};
```

- [ ] **Step 2: Add failing public-language validation tests**

Add table-driven assertions in `tests/docs-validation.test.mjs` proving that Integration pages reject these internal phrases:

```js
for (const value of [
  "openapi-coverage.json",
  "openapi-provenance.json",
  "x-mint.href",
  "the committed contract defines",
  "the generated schema says",
]) {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage(value),
  );
  assertHasError(errors, /internal documentation implementation detail/i);
}
```

Also prove that the same words remain allowed in non-published planning files:

```js
assert.deepEqual(
  validatePublishedText(
    "docs/plans/example.md",
    "openapi-coverage.json and x-mint.href",
  ),
  [],
);
```

- [ ] **Step 3: Run the focused tests and confirm they fail**

Run:

```bash
source ~/.nvm/nvm.sh
nvm use 24.15.0
node --test tests/site-config.test.mjs tests/docs-validation.test.mjs tests/redirects-and-links.test.mjs
```

Expected: failures for the old navigation, missing pages, missing structure redirects, and missing internal-language validation.

- [ ] **Step 4: Update paired repository instructions**

Add the same section to both `AGENTS.md` and `CLAUDE.md`:

```markdown
## Public guide writing

- Lead with the developer outcome, then introduce API resources.
- Give each Integration page one primary job and one happy path.
- Keep complete schemas, enums, status catalogs, and error catalogs in API Reference.
- Do not expose documentation-generation files, source precedence, migration notes, provider names, or internal review language.
- State shared rules once and link to their canonical guide instead of repeating boilerplate.
- End workflow pages with the next developer action.
```

- [ ] **Step 5: Implement the new navigation and page inventory**

Update `docs.json` and `REQUIRED_NAVIGATION_PAGES` in `scripts/lib/docs-validation.mjs` to match the exact five Integration groups in Step 1. Preserve the API Reference and Knowledge Base tabs unchanged.

Extend redirect validation with the nine `STRUCTURE_REDIRECTS`. Keep the original 53 legacy redirect sources frozen, then append the nine structural sources for a total of 62 redirect entries. Update `docs/redirect-inventory.json`, `docs/content-migration-ledger.md`, and affected tests so old legacy routes point directly to the new canonical pages rather than through retired pages.

- [ ] **Step 6: Create concise canonical page bodies and remove retired pages**

Create each new page with valid frontmatter and final public copy sufficient to explain its purpose. Use these exact titles and descriptions:

```yaml
---
title: "Common flows"
description: "Choose the right Swipelux workflow for pay-ins, payouts, or issued bank accounts."
---
```

```yaml
---
title: "Issue a bank account"
description: "Create a settlement wallet, issue a bank account, and monitor provisioning."
---
```

```yaml
---
title: "API reliability"
description: "Use idempotency, safe retries, errors, and correlation IDs in production."
---
```

```yaml
---
title: "Sync and reconciliation"
description: "Paginate API resources and recover changes after missed webhook deliveries."
---
```

```yaml
---
title: "Customers"
description: "Create individual or business customers before enabling financial capabilities."
---
```

```yaml
---
title: "Capabilities and requirements"
description: "Enable a customer capability and complete the requirements needed to make it ready."
---
```

Delete the retired MDX files after their redirects exist.

- [ ] **Step 7: Implement Integration-only internal-language validation**

In `validatePublishedText`, apply the new patterns only when the normalized path starts with `integration/`:

```js
const integrationOnlyPatterns = [
  /openapi-coverage\.json/i,
  /openapi-provenance\.json/i,
  /x-mint\.href/i,
  /the committed contract defines/i,
  /the generated schema says/i,
];

if (normalized.startsWith("integration/")) {
  for (const pattern of integrationOnlyPatterns) {
    if (pattern.test(value)) {
      errors.push(`${path}: internal documentation implementation detail`);
    }
  }
}
```

- [ ] **Step 8: Run focused tests**

Run:

```bash
node --test tests/site-config.test.mjs tests/docs-validation.test.mjs tests/redirects-and-links.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Commit the structural rewrite**

```bash
git add AGENTS.md CLAUDE.md docs.json scripts/lib/docs-validation.mjs \
  docs/redirect-inventory.json docs/content-migration-ledger.md \
  tests/site-config.test.mjs tests/docs-validation.test.mjs \
  tests/redirects-and-links.test.mjs integration
git commit -m "docs: reorganize developer guides"
```

## Task 2: Rewrite Get started around the first useful outcome

**Files:**
- Modify: `integration/overview.mdx`
- Modify: `integration/quickstart.mdx`
- Modify: `integration/authentication.mdx`
- Modify: `integration/sandbox.mdx`
- Modify: `tests/integration-start.test.mjs`

- [ ] **Step 1: Replace brittle content assertions with outcome assertions**

Update `tests/integration-start.test.mjs` to require:

- the four Get started pages in navigation;
- no optional webhook setup before customer creation;
- no references to `@account.json`, `@recipient.json`, `@destination.json`, `@quote.json`, or `@task-submission.json`;
- customer creation before capability discovery;
- the intended outcome selected before capability request;
- links to pay-in, payout, and issued-bank-account guides;
- complete examples for `POST /v3/customers`, capability request, sandbox capability status, account creation, quote creation, and transfer creation;
- Authentication contains the base URL, `X-API-Key`, backend-only handling, and sandbox/production key selection;
- Sandbox groups operations by onboarding, requirements, funding, and transfer outcomes.

Keep OpenAPI-backed checks for the linked operations and required headers.

- [ ] **Step 2: Run the Get started test and confirm failure**

```bash
node --test tests/integration-start.test.mjs
```

Expected: FAIL against the old prose and quickstart order.

- [ ] **Step 3: Rewrite Overview**

Use this page order:

```markdown
# Integration overview

Build customer onboarding, pay-ins, payouts, and issued bank accounts through one API.

## What you can build
<CardGroup> with Pay-ins, Payouts, and Bank accounts

## How an integration works
1. Create a customer.
2. Choose the intended outcome.
3. Request an eligible capability.
4. Complete current requirements.
5. Create accounts or destinations.
6. Quote, execute, and monitor money movement.

## Core resources
Compact definitions of customer, capability, account, recipient, destination, quote, and transfer.

## Start building
Cards to Quickstart, Authentication, and Common flows.
```

Do not include provider orchestration, source precedence, or exhaustive availability warnings.

- [ ] **Step 4: Rewrite Authentication and fold in Environments**

Use these sections:

```markdown
## Send your API key
## Make your first request
## Sandbox and production
## Store credentials safely
```

Use this request:

```bash
curl --request GET \
  "https://platform.swipelux.com/v3/capabilities" \
  --header "X-API-Key: ${SWIPELUX_API_KEY}"
```

State once that sandbox and production share the base URL and the API key selects the environment.

- [ ] **Step 5: Rewrite Quickstart**

Order the page exactly as follows:

```markdown
## 1. Configure sandbox
## 2. Create a customer
## 3. Choose the outcome
## 4. Find an eligible capability
## 5. Request the capability
## 6. Complete onboarding in sandbox
## 7. Build the selected flow
```

Use the minimal individual request:

```json
{
  "type": "individual",
  "externalId": "quickstart-customer-001"
}
```

Teach capability selection with a compact table:

| Goal | Check in the supported capability |
|---|---|
| Pay-in | Intended inbound direction, payment method, and compatible account type |
| Payout | Intended outbound direction, payment method, and destination model |
| Issued bank account | Issued account type, method, and eligible institution |

Request the response-derived capability ID with `{}` unless the developer intentionally chooses returned institution IDs:

```bash
curl --request POST \
  "${API_BASE}/v3/customers/${CUSTOMER_ID}/capabilities/${CAPABILITY_ID}" \
  --header "X-API-Key: ${SWIPELUX_SANDBOX_API_KEY}" \
  --header "Idempotency-Key: quickstart-capability-001" \
  --header "Content-Type: application/json" \
  --data '{}'
```

Show sandbox readiness as an explicit testing control, not production onboarding:

```json
{
  "status": "ready"
}
```

After the shared steps, use three tabs:

- Pay-in: issued USDC/Base wallet → fiat-to-stablecoin quote → transfer → instructions.
- Payout: funded issued USDC/Base wallet → customer-owned account or recipient destination → stablecoin-to-fiat quote → transfer.
- Issued bank account: issued settlement wallet → issued ACH/USD bank account → current status/details.

Every body must be inline. Every response-derived value must be named immediately after the request.

- [ ] **Step 6: Rewrite Sandbox around test scenarios**

Use these sections:

```markdown
## Test customer verification
## Test capability readiness
## Test requirements
## Fund a sandbox wallet
## Complete or fail a transfer
```

Link each helper to its generated API operation. State that ordinary sandbox helper requests do not replace the production compliance flow.

- [ ] **Step 7: Run focused tests and commit**

```bash
node --test tests/integration-start.test.mjs
git add integration/overview.mdx integration/quickstart.mdx \
  integration/authentication.mdx integration/sandbox.mdx \
  tests/integration-start.test.mjs
git commit -m "docs: rewrite developer getting started"
```

Expected: PASS before commit.

## Task 3: Rewrite customer and capability onboarding

**Files:**
- Modify: `integration/onboarding/customers.mdx`
- Modify: `integration/onboarding/capabilities-and-requirements.mdx`
- Rewrite: `tests/integration-onboarding.test.mjs`

- [ ] **Step 1: Write outcome-focused onboarding tests**

Require `customers.mdx` to contain:

- individual and business tabs;
- complete minimal customer bodies;
- `externalId` guidance;
- business related-party creation;
- returned customer and related-party IDs to store;
- links to capability onboarding and Knowledge Base policy pages.

Require `capabilities-and-requirements.mdx` to contain:

- supported capability discovery before request;
- availability, eligibility, direction, method, account type, and institution selection;
- `{}` request behavior and explicit institution override behavior;
- current capability status and open task IDs;
- hosted verification and terms URLs where returned;
- dynamic task revision handling;
- document upload before document-answer submission;
- current capability refetch before proceeding.

Keep OpenAPI-backed assertions for customer, related-party, capability, task, submission, and document operations.

- [ ] **Step 2: Run the onboarding test and confirm failure**

```bash
node --test tests/integration-onboarding.test.mjs
```

Expected: FAIL against the minimal structural pages.

- [ ] **Step 3: Write Customers**

Use these sections:

```markdown
## Individual customers
## Business customers
## Add business related parties
## Read the current customer
## Next: enable a capability
```

Use these canonical examples:

```json
{
  "type": "individual",
  "externalId": "user_123",
  "individual": {
    "firstName": "Amina",
    "lastName": "Diallo",
    "residenceCountry": "FR"
  }
}
```

```json
{
  "type": "business",
  "externalId": "company_456",
  "business": {
    "legalName": "Acme Payments SAS"
  }
}
```

```json
{
  "partyType": "person",
  "roles": ["director"],
  "title": "Chief executive officer",
  "person": {
    "firstName": "Amina",
    "lastName": "Diallo",
    "residenceCountry": "FR"
  }
}
```

- [ ] **Step 4: Write Capabilities and requirements**

Use these sections:

```markdown
## Find a capability for the intended flow
## Request the capability
## Complete requirements
## Use hosted sessions
## Upload documents
## Submit API answers
## Wait for readiness
```

Use this submission shape and explain that `taskRevision`, requirement IDs, and answer types come from the current task:

```json
{
  "taskRevision": 3,
  "answers": [
    {
      "requirementId": "req_from_current_task",
      "answer": {
        "type": "text",
        "value": "Current answer"
      }
    }
  ]
}
```

Link exact answer variants and document upload media types to API Reference instead of copying their complete schemas.

- [ ] **Step 5: Run focused tests and commit**

```bash
node --test tests/integration-onboarding.test.mjs
git add integration/onboarding tests/integration-onboarding.test.mjs
git commit -m "docs: simplify customer and capability onboarding"
```

Expected: PASS before commit.

## Task 4: Rewrite common flows, accounts, pay-ins, and payouts

**Files:**
- Modify: `integration/common-flows.mdx`
- Modify: `integration/accounts.mdx`
- Modify: `integration/issue-bank-account.mdx`
- Modify: `integration/recipients.mdx`
- Modify: `integration/receive-funds.mdx`
- Modify: `integration/send-funds.mdx`
- Modify: `integration/quotes-and-transfers.mdx`
- Modify: `integration/rules.mdx`
- Rewrite: `tests/integration-money-movement.test.mjs`

- [ ] **Step 1: Replace prose-sensitive money-movement tests with workflow tests**

Require the pages to cover these exact resource sequences:

```text
Pay-in: ready capability -> issued wallet -> quote -> transfer -> instructions -> status
Payout: ready capability -> source wallet -> customer account or recipient destination -> quote -> transfer -> status
Issued bank account: ready capability -> settlement wallet -> issued bank account -> provisioning -> details
```

Keep contract-backed checks for account variants, recipient and destination bodies, quote examples, transfer execution, instructions, account fees, and rule schemas. Remove assertions that require exact narrative sentences or repeated idempotency sections.

- [ ] **Step 2: Run the money-movement test and confirm failure**

```bash
node --test tests/integration-money-movement.test.mjs
```

Expected: FAIL against the previous resource-heavy pages.

- [ ] **Step 3: Write Common flows**

Use three outcome cards and one comparison table:

| Flow | You need | Result |
|---|---|---|
| Pay-in | Ready pay-in capability and destination wallet | Funding instructions and stablecoin settlement |
| Payout | Ready payout capability, source funds, and destination | Fiat or stablecoin delivery |
| Issued bank account | Ready bank capability and settlement wallet | Reusable bank details when provisioning completes |

End with links to the three dedicated guides.

- [ ] **Step 4: Rewrite Accounts and wallets**

Explain issued wallet, issued bank, external wallet, and external bank accounts in a four-row decision table. Retain one representative body per account family, then link to the API Reference for variants. Keep account status, `statusReason`, settlement account, reference, fee configuration, update, and archive guidance only where it changes an action.

- [ ] **Step 5: Write Issue a bank account**

Use this order:

```markdown
## Before you start
## 1. Create or select the settlement wallet
## 2. Create the issued bank account
## 3. Monitor provisioning
## 4. Present bank details safely
```

Use this request:

```json
{
  "origin": "issued",
  "type": "bank",
  "method": "ach",
  "country": "US",
  "currency": "USD",
  "settlement": {
    "accountId": "acc_settlement_wallet"
  },
  "label": "USD receiving account"
}
```

State that routing details may be absent while provisioning and that `details.reference` must be shown when `details.referenceRequired` is true.

- [ ] **Step 6: Rewrite Recipients and destinations**

Lead with the distinction:

```text
Use an account when the customer owns the destination. Use a recipient and destination when funds go to another person or business.
```

Keep one individual recipient example, one bank destination example, and one wallet destination example. Move payout sequencing to Send funds.

- [ ] **Step 7: Rewrite Receive funds**

Use this order:

```markdown
## Before you start
## 1. Create a quote
## 2. Execute the quote
## 3. Retrieve funding instructions
## 4. Show the required reference
## 5. Monitor settlement
```

Use the OpenAPI fiat-to-stablecoin quote example inline and explicitly store the returned quote ID, transfer ID, instructions, and reference fields.

- [ ] **Step 8: Rewrite Send funds**

Use first-party and third-party tabs. Use the OpenAPI stablecoin-to-fiat account and destination quote examples. Show transfer execution once, then link to Quotes and transfers for status handling.

- [ ] **Step 9: Rewrite Quotes and transfers and Automated rules**

Quotes and transfers should cover:

- exact-in versus exact-out choice;
- quote expiry;
- `POST /v3/transfers` with `quoteId`;
- current state and `stateDetail`;
- transfer-scoped tasks;
- funding instructions only when the flow returns them.

Automated rules should cover prerequisites, trigger/target choice, create, inspect, update, and archive. Link API reliability once rather than repeating idempotency prose.

- [ ] **Step 10: Run focused tests and commit**

```bash
node --test tests/integration-money-movement.test.mjs
git add integration/common-flows.mdx integration/accounts.mdx \
  integration/issue-bank-account.mdx integration/recipients.mdx \
  integration/receive-funds.mdx integration/send-funds.mdx \
  integration/quotes-and-transfers.mdx integration/rules.mdx \
  tests/integration-money-movement.test.mjs
git commit -m "docs: rewrite core money movement guides"
```

Expected: PASS before commit.

## Task 5: Rewrite operational guidance

**Files:**
- Modify: `integration/webhooks.mdx`
- Modify: `integration/api-reliability.mdx`
- Modify: `integration/sync-and-reconciliation.mdx`
- Modify: `integration/production-readiness.mdx`
- Rewrite: `tests/integration-events.test.mjs`

- [ ] **Step 1: Write operational outcome tests**

Require:

- Webhooks to configure endpoints, persist event IDs, refetch current state, use durable processing, access the delivery portal, and link missed-event recovery.
- API reliability to explain unique-effect idempotency keys, identical-body replay after uncertainty, `Problem`, `retryable`, and `correlationId`.
- Sync and reconciliation to explain cursors, overlap windows, `updatedAfter`, deduplication, and checkpoint advancement.
- Go live to contain a short production checklist without undocumented promises.

Keep OpenAPI-backed operation and event links. Remove requirements for a complete webhook payload catalog, the full event-to-read matrix, repeated write-operation inventories, and “contract boundary” prose.

- [ ] **Step 2: Run operational tests and confirm failure**

```bash
node --test tests/integration-events.test.mjs
```

Expected: FAIL against the previous operational pages.

- [ ] **Step 3: Rewrite Webhooks**

Use these sections:

```markdown
## Register an endpoint
## Process an event
## Refetch current state
## Replay a delivery
## Recover missed changes
```

Keep one transfer-state envelope example. Link the complete event catalog and payload schemas to API Reference.

- [ ] **Step 4: Complete API reliability**

Use these sections:

```markdown
## Make writes idempotent
## Retry after an uncertain response
## Handle errors
## Log correlation IDs
```

Include one idempotent write example and one `Problem` example. Do not repeat operation-by-operation idempotency inventories.

- [ ] **Step 5: Complete Sync and reconciliation**

Use one cursor loop example and one checkpoint algorithm:

```text
read from checkpoint minus overlap -> follow every cursor -> deduplicate by resource ID -> apply current state -> advance checkpoint after the full window succeeds
```

Link resource list operations through a compact CardGroup rather than a long matrix.

- [ ] **Step 6: Rewrite Go live**

Use a checklist covering:

- production API key stored separately;
- sandbox and production configuration separated;
- capability and compliance approvals complete;
- idempotency and correlation logging enabled;
- webhook inbox and reconciliation tested;
- account, recipient, and transfer state monitoring enabled;
- low-risk production smoke test agreed with Swipelux.

- [ ] **Step 7: Run focused tests and commit**

```bash
node --test tests/integration-events.test.mjs
git add integration/webhooks.mdx integration/api-reliability.mdx \
  integration/sync-and-reconciliation.mdx \
  integration/production-readiness.mdx tests/integration-events.test.mjs
git commit -m "docs: simplify operational integration guidance"
```

Expected: PASS before commit.

## Task 6: Polish the starter kit and complete the editorial pass

**Files:**
- Modify: `integration/starter-kit.mdx`
- Modify: all canonical `integration/**/*.mdx` pages as needed
- Modify: `index.mdx` only if its Integration Docs cards point to retired routes or contradict the new lifecycle
- Modify: `tests/integration-start.test.mjs`
- Modify: `tests/integration-onboarding.test.mjs`
- Modify: `tests/integration-money-movement.test.mjs`
- Modify: `tests/integration-events.test.mjs`

- [ ] **Step 1: Rewrite Starter kit**

Keep only:

- what the starter demonstrates;
- how to run it locally;
- demo data versus connected sandbox;
- the requirement to move credentials behind a backend before production;
- links to Quickstart and Authentication.

- [ ] **Step 2: Run an Integration prose audit**

Use repository searches:

```bash
rg -n -i 'openapi-coverage|openapi-provenance|x-mint\.href|committed contract|generated schema|source of truth|provider orchestration|internal review' integration
rg -n '(^|[^A-Za-z])v[12]([^A-Za-z]|$)' integration
rg -n '@(?:account|recipient|destination|quote|task-submission)\.json' integration
```

Expected: no matches.

Review repeated phrases:

```bash
for term in 'Do not' 'contract' 'generated' 'current' 'exact' 'operation page'; do
  printf '%-18s ' "$term"
  rg -i "$term" integration | wc -l
done
```

Reduce defensive repetition while retaining local safety constraints.

- [ ] **Step 3: Verify every canonical page ends with a next action**

Add a final CardGroup, Columns block, or short “Next step” section where a page currently stops without directing the developer onward.

- [ ] **Step 4: Run all repository tests and commit**

```bash
npm test
git add integration index.mdx tests
git commit -m "docs: polish public developer journey"
```

Expected: all tests PASS.

## Task 7: Validate Mintlify output and review the public experience

**Files:**
- Modify only files required to fix validation, link, accessibility, or rendering defects found in this task

- [ ] **Step 1: Confirm the required runtime**

```bash
source ~/.nvm/nvm.sh
nvm use 24.15.0
node --version
npm --version
```

Expected: Node `v24.15.0` and npm compatible with `packageManager: npm@11.12.1`.

- [ ] **Step 2: Run the full repository check**

```bash
npm run check
```

Expected: tests, OpenAPI verification, docs verification, Mintlify validation, broken-link/redirect checking, and accessibility checking all PASS.

- [ ] **Step 3: Start the Mintlify preview**

```bash
npx mint dev --telemetry=false
```

Expected: the local preview starts without MDX or navigation errors.

- [ ] **Step 4: Visually inspect priority pages**

Inspect desktop and narrow layouts for:

```text
/integration/overview
/integration/quickstart
/integration/authentication
/integration/onboarding/customers
/integration/onboarding/capabilities-and-requirements
/integration/common-flows
/integration/issue-bank-account
/integration/receive-funds
/integration/send-funds
/integration/webhooks
/integration/production-readiness
```

Verify heading hierarchy, code wrapping, tab readability, card destinations, table width, and that the first screen communicates the page outcome.

- [ ] **Step 5: Verify retired URLs**

Open each of the nine retired Integration routes and confirm it redirects directly to its final canonical destination without an intermediate hop.

- [ ] **Step 6: Commit validation fixes**

If the validation pass changed files:

```bash
git add .
git commit -m "fix: resolve developer docs validation issues"
```

If no files changed, do not create an empty commit.

## Task 8: Independent review, publish, and babysit the PR

**Files:**
- Review all branch changes
- No planned content changes unless review or CI finds a defect

- [ ] **Step 1: Review the complete branch diff**

```bash
git fetch origin --prune
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
git status --short --branch
```

Confirm that the diff contains only the developer-guides rewrite, its tests, redirects, paired instructions, design, and plan.

- [ ] **Step 2: Run independent public-API review**

Use `consult-fable` in read-only `review-result` mode against the complete diff and test evidence. Require a verified receipt before relying on the result. Independently verify every actionable finding before changing content.

- [ ] **Step 3: Request implementation review**

Use `superpowers:requesting-code-review` to check design compliance, public-writing quality, endpoint accuracy, test coverage, and route preservation.

- [ ] **Step 4: Re-run checks after review fixes**

```bash
npm run check
git status --short --branch
```

Expected: full check PASS and only intentional committed changes.

- [ ] **Step 5: Push and open the pull request**

```bash
git push -u origin codex/developer-guides-rewrite
gh pr create \
  --repo swipelux/public-docs \
  --base main \
  --head codex/developer-guides-rewrite \
  --title "Rewrite public developer guides around integration flows" \
  --body "## Summary
- reorganize Integration Docs around onboarding, pay-ins, payouts, and issued bank accounts
- replace internal contract-audit prose with concise public workflows
- preserve retired routes with direct redirects

## Verification
- npm run check
- visual review of priority Integration pages"
```

The PR body must summarize the new information architecture, key content changes, redirects, verification commands, and visual review.

- [ ] **Step 6: Babysit CI and review**

Monitor required checks and review status. Address failures or requested changes, push fixes, and continue until checks are green and the PR is ready to merge or an external blocker prevents progress.

## Plan completion checklist

- [ ] Approved design is represented in a task.
- [ ] Every canonical Integration page is created or rewritten.
- [ ] Every retired Integration route has a direct redirect.
- [ ] Public internal-language guardrails are tested.
- [ ] API Reference and Knowledge Base ownership boundaries remain intact.
- [ ] Quickstart chooses an intended outcome before capability selection.
- [ ] Pay-in, payout, and issued-bank-account flows are each documented.
- [ ] Focused tests and full Mintlify validation are included.
- [ ] Independent review and PR babysitting are included.
