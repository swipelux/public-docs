# Swipelux Public Docs Rebuild Design

Date: 2026-08-04
Status: Approved for implementation
Repository: `/Users/andry/brain/swipelux/public-docs`
Implementation branch: `codex/public-docs-rebuild`
Production deployment branch: `main`

## Decision

Build the public documentation as a Mintlify-hosted site with one landing page and three primary sections:

1. **Integration Docs** — task-oriented v3 integration guides written from the current OpenAPI contract.
2. **API Reference** — generated from a repository-local OpenAPI 3.1 document.
3. **Knowledge Base** — compliance, business onboarding, and individual onboarding material migrated from the current public docs source.

The API contract is authoritative for all technical details. Existing public documentation is authoritative only for the legal, compliance, and onboarding policy material that the user explicitly asked to preserve. No v1 or v2 endpoint, example, anchor, workflow, or compatibility note may appear in the published site.

## Source precedence

When sources disagree, use this order:

1. `/Users/andry/Downloads/api-1 (23).json` for endpoints, schemas, authentication, errors, statuses, sandbox behavior, and webhook payloads.
2. `swipelux/docs-new` at `origin/main` commit `b4c9b5b7101ec03e01424259f58a5c8763ea489b` for compliance and onboarding policy content.
3. The live `docs.swipelux.com` routes for the legacy URL inventory and redirect coverage.
4. Older plans and local working-tree content only as historical context.

The dirty local `docs-new` checkout is not a source of truth. Content must be read from the fetched `origin/main` tree so unrelated local edits are never copied.

## Current API facts

The supplied contract is OpenAPI 3.1.0, titled **Swipelux API v3 [Beta]**, version `3.1.0`. It contains:

- 49 paths and 74 HTTP operations.
- 87 component schemas.
- 12 OpenAPI webhook definitions.
- Only `/v3/...` HTTP paths.
- The base URL `https://platform.swipelux.com`.
- `X-API-Key` authentication for public operations.
- Production and sandbox selection by API key, not by hostname.

The six sandbox operations are in scope because they are present in the approved current contract.

## Goals

- Give developers a reliable path from first API call to a completed sandbox transfer.
- Generate exhaustive endpoint documentation from the v3 contract instead of maintaining request and response schemas by hand.
- Explain the v3 customer, capability, task, account, recipient, quote, transfer, rule, and webhook model.
- Preserve all substantive compliance, business onboarding, and individual onboarding information from the current public docs source.
- Separate policy requirements from implementation instructions so legal prose does not drift with API mechanics.
- Preserve useful inbound links with redirects from the current public docs routes.
- Make the repository self-contained for Mintlify hosting.

## Non-goals

- Do not document v1 or v2, even as migration guidance.
- Do not preserve the old hand-written API reference.
- Do not invent webhook signatures, retry schedules, permissions, legal conclusions, country support, limits, timelines, or product behavior missing from the approved sources.
- Do not silently rewrite legal or compliance assertions. Preserve their meaning and place uncertain claims in a review register.
- Do not migrate `content/t-c/**` in this initial scope. Terms-of-Service documentation was not part of the approved three-section content request; its existing routes are intentionally retired unless the user expands the scope during written-spec review.
- Do not redesign Swipelux branding. Use existing approved brand assets and product language.
- Do not make the docs repository depend on files outside the repository at build or deployment time.

## Information architecture

### Landing page

The root page introduces Swipelux and routes readers to the three primary sections. It explains the difference between guides, generated reference material, and policy information without duplicating their contents.

### Integration Docs

Integration Docs own implementation sequencing and operational guidance.

#### Start

- `integration/overview` — API v3 overview and object map.
- `integration/quickstart` — customer to completed sandbox transfer.
- `integration/starter-kit` — current Swipelux starter application and the boundary between demo and live credentials.
- `integration/authentication` — `X-API-Key`, server-side handling, and environment selection.
- `integration/environments` — production and sandbox behavior on the shared hostname.
- `integration/using-the-api-reference` — how guides and generated operation pages work together.
- `integration/request-safety` — idempotency, retries, correlation IDs, and safe replay.
- `integration/errors` — problem responses, field errors, and retry guidance.
- `integration/pagination-and-sync` — cursor pagination, `updatedAfter`, and missed-webhook recovery.

