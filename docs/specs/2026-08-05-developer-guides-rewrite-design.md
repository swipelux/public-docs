# Swipelux Developer Guides Rewrite Design

Date: 2026-08-05
Status: Approved in conversation; written review pending
Repository: `/Users/andry/brain/swipelux/public-docs`
Implementation branch: `codex/developer-guides-rewrite`
Base: `origin/main` at `daa24badef27729bf16954525fcbee5d0a450771`

## Decision

Rebuild the Integration Docs around the developer journey rather than the internal API resource model.

The shared journey is:

1. Authenticate from a backend.
2. Create a customer.
3. Choose the intended outcome: pay-in, payout, or issued bank account.
4. Discover and request a capability that supports that outcome.
5. Complete the capability's current requirements.
6. Build and operate the selected money flow.

The API Reference remains the source for complete schemas, variants, enums, statuses, and error responses. Integration Docs explain sequencing, decisions, and successful workflows.

## Goals

- Help a developer reach a useful sandbox outcome quickly.
- Lead with what Swipelux enables: customer onboarding, pay-ins, payouts, and issued bank accounts.
- Explain the customer and capability lifecycle once.
- Give each page one primary job and one clear happy path.
- Use concise, public-facing language with complete representative examples.
- Make the next developer action obvious at the end of every workflow page.
- Preserve existing inbound links with direct redirects to the new canonical pages.

## Non-goals

- Do not change the generated API Reference or the authoritative OpenAPI contract.
- Do not rewrite the Knowledge Base in this change, except to repair links when navigation changes.
- Do not publish internal documentation machinery, repository artifacts, source precedence, or generation details.
- Do not promise that one capability supports every flow.
- Do not imply that every capability, institution, currency, network, or account type is available to every customer.
- Do not invent webhook security, retry schedules, readiness guarantees, or production approval behavior.
- Do not create SDK documentation when Swipelux does not publish an SDK contract.

## Audience

The primary reader is a backend developer integrating Swipelux into a fintech, payments product, treasury product, marketplace, or embedded-finance application.

Readers should not need to understand Swipelux's provider orchestration, documentation pipeline, internal manifests, or repository layout. They need to know:

- which endpoint to call;
- which identifier to retain;
- how to choose the correct capability;
- what must be ready before the next operation;
- how to test the flow safely;
- how to monitor and recover the integration.

## Information architecture

Keep the three top-level tabs: **Integration Docs**, **API Reference**, and **Knowledge Base**.

### Get started

| Page | Route | Primary job |
|---|---|---|
| Overview | `/integration/overview` | Explain what developers can build and introduce the customer → capability → money-flow lifecycle. |
| Quickstart | `/integration/quickstart` | Create a customer, select and request an eligible capability, complete sandbox onboarding, then branch to pay-in, payout, or issued bank account. |
| Authentication | `/integration/authentication` | Explain the base URL, `X-API-Key`, backend credential handling, and key-selected sandbox versus production environments. |
| Sandbox | `/integration/sandbox` | Show how to test onboarding, tasks, account funding, capability status, and transfer outcomes. |

### Onboard

| Page | Route | Primary job |
|---|---|---|
| Customers | `/integration/onboarding/customers` | Create individuals or businesses, store customer IDs, and add business related parties when required. |
| Capabilities and requirements | `/integration/onboarding/capabilities-and-requirements` | Discover capabilities for the intended outcome, request one, resolve hosted or API requirements, submit documents, and wait for readiness. |

### Build money flows

| Page | Route | Primary job |
|---|---|---|
| Common flows | `/integration/common-flows` | Compare the prerequisites and resource sequence for pay-ins, payouts, and issued bank accounts. |
| Accounts and wallets | `/integration/accounts` | Explain issued versus external accounts, bank versus wallet accounts, readiness, and when each is used. |
| Issue a bank account | `/integration/issue-bank-account` | Create the settlement wallet, request the issued bank account, and handle asynchronous provisioning and routing details. |
| Recipients and destinations | `/integration/recipients` | Model a third-party beneficiary and the bank or wallet destination where funds will arrive. |
| Receive funds | `/integration/receive-funds` | Quote and execute a pay-in, present returned funding instructions, and monitor settlement. |
| Send funds | `/integration/send-funds` | Prepare a first-party account or third-party recipient, quote a payout, execute it, and monitor delivery. |
| Quotes and transfers | `/integration/quotes-and-transfers` | Explain the shared price → execute → monitor lifecycle used by money movement. |
| Automated rules | `/integration/rules` | Create and manage automatic sweep rules after the underlying accounts and capability are ready. |

### Operate

| Page | Route | Primary job |
|---|---|---|
| Webhooks | `/integration/webhooks` | Register events, deduplicate deliveries, refetch current resources, and recover missed changes. |
| API reliability | `/integration/api-reliability` | Centralize idempotency, safe replay, shared errors, retry decisions, and correlation IDs. |
| Sync and reconciliation | `/integration/sync-and-reconciliation` | Paginate reliably, use `updatedAfter`, and reconcile API state after missed events or outages. |
| Go live | `/integration/production-readiness` | Provide a concise production launch checklist and sandbox-to-production cutover guidance. |

### Resources

| Page | Route | Primary job |
|---|---|---|
| Starter kit | `/integration/starter-kit` | Explain how to run the example application and how its demo credential model differs from production. |

## Page consolidation and redirects

The rewrite reduces duplicate guidance while preserving existing URLs.

| Existing route | Disposition |
|---|---|
| `/integration/environments` | Redirect to `/integration/authentication#sandbox-and-production`. |
| `/integration/using-the-api-reference` | Redirect to `/api-reference/customers/post-v3-customers`. |
| `/integration/request-safety` | Redirect to `/integration/api-reliability`. |
| `/integration/errors` | Redirect to `/integration/api-reliability#handle-errors`. |
| `/integration/pagination-and-sync` | Redirect to `/integration/sync-and-reconciliation`. |
| `/integration/onboarding/individuals` | Redirect to `/integration/onboarding/customers#individual-customers`. |
| `/integration/onboarding/businesses` | Redirect to `/integration/onboarding/customers#business-customers`. |
| `/integration/onboarding/tasks-and-submissions` | Redirect to `/integration/onboarding/capabilities-and-requirements#complete-requirements`. |
| `/integration/onboarding/documents` | Redirect to `/integration/onboarding/capabilities-and-requirements#upload-documents`. |

Existing legacy redirects in `docs.json` must point directly to the new canonical destination. The implementation must not create redirect chains.

The current `integration/accounts`, `integration/recipients`, `integration/quotes-and-transfers`, `integration/receive-funds`, `integration/send-funds`, `integration/rules`, `integration/webhooks`, `integration/sandbox`, `integration/production-readiness`, and `integration/starter-kit` routes remain canonical and receive complete rewrites.

## Quickstart design

The Quickstart is a guided sandbox workflow, not a claim that every merchant has an identical capability catalog.

### Shared setup

1. Export the shared base URL and a sandbox API key.
2. Make a first authenticated request.
3. Create an individual or business customer and store `data.id`.
4. Choose the intended outcome before selecting a capability:
   - accept a pay-in;
   - send a payout;
   - issue a bank account.
5. List supported capabilities for the customer.
6. Select an entry only when it supports the intended direction and account model, is available or beta, and reports the customer as eligible.
7. Request the capability and store its status, open task IDs, and application IDs.
8. Complete current requirements or use the documented sandbox controls to exercise readiness.
9. Continue only after the capability reports a status that permits the selected operation.

### Outcome branches

The page uses tabs or compact branch sections after shared setup:

- **Pay-in:** create or select a destination wallet, create a fiat-to-stablecoin quote, execute it, and retrieve funding instructions.
- **Payout:** create or fund a source wallet, create the first-party account or third-party recipient destination, quote the payout, and execute it.
- **Issue bank account:** create or select the settlement wallet, create an issued bank account for the capability, then read its current provisioning state and details.

Each branch provides complete representative request bodies. Values that must come from prior responses are clearly marked and described. No example depends on an undefined local JSON file.

The Quickstart does not begin with webhook setup. It links to Webhooks after the first successful flow.

## Capability selection model

Capability selection is outcome-driven. The developer chooses the intended flow before requesting a capability.

The guide teaches developers to evaluate the supported-capability response using the fields relevant to the intended operation, including:

- availability;
- customer eligibility;
- direction;
- payment method;
- account type;
- institution choices when present.

The guide does not hardcode a universal capability ID or institution. Concrete IDs in examples are illustrative unless the API response supplies them.

## Guide writing model

Every guide follows this order when applicable:

1. **Outcome:** one short paragraph beginning with what the developer can accomplish.
2. **Before you start:** only the prerequisites needed for this page.
3. **Happy path:** three to seven ordered steps.
4. **Representative requests:** complete bodies for the primary path.
5. **Decision points:** only branches that change the next API call.
6. **Result:** identifiers and status fields the developer should store or inspect.
7. **Next step:** links to the next workflow or API Reference operation.

### Length targets

- Setup pages: 150–350 words.
- Concept pages: 300–500 words.
- Workflow pages: 500–800 words.
- Avoid pages above approximately 900 words.
- Webhooks may be longer when necessary, but event payload catalogs remain in API Reference.

Length is a review signal, not a reason to omit information required to complete the workflow safely.

## Public writing rules