#### Onboarding

- `integration/onboarding/individuals` — create an individual, request a capability, complete tasks, and monitor readiness.
- `integration/onboarding/businesses` — create a business, add related parties, request a capability, and complete tasks.
- `integration/onboarding/tasks-and-submissions` — task revisions, hosted sessions, immutable submissions, remediation, and outcomes.
- `integration/onboarding/documents` — upload documents and reference them in task submissions.

#### Accounts and money movement

- `integration/accounts` — issued and external wallet and bank accounts, including settlement accounts.
- `integration/recipients` — third-party recipients and destinations versus customer-owned accounts.
- `integration/quotes-and-transfers` — quote creation, execution, transfer states, instructions, and transfer-scoped tasks.
- `integration/receive-funds` — inbound deposits and funding instructions.
- `integration/send-funds` — first-party and third-party payouts.
- `integration/rules` — automated sweeps from custodial wallet accounts.

#### Events and launch

- `integration/webhooks` — endpoint setup, event handling, deduplication, resource refetch, and recovery.
- `integration/sandbox` — deterministic top-ups, state changes, task review, verification, and capability testing.
- `integration/production-readiness` — credential handling, idempotency, webhook recovery, and launch checklist.

Guides link to generated API pages for exact fields. They do not duplicate complete schemas.

### API Reference

The repository stores a Mintlify-ready `openapi.json`. Mintlify generates endpoint and schema pages from it.

Reference navigation follows the contract taxonomy:

- Customers and related parties
- Capabilities and institutions
- Tasks and task submissions
- Documents
- Accounts and account fees
- Recipients and destinations
- Quotes, rates, and transfers
- Rules
- Sandbox
- Webhook management
- Webhook events

The generated reference preserves all 74 v3 operations and all 12 current webhook definitions. Hand-written overview pages may explain authentication and the webhook envelope, but must not replace generated endpoint pages.

### Knowledge Base

Knowledge Base owns business, legal, compliance, and onboarding policy content.

#### Compliance

- Overview
- Regulatory perimeter and responsibilities
- Supported business models
- Jurisdictions and availability
- Transaction limits
- Custody and wallet controls
- Payment methods and payout restrictions
- Travel Rule
- Screening and monitoring
- Governance, retention, and privacy

#### Business onboarding

- Overview
- Entity and business types
- Document requirements
- Shareholders, UBOs, and control persons
- KYB review workflow
- FAQ

#### Individual onboarding

- Overview
- Verification levels
- Verification status and workflow
- API workflow, rewritten for v3 capabilities, tasks, and submissions

Knowledge Base pages may link to Integration Docs but must not contain v1/v2 examples or duplicate generated request schemas.

### Mintlify navigation skeleton

The implementation uses three top-level tabs. The root `index.mdx` remains reachable through the logo and direct root URL rather than becoming a fourth tab.

```json
{
  "navigation": {
    "tabs": [
      {
        "tab": "Integration Docs",
        "groups": [
          {
            "group": "Start",
            "pages": [
              "integration/overview",
              "integration/quickstart",
              "integration/starter-kit",
              "integration/authentication",
              "integration/environments",
              "integration/using-the-api-reference",
              "integration/request-safety",
              "integration/errors",
              "integration/pagination-and-sync"
            ]
          },
          {
            "group": "Onboarding",
            "pages": [
              "integration/onboarding/individuals",
              "integration/onboarding/businesses",
              "integration/onboarding/tasks-and-submissions",
              "integration/onboarding/documents"
            ]
          },
          {
            "group": "Accounts and money movement",
            "pages": [
              "integration/accounts",
              "integration/recipients",
              "integration/quotes-and-transfers",
              "integration/receive-funds",
              "integration/send-funds",
              "integration/rules"
            ]
          },
          {
            "group": "Events and launch",
            "pages": [
              "integration/webhooks",
              "integration/sandbox",
              "integration/production-readiness"
            ]
          }
        ]
      },
      {
        "tab": "API Reference",
        "openapi": "openapi.json"
      },
      {
        "tab": "Knowledge Base",
        "groups": [
          {
            "group": "Compliance",
            "pages": [
              "knowledge-base/compliance/overview",
              "knowledge-base/compliance/regulatory-perimeter",
              "knowledge-base/compliance/supported-business-models",
              "knowledge-base/compliance/jurisdictions-and-availability",
              "knowledge-base/compliance/transaction-limits",
              "knowledge-base/compliance/custody-and-wallet-controls",
              "knowledge-base/compliance/payment-methods",
              "knowledge-base/compliance/travel-rule",
              "knowledge-base/compliance/screening-and-monitoring",
              "knowledge-base/compliance/governance-retention-and-privacy"
            ]
          },
          {
            "group": "Business onboarding",
            "pages": [
              "knowledge-base/business-onboarding/overview",
              "knowledge-base/business-onboarding/entity-and-business-types",
              "knowledge-base/business-onboarding/document-requirements",
              "knowledge-base/business-onboarding/shareholders-ubos-and-control-persons",
              "knowledge-base/business-onboarding/kyb-workflow",
              "knowledge-base/business-onboarding/faq"
            ]
          },
          {
            "group": "Individual onboarding",
            "pages": [
              "knowledge-base/individual-onboarding/overview",
              "knowledge-base/individual-onboarding/verification-levels",
              "knowledge-base/individual-onboarding/status-and-workflow",
              "knowledge-base/individual-onboarding/api-workflow"
            ]
          }
        ]
      }
    ]
  }
}
```

An `openapi-coverage.json` manifest records every path-method-operationId and webhook name and verifies that Mintlify places each generated operation and webhook exactly once.

## OpenAPI handling

The repository-local `openapi.json` is a derived public documentation artifact created from the user-supplied contract. The input file has SHA-256 `ac2cb435a7099da53e6028bca98a4d57f0a1bf684cddfe64c438106a2997e3a7`.

The implementation adds:

- `scripts/prepare-openapi.mjs` — accepts an input contract, verifies its SHA-256, applies an explicit JSON-pointer transformation allowlist, and writes `openapi.json`.
- `openapi-provenance.json` — records the source hash, preparation-script version, generation time, and before/after hashes for every transformed JSON pointer.
- `openapi-coverage.json` — records exact path-method-operationId tuples, webhook names, component names, and canonical schema hashes.

The unmodified source file is not committed because it contains legacy webhook material that must not be published. Reproduction uses the source hash plus the deterministic preparation script. A different input hash fails closed until the source and transformations are reviewed again.

The preparation step must:

- Preserve the exact set of 49 paths, 74 v3 operations, operation IDs, servers, parameters, response codes, request/response semantics, 87 component names, and 12 current webhook definitions.
- Remove only the explicitly identified legacy/v1/v2 webhook schema branches and examples from public output.
- Remove unused `serviceToken` and `uploadToken` schemes from the public projection because no public operation references them.
- Reject any HTTP path that does not begin with `/v3/`.
- Preserve `$ref` closure and fail if a transformation creates a dangling reference.
- Avoid broad schema rewrites unless a reproducible Mintlify validation or rendering failure proves one is required.
- Record every documentation-only transformation and semantic comparison in source control.

Known contract findings receive these dispositions:

| Finding | Public-docs disposition |
|---|---|
| Two webhook definitions contain legacy and v3 variants | Remove only the legacy variants in the documented projection. |
| The webhook allowlist includes `api.deprecation` and `transfer.created` without webhook schemas | Preserve the allowlist values but do not invent event payload pages. Record the missing schemas as an API-owner follow-up. |
| Root API-key security may be inherited by incoming webhook definitions | Do not publish an authentication claim or auth input on webhook-event pages until the API owner confirms the correct webhook security semantics. |
| Webhook signing, retries, timeout, and ordering are unspecified | Omit those claims. The guide covers only event IDs, payloads, resource refetch, portal replay, and `updatedAfter` recovery supported by the contract. |
| Transfer cancellation documents only `409 transfer_not_cancelable` | Keep the generated operation and state clearly that no current state is cancelable. |
| Unusual JSON Schema constructs may render poorly | Test each affected schema. Apply a narrow, recorded presentation transformation only when Mintlify cannot render the authoritative shape. |

### Mintlify compatibility and API execution

The first release disables live API execution globally:

```json
{
  "api": {
    "playground": {
      "display": "none"
    }
  }
}
```

Generated request examples remain visible, but visitors cannot paste production credentials or execute mutating operations from the public site. Enabling a sandbox-only playground later requires a separate security review and an implementation that cannot accept or persist production keys.

Validation must exercise every schema containing advanced JSON Schema constructs and every webhook page. If Mintlify cannot render a webhook or schema correctly, a deterministic generated-MDX fallback may be used for that page while retaining `openapi.json` as the data source. The fallback must also render correctly without client JavaScript and through Mintlify's Markdown representation.

## Content migration rules

- Read source pages from `docs-new` `origin/main`, never from its dirty working tree.
- Preserve substantive legal and policy meaning while converting Fumadocs components to Mintlify MDX.
- Rebuild every endpoint, host, status, and workflow reference from v3.
- Replace direct KYC/KYB endpoint sequences with the capability → application → task → submission model.
- Use `https://platform.swipelux.com` consistently.
- Use obvious placeholders such as `YOUR_API_KEY`; never include real-looking credentials.
- Keep secret API keys out of client-side examples and browser storage.
- Use active voice, second person, concise sentences, and sentence-case headings.
- Use “Swipelux payment infrastructure” as the broad product description; use wallets, accounts, capabilities, and rails only for their precise concepts.

`docs/content-migration-ledger.md` maps every source page and section to one of four outcomes: preserved policy, contract-derived technical rewrite, intentional omission, or owner review required. Technical procedures move to Integration Docs even when their source page lived under onboarding or compliance.

Legal and operational claims that require owner confirmation are tracked in that ledger. This includes licensing, jurisdiction lists, vertical eligibility, limits, custody claims, Travel Rule thresholds, retention, UBO thresholds, document requirements, and review timelines. Every blocking item must be approved by the accountable legal/compliance owner or removed from the release before the branch merges to `main`.

## Redirect strategy

Mintlify redirects preserve current public URLs and consolidate duplicate content. `docs/redirect-inventory.json` records each exact source path, destination path, rationale, and preview verification result; wildcard prose is not the implementation artifact.

- `/get-started/*` redirects to the matching Integration Docs page.
- `/compliance/*` redirects to `/knowledge-base/compliance/*`.
- `/business-onboarding/*` redirects to `/knowledge-base/business-onboarding/*` or the relevant technical onboarding guide.
- `/individual-onboarding/*` redirects to `/knowledge-base/individual-onboarding/*` or the relevant technical onboarding guide.
- Old local API-reference pages redirect to the generated v3 API Reference root or the closest current operation group.
- The moved compliance merchant-onboarding page redirects to the business-onboarding overview.
- `/t-c/*` receives no redirect in the approved initial scope and returns `404` after cutover.

Anchor fragments containing v1/v2 endpoint paths cannot be preserved meaningfully. Their page routes redirect to the nearest current v3 reference group.

Legacy version identifiers are permitted only in non-rendered design/history documents. They are prohibited in redirect destinations, published MDX, generated API pages, rendered HTML/Markdown, search content, and code examples. Existing content routes do not require `/v1/` or `/v2/` redirect keys because those versions appeared in URL fragments rather than page paths.