- Lead with developer value and outcomes.
- Use active voice and second person.
- Prefer direct instructions over defensive phrasing.
- Explain a global rule once and link back to it.
- Introduce an API resource only when the workflow needs it.
- Use the product terms `customer`, `capability`, `account`, `recipient`, `destination`, `quote`, and `transfer` consistently.
- Include only statuses and errors that change the developer's next action.
- Describe asynchronous behavior plainly: create the resource, inspect its status, and continue when ready.
- End each workflow page with a concrete next action.

### Prohibited public language

Integration pages must not mention:

- `openapi-coverage.json`;
- `openapi-provenance.json`;
- `x-mint.href`;
- committed or generated contract artifacts;
- documentation-generation internals;
- repository-local source precedence;
- internal provider names or orchestration;
- internal review notes or migration mechanics.

Avoid phrases such as “the committed contract defines,” “the generated schema says,” and “do not infer beyond the contract.” State the supported behavior directly and link to the relevant API Reference operation.

## API Reference boundary

Integration Docs own:

- workflow order;
- prerequisites;
- resource relationships;
- identifiers to retain;
- decisions between first-party and third-party flows;
- readiness checks;
- representative examples;
- recovery and launch guidance.

API Reference owns:

- complete request and response fields;
- every enum and schema variant;
- exhaustive statuses and reason codes;
- all response codes and problem shapes;
- complete webhook event payloads;
- operation-specific headers and limits.

Integration pages may repeat a field or status only when it changes the workflow's next step.

## Content-specific decisions

### Overview

Lead with the three core outcomes. Follow with the shared lifecycle and a compact object glossary. Remove contract provenance and exhaustive availability caveats.

### Authentication

Combine authentication and environments. Show the shared base URL, the `X-API-Key` header, one successful `GET`, and server-side secret handling. State once that the API key selects sandbox or production.

### Customers

Use tabs for individual and business creation. Keep business related parties on the business tab. Link policy questions to the Knowledge Base instead of embedding KYB/KYC policy prose.

### Capabilities and requirements

Explain capability discovery, selection, request, application status, tasks, hosted sessions, API submissions, and document upload as one lifecycle. Examples must make clear that task answers depend on the current task revision.

### Common flows

Use a small comparison table or three cards to show the resource sequence for pay-in, payout, and issued bank account. Link to the full workflow pages.

### Accounts and wallets

Explain the four account combinations without reproducing every request schema. Prioritize when to use each combination and what status permits money movement.

### Issue a bank account

Make the settlement-wallet prerequisite explicit. Explain that bank-account provisioning may be asynchronous and that routing details may not be present immediately.

### Receive funds

Separate transfer-specific pay-in instructions from reusable issued bank-account details. Make `reference.required` and `reference.value` visible when instructions require them.

### Send funds

Explain first-party and third-party destinations before the quote. Keep recipient creation in this workflow while retaining the dedicated Recipients page for reusable modeling and lifecycle details.

### Quotes and transfers

Explain quote expiry, execution, status monitoring, instructions, and transfer-scoped tasks. Do not repeat pay-in or payout setup from their dedicated guides.

### Webhooks

Cut the payload catalog and per-event reconciliation matrix from the narrative guide. Keep endpoint setup, deduplication by event ID, current-resource refetch, durable processing, portal replay, and missed-event recovery. Link event names and payload schemas to API Reference.

### API reliability

Centralize `Idempotency-Key`, identical-body replay after uncertainty, `Problem` responses, `retryable`, and `correlationId`. Other pages link here instead of repeating boilerplate.

### Sync and reconciliation

Explain cursor pagination, checkpoint overlap, `updatedAfter`, deduplication, and when to advance the checkpoint. Keep resource-specific operation lists short and task-oriented.

### Go live

Use a concise checklist. Cover production credentials, environment cutover, webhook recovery, idempotency, compliance readiness, monitoring, and a low-risk production smoke test.

## Verification strategy

The implementation must:

- update `docs.json` navigation and redirects;
- update link and navigation tests for the new canonical routes;
- add checks that Integration Docs do not contain prohibited internal artifact names;
- preserve API v3-only coverage;
- preserve all generated API Reference operations and webhooks;
- verify every new or changed internal link;
- run repository tests under Node.js 24.15.x;
- run `npm test`;
- run `npm run check`;
- preview and visually inspect Overview, Quickstart, Authentication, Customers, Capabilities and requirements, Common flows, Receive funds, Send funds, Issue a bank account, Webhooks, and Go live.

## Success criteria

- A developer can identify the correct starting point in under one screen.
- The Quickstart no longer starts with optional infrastructure.
- The Quickstart contains no undefined request files.
- A developer chooses an intended outcome before selecting a capability.
- Each canonical page has one clear purpose and a visible next action.
- Removed routes resolve directly to a canonical replacement.
- Integration pages contain no internal documentation artifacts or provider details.
- Common reliability rules are documented once rather than repeated across workflow pages.
- Tests and Mintlify validation pass without changing API semantics.