## Branding and site configuration

- Replace all Mintlify starter branding, links, email addresses, and social profiles.
- Use approved Swipelux light/dark logos, favicon, colors, and product naming.
- Keep the primary navigation limited to Integration Docs, API Reference, and Knowledge Base.
- Link the primary call to action to the Swipelux dashboard or contact path already used by the current product.
- Launch with contextual actions limited to copy and view. Third-party AI/editor actions can be enabled later after a deliberate privacy and UX review.

## Deployment model

The Mintlify dashboard must select:

- Organization: `swipelux`
- Repository: `public-docs`
- Deployment branch: `main`
- Docs directory: repository root

Implementation occurs on `codex/public-docs-rebuild`. Pull requests provide review and preview deployments. Production deployment occurs after the approved changes reach `main`. The Mintlify GitHub App must have access to this repository.

The repository pins Node.js `24.15.0` and Mintlify CLI `4.2.775` for repeatable local and CI checks. Required pull-request checks run validation, link/redirect checks, OpenAPI semantic comparison, legacy-content guards, and representative preview HTTP tests.

Merging is blocked until:

- Required CI checks pass.
- The content migration ledger has no unresolved release-blocking legal/compliance items.
- The preview deployment has been reviewed.
- The live deployment branch in Mintlify Git Settings is confirmed as `main`.

After merge, verify that production serves the merged commit and smoke-test the root page, all three tabs, a generated operation, a webhook page, and representative redirects. Rollback uses a Git revert on `main`, followed by verification that Mintlify deployed the reverted commit.

## Verification

The implementation is complete only when fresh checks prove all of the following:

1. `mint validate` succeeds.
2. `mint broken-links --check-anchors --check-redirects` succeeds.
3. `mint a11y` completes without blocking findings.
4. A static guard finds no `/v1/`, `/v2/`, deprecated hosts, starter branding, real-looking credentials, PII, or internal URLs in published content, examples, or vendor extensions.
5. Every OpenAPI HTTP path starts with `/v3/`.
6. Semantic OpenAPI comparison proves the prepared artifact retains the exact path-method-operationId set, servers, operation security, parameters, response codes, 87 component names and schema hashes, 12 webhook names and schemas, and complete `$ref` closure. Counts alone are insufficient.
7. All current compliance, business-onboarding, and individual-onboarding source pages have either a destination page or an intentional redirect.
8. A local Mintlify preview renders the three primary sections, every advanced-schema fixture, and representative generated endpoint and webhook pages with and without client JavaScript and through the Markdown representation.
9. Preview HTTP checks verify every exact redirect in `docs/redirect-inventory.json`.
10. A coverage check proves all 74 operations and 12 webhook definitions appear exactly once in the intended API Reference navigation.
11. Git status contains only task-related changes.

## Risks and mitigations

- **Legal content may be stale.** Preserve meaning, track review-sensitive claims, and require accountable legal/compliance approval before merge.
- **The OpenAPI contract contains documentation-quality issues.** Use minimal deterministic preparation and avoid semantic invention.
- **Generated webhook rendering may differ from endpoint rendering.** Validate representative webhook pages in Mintlify before finalizing navigation.
- **Generated webhook pages may inherit inappropriate API-key UI.** Block those pages or use the deterministic generated-MDX fallback until their presentation makes no unverified authentication claim.
- **The public API playground could accept production credentials.** Keep it disabled for the initial release.
- **Legacy links may be widely shared.** Build redirects from the complete current route inventory and verify them.
- **Guides can drift from generated reference material.** Keep guides conceptual and link to generated operations instead of copying schemas.

## Completion boundary

This rebuild delivers a validated Mintlify repository and a branch ready for review. Production merge requires completed legal/compliance sign-off, successful preview review, and the appropriate GitHub permissions. Mintlify dashboard configuration and GitHub App installation require the appropriate Mintlify and organization permissions.
