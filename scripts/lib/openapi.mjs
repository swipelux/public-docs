import { createHash } from "node:crypto";

export const SOURCE_SHA256 =
  "f19f21bfc4bba4d449f502538aa96d3c49d1a14945c893ecdf22adc2027d2129";
export const SOURCE_BASENAME = "openapi-v3-f1f822e.json";
export const SOURCE_REPOSITORY = "swipelux/wallet-infrastructure";
export const SOURCE_COMMIT = "f1f822e48d75c6bc7a379aa555ac85dc98818d9f";
export const SOURCE_ROUTE = "/openapi-v3.json";
export const EXPECTED_OUTPUT_SHA256 =
  "383bc77dc13aa2fdbff7792d6b6a4788bf330682827c74e059f3dacfd061245c";
export const EXPECTED_COVERAGE_SHA256 =
  "109b1e09f0aec68cbf8a7fc00f110e7a172fd80b3c525673761fa749ed6a9e02";
export const EXPECTED_TRANSFORMATIONS_SHA256 =
  "e22b21e98248ee6dc775565368a2345ff0e77f76f4a80091ebf7b01d8cfa343e";
// Public API label preparation timestamp, normalized to UTC whole seconds.
export const APPROVED_GENERATED_AT = "2026-10-08T08:33:13.000Z";
export const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
]);
export const PREPARATION_VERSION = "1.4.0";

export const EXPECTED_OPENAPI_COUNTS = Object.freeze({
  paths: 52,
  operations: 78,
  schemas: 92,
  webhooks: 12,
});
const CUSTOMER_WEBHOOKS = ["customer.created", "customer.updated"];
const LEGACY_VERSION_PATTERN = /(^|[^A-Za-z0-9])v[12](?=$|[^A-Za-z0-9])/i;
const LEGACY_REFERENCE_REASON =
  "Remove legacy API version references from the public contract.";
const LEGACY_REFERENCE_REWRITES = Object.freeze([
  {
    pointer: "/paths/~1v3~1customers~1{customerId}~1documents/post/description",
    value:
      "Uploads one PDF, JPEG, PNG, WebP, or HEIF/HEIC document up to 25 MB. Send multipart file bytes, or consume a fresh customer-scoped opaque storageKey returned by the direct-upload flow. Returns metadata for task submissions.",
  },
  {
    pointer:
      "/paths/~1v3~1customers~1{customerId}~1documents/post/requestBody/content/application~1json/schema/properties/storageKey/description",
    value: "Opaque storageKey returned by the direct-upload flow.",
  },
]);
const PUBLIC_V3_COMPATIBILITY_PATHS = new Set([
  "/kyc/redirect/{customerId}/{taskId}/{verificationSessionId}",
]);
const SIDEBAR_TITLE_REASON =
  "Use the operation summary as the Mintlify sidebar title.";
const WEBHOOK_SECURITY_REASON =
  "Publish webhook events without API key authentication.";
const WEBHOOK_CONTENT_REASON =
  "Explain webhook signature verification on each event page.";
const WEBHOOK_EVENT_CONTENT =
  "Verify the raw request body with your endpoint signing secret and the `svix-id`, `svix-timestamp`, and `svix-signature` headers before you trust this event. See [Verify before parsing](/integration/webhooks#verify-before-parsing).";
const UNION_TITLE_REASON =
  "Label each union option with its discriminator value.";
const EXAMPLE_NAME_REASON = "Name each example with its summary.";
const PLAIN_LANGUAGE_REASON =
  "Describe the operation without internal implementation terms.";
const UNION_KEYWORDS = ["oneOf", "anyOf"];
const PLAIN_LANGUAGE_REWRITES = Object.freeze([
  {
    pointer: "/paths/~1v3~1customers/get/description",
    from: "Lists CustomerSummary resources in deterministic createdAt DESC, id DESC order. Canonical contact and free-text filters are case-insensitive and compose with exact identity and strict timestamp filters. Pass include=capabilities,documentRequirements to attach independent capability and required-document summaries to every customer.",
    to: "Lists customer summaries, newest first (createdAt descending, then id descending). Contact and free-text filters are case-insensitive and combine with exact identity and strict timestamp filters. Pass include=capabilities, include=documentRequirements, or include=capabilities,documentRequirements to attach capability summaries, required-document summaries, or both to every customer.",
  },
  {
    pointer: "/paths/~1v3~1customers/post/description",
    from: "Creates the canonical customer union atomically. Individuals require only type; businesses require business.legalName. Email and phone values are not unique customer keys.",
    to: "Creates an individual or business customer. The request succeeds or fails as a whole. Individuals require only type; businesses also require business.legalName. Email and phone values do not have to be unique across customers.",
  },
  {
    pointer: "/paths/~1v3~1customers~1{customerId}/get/description",
    from: "Returns the canonical customer detail union. Business details embed active related parties.",
    to: "Returns the individual or business customer. Business customers include their active related parties.",
  },
  {
    pointer: "/paths/~1v3~1customers~1{customerId}/patch/description",
    from: "Deep-merges canonical customer facts. Arrays replace atomically, null clears nullable facts, metadata merges by key, and related-party ids upsert in place.",
    to: "Deep-merges the supplied customer fields. Arrays are replaced whole, null clears nullable fields, metadata merges by key, and related parties are upserted by id.",
  },
  {
    pointer: "/paths/~1v3~1customers~1{customerId}/delete/description",
    from: "Archives the customer aggregate atomically. Active accounts and in-flight transfers must be resolved first; the externalId reservation and immutable history are retained.",
    to: "Archives the customer in a single operation. Resolve active accounts and in-flight transfers first. The externalId stays reserved and the customer's history is retained.",
  },
  {
    pointer:
      "/paths/~1v3~1customers~1{customerId}~1capabilities~1{capabilityId}~1tasks-preview/get/description",
    from: "Returns descriptor-only tasks from one pinned, side-effect-free evaluation snapshot. Repeating the optional `institutions` query parameter previews the same explicit institution selection accepted by capability creation; omission selects applicable defaults.",
    to: "Previews the tasks that requesting this capability would open, without creating anything. Repeat the optional `institutions` query parameter to preview the same institution selection that capability creation accepts; omit it to preview the default institutions.",
  },
  {
    pointer:
      "/paths/~1v3~1customers~1{customerId}~1capabilities~1{capabilityId}/post/description",
    from: "Requests a customer capability by permanent capability id. Requesting a canceled capability with a new idempotency key starts a fresh lifecycle after current eligibility and routing checks pass. For bank-backed capabilities, omitted or empty `institutions` lists select applicable defaults; a non-empty list explicitly overrides defaults. When customer intake is incomplete, the capability is created in `restricted` with open tasks and durable planned application identities, while provider submission is deferred until those tasks are satisfied. Known ineligible variants fail instead of silently falling back. The response's `accountProvisioning` reports account issuance separately from entitlement status. Send `Idempotency-Key` for every POST; the same key and body replay the original response, except `accountProvisioning`, which is a read-time projection and is recomputed on every replay so it never reports stale issuance.",
    to: "Requests a customer capability by its capability id. Requesting a canceled capability with a new idempotency key starts it again once current eligibility and routing checks pass. For bank-backed capabilities, an omitted or empty `institutions` list selects the default institutions; a non-empty list overrides them. When customer onboarding is incomplete, the capability is created as `restricted` with open tasks and its planned applications, and submission waits until those tasks are complete. Known ineligible variants fail instead of silently falling back. The response's `accountProvisioning` reports account issuance separately from the capability status. Send `Idempotency-Key` for every POST; the same key and body replay the original response, except `accountProvisioning`, which is recalculated on every replay so it never reports stale issuance.",
  },
  {
    pointer:
      "/paths/~1v3~1customers~1{customerId}~1capabilities~1{capabilityId}~1cancel/post/description",
    from: "Cancels a `pending`, `restricted` or `ready` capability that has no active linked accounts or transfers. The `stablecoin_transfers` capability granted when a customer is created cannot be canceled. Cancellation ends this capability only: its applications keep their status, tasks and approvals, and other capabilities that use the same applications are unaffected. Tasks that belong only to this capability are canceled. The canceled capability remains readable, listing its applications at their current status without open tasks, until a new create request reopens it; that request reuses an existing application at the institution it selects. `accountProvisioning` continues to report account issuance separately. An idempotent replay returns the original response except `accountProvisioning`, which is recomputed at read time.",
    to: "Cancels a `pending`, `restricted`, or `ready` capability that has no active linked accounts or transfers. The `stablecoin_transfers` capability that every new customer receives cannot be canceled. Cancellation ends this capability only: its applications keep their status, tasks, and approvals, and other capabilities that use the same applications are unaffected. Tasks that belong only to this capability are canceled. The canceled capability stays readable, listing its applications at their current status without open tasks, until a new create request reopens it. That request reuses an existing application at the institution it selects. `accountProvisioning` keeps reporting account issuance separately. Replaying the request returns the original response, except `accountProvisioning`, which is recalculated when read.",
  },
  {
    pointer:
      "/paths/~1v3~1customers~1{customerId}~1capabilities~1{capabilityId}~1applications~1{applicationId}~1history/get/description",
    from: "Returns canonical task history grouped by task for this institution flow.",
    to: "Returns the task history for this application, grouped by task.",
  },
  {
    pointer: "/paths/~1v3~1tasks~1{taskId}/get/description",
    from: "Returns a merchant-wide task detail projection without hosted-session URLs.",
    to: "Returns one task from any customer in the current space, without hosted-session URLs.",
  },
  {
    pointer: "/paths/~1v3~1customers~1{customerId}~1tasks~1{taskId}/get/description",
    from: "Returns the authorized task action surface with its immutable allowed submission channels in canonical direct_submission then verification_session order. Process KYC sessions expose exact customer/task/session first-party action URLs only while action is required; in-review, completed or reused, rejected, and canceled process sessions omit action fields. Process, execution, completion, reuse, and provider-configuration identities remain internal.",
    to: "Returns the task, the actions you can take, and its allowed submission channels, listed as direct_submission before verification_session. KYC verification sessions include action URLs only while action is required; sessions that are in review, completed or reused, rejected, or canceled omit action fields.",
  },
  {
    pointer:
      "/paths/~1v3~1customers~1{customerId}~1tasks~1{taskId}~1submissions/get/description",
    from: "Lists redacted submission summaries without answer values, alternatives, or document ids.",
    to: "Lists submission summaries. Answer values, alternatives, and document ids are omitted.",
  },
  {
    pointer:
      "/paths/~1v3~1customers~1{customerId}~1tasks~1{taskId}~1submissions/post/description",
    from: "Creates one immutable direct-submission attempt for the task's current remediation round.",
    to: "Creates one direct submission for the task's current round. A submission can't be changed after it is created.",
  },
  {
    pointer:
      "/paths/~1v3~1customers~1{customerId}~1tasks~1{taskId}~1submissions~1{submissionId}/get/description",
    from: "Returns the authorized immutable answer snapshot and current public outcome.",
    to: "Returns the submitted answers and the submission's current outcome.",
  },
  {
    pointer: "/paths/~1v3~1transfers/get/description",
    from: "Lists quoted transfers, reconciled inbound deposits, and rule-generated outbound transfers in deterministic createdAt/id descending order. Filters are customerId, public state, method, direction, origin, source-or-destination accountId, quoteId, exact externalId, createdAt range, and updatedAfter (the missed-webhook recovery path).",
    to: "Lists quoted transfers, received inbound deposits, and rule-generated outbound transfers, newest first (createdAt, then id, descending). Filters are customerId, public state, method, direction, origin, source-or-destination accountId, quoteId, exact externalId, createdAt range, and updatedAfter (use it to recover missed webhooks).",
  },
  {
    pointer: "/paths/~1v3~1transfers/post/description",
    from: "Executes the selected quote without intentionally re-pricing it. Execution can still fail validation, balance, destination, rail, or provider checks. For card checkouts, optional checkoutMethod pre-selects a checkout method; availability and final fees are confirmed in checkout. Other routes reject this option.",
    to: "Executes the selected quote without re-pricing it. Execution can still fail validation, balance, destination, or routing checks. For card checkouts, the optional checkoutMethod pre-selects a checkout method; availability and final fees are confirmed in checkout. Other routes reject this option.",
  },
  {
    pointer: "/paths/~1v3~1transfers~1{transferId}/get/description",
    from: "Returns a quoted, inbound-deposit, or rule-generated transfer with its amounts/fees snapshot, public state, source/destination, open tasks, rail references, and instructions. Sender evidence is included when available and is never part of webhook payloads.",
    to: "Returns a quoted, inbound-deposit, or rule-generated transfer with its amounts and fees, state, source and destination, open tasks, payment references, and instructions. Sender evidence is included when available and is never part of webhook payloads.",
  },
  {
    pointer: "/paths/~1v3~1quotes/post/description",
    from: "Creates a priced movement that can be executed before `expiresAt` while the quote, capability, balance, destination, rail, and provider checks still pass.",
    to: "Prices a money movement. Execute the quote before `expiresAt`; execution still requires the quote, capability, balance, destination, and routing checks to pass.",
  },
  {
    pointer: "/paths/~1v3~1sandbox~1tasks/post/description",
    from: "Creates a canonical sandbox task scoped to a customer, capability, or transfer.",
    to: "Creates a sandbox task for a customer, capability, or transfer.",
  },
  {
    pointer:
      "/paths/~1kyc~1redirect~1{customerId}~1{taskId}~1{verificationSessionId}/get/summary",
    from: "Open a lifecycle KYC verification session",
    to: "Open a KYC verification session",
  },
  {
    pointer:
      "/paths/~1kyc~1redirect~1{customerId}~1{taskId}~1{verificationSessionId}/get/description",
    from: "Opens one exact customer/task/session first-party link. The service validates lifecycle ownership and sends eligible documents-only sessions to the first-party RFI page. When that page is unavailable, or for a direct hosted fallback or retained questionnaire session, the service creates or refreshes a short-lived provider link without persisting or returning that provider URL in task JSON. An exact session that already completed successfully returns 204 No Content.",
    to: "Opens the verification session for one customer task. Swipelux checks that the session belongs to the customer and task. An eligible session that only asks for documents opens a Swipelux-hosted upload page. Otherwise, or when that page is unavailable, Swipelux redirects to a short-lived verification link that is never stored or returned in task JSON. A session that already completed successfully returns 204 No Content.",
  },
  {
    pointer:
      "/paths/~1kyc~1redirect~1{customerId}~1{taskId}~1{verificationSessionId}/get/responses/302/description",
    from: "Redirect to the first-party RFI resolver or to a short-lived provider-hosted verification URL.",
    to: "Redirect to a Swipelux-hosted document upload page or to a short-lived verification URL.",
  },
  {
    pointer:
      "/paths/~1kyc~1redirect~1{customerId}~1{taskId}~1{verificationSessionId}/get/responses/302/headers/Location/description",
    from: "First-party RFI resolver URL or short-lived HTTPS provider URL.",
    to: "Swipelux-hosted document upload page URL or short-lived HTTPS verification URL.",
  },
  {
    pointer: "/webhooks/customer.created/post/description",
    from: "Triggered after a v3 customer creation transaction and its redacted outbox event commit atomically.",
    to: "Triggered after a customer is created.",
  },
  {
    pointer: "/webhooks/customer.updated/post/description",
    from: "Triggered after v3 customer facts, metadata, or related-party changes commit with a redacted change-category projection.",
    to: "Triggered after a customer's details, metadata, or related parties change. The payload names the changed categories without their values.",
  },
  {
    pointer: "/webhooks/customer.archived/post/description",
    from: "Triggered after a v3 customer and its archive cascade commit atomically.",
    to: "Triggered after a customer and its dependent resources are archived.",
  },
  {
    pointer: "/webhooks/capability.created/post/description",
    from: "Triggered when a canonical v3 capability is created with its task projection.",
    to: "Triggered when a capability is created. The payload includes a summary of its tasks.",
  },
  {
    pointer: "/webhooks/capability.status_changed/post/description",
    from: "Triggered when a canonical v3 capability enters a new public state after creation.",
    to: "Triggered when a capability's status changes after creation.",
  },
]);

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function canonicalHash(value) {
  const serialized = JSON.stringify(canonicalize(value));
  if (serialized === undefined) {
    throw new TypeError("canonicalHash requires a JSON-serializable value");
  }
  return createHash("sha256").update(serialized).digest("hex");
}

function slugSegment(value) {
  const slug = String(value)
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  if (!slug) throw new Error(`Cannot create a stable slug from ${String(value)}`);
  return slug;
}

export function operationSlug(tag, operationId) {
  const tagSlug = slugSegment(tag);
  return operationId === undefined
    ? tagSlug
    : `${tagSlug}/${slugSegment(operationId)}`;
}

function operationGroup(operation) {
  const tags = Array.isArray(operation?.tags)
    ? operation.tags.filter(
        (tag) => typeof tag === "string" && tag.trim() !== "",
      )
    : [];
  return [...tags].sort(compareStrings)[0] ?? "untagged";
}

function operationHref(operation) {
  const configuredHref = operation?.["x-mint"]?.href;
  if (configuredHref !== undefined) return configuredHref;
  return `/api-reference/${operationSlug(
    operationGroup(operation),
    operation.operationId,
  )}`;
}

function webhookHref(operation) {
  const configuredHref = operation?.["x-mint"]?.href;
  if (configuredHref !== undefined) return configuredHref;
  return stableWebhookHref(operation);
}

function stableWebhookHref(operation) {
  return `/api-reference/${operationSlug("webhooks", operation.operationId)}`;
}

function validateXMint(operation, label) {
  const xMint = operation?.["x-mint"];
  if (xMint === undefined) return;
  if (!isPlainObject(xMint)) {
    throw new Error(`x-mint must be an object for ${label}`);
  }
  if (
    Object.hasOwn(xMint, "metadata") &&
    !isPlainObject(xMint.metadata)
  ) {
    throw new Error(`x-mint.metadata must be an object for ${label}`);
  }
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortByFields(fields) {
  return (left, right) => {
    for (const field of fields) {
      const comparison = compareStrings(
        String(left[field]),
        String(right[field]),
      );
      if (comparison !== 0) return comparison;
    }
    return 0;
  };
}

function httpOperations(container) {
  if (!isPlainObject(container)) return [];
  return Object.entries(container)
    .filter(([method]) => HTTP_METHODS.has(method))
    .map(([method, operation]) => ({ method, operation }));
}

export function buildCoverage(spec) {
  const operations = [];
  for (const path of Object.keys(spec?.paths ?? {}).sort()) {
    for (const { method, operation } of httpOperations(spec.paths[path])) {
      operations.push({
        method,
        path,
        operationId: operation.operationId,
        href: operationHref(operation),
        hash: canonicalHash(operation),
      });
    }
  }
  operations.sort(sortByFields(["path", "method", "operationId"]));

  const webhooks = [];
  for (const name of Object.keys(spec?.webhooks ?? {}).sort()) {
    for (const { operation } of httpOperations(spec.webhooks[name])) {
      webhooks.push({
        name,
        operationId: operation.operationId,
        href: webhookHref(operation),
        hash: canonicalHash(operation),
      });
    }
  }
  webhooks.sort(sortByFields(["name", "operationId"]));

  const components = Object.entries(spec?.components?.schemas ?? {})
    .map(([name, schema]) => ({ name, hash: canonicalHash(schema) }))
    .sort(sortByFields(["name"]));

  return { operations, webhooks, components };
}

export function compareCoverage(expected, actual) {
  for (const collection of ["operations", "webhooks", "components"]) {
    const expectedCollection = expected?.[collection];
    const actualCollection = actual?.[collection];
    if (!Array.isArray(expectedCollection) || !Array.isArray(actualCollection)) {
      throw new Error(`${collection} coverage changed: collections must be arrays`);
    }
    const expectedHash = canonicalHash(expectedCollection);
    const actualHash = canonicalHash(actualCollection);
    if (expectedHash !== actualHash) {
      throw new Error(
        `${collection} coverage changed: expected ${expectedHash}, received ${actualHash}`,
      );
    }
  }
}

function escapePointerSegment(segment) {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function parsePointer(pointer) {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) {
    throw new Error(`Invalid JSON pointer: ${pointer}`);
  }
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => {
      let decoded = "";
      for (let index = 0; index < segment.length; index += 1) {
        const character = segment[index];
        if (character !== "~") {
          decoded += character;
          continue;
        }

        const escape = segment[index + 1];
        if (escape === "0") decoded += "~";
        else if (escape === "1") decoded += "/";
        else {
          const invalidEscape = escape === undefined ? "~" : `~${escape}`;
          throw new Error(
            `Invalid JSON pointer escape ${invalidEscape} in ${pointer}`,
          );
        }
        index += 1;
      }
      return decoded;
    });
}

function pointerState(root, pointer) {
  let current = root;
  for (const segment of parsePointer(pointer)) {
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.hasOwn(current, segment)
    ) {
      return { exists: false, value: undefined };
    }
    current = current[segment];
  }
  return { exists: true, value: current };
}

function setPointer(root, pointer, value) {
  const segments = parsePointer(pointer);
  if (segments.length === 0) throw new Error("Cannot replace the document root");

  let current = root;
  for (const segment of segments.slice(0, -1)) {
    if (!Object.hasOwn(current, segment)) current[segment] = {};
    if (current[segment] === null || typeof current[segment] !== "object") {
      throw new Error(`Cannot traverse JSON pointer: ${pointer}`);
    }
    current = current[segment];
  }
  current[segments.at(-1)] = structuredClone(value);
}

function deletePointer(root, pointer) {
  const segments = parsePointer(pointer);
  if (segments.length === 0) throw new Error("Cannot delete the document root");

  let current = root;
  for (const segment of segments.slice(0, -1)) {
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.hasOwn(current, segment)
    ) {
      return false;
    }
    current = current[segment];
  }
  return delete current[segments.at(-1)];
}

function pointerHash(state) {
  return state.exists ? canonicalHash(state.value) : canonicalHash(null);
}

function addReplacement(spec, transformations, pointer, value, reason) {
  const before = pointerState(spec, pointer);
  if (!before.exists) throw new Error(`Missing transformation source: ${pointer}`);
  setPointer(spec, pointer, value);
  transformations.push({
    pointer,
    reason,
    beforeHash: pointerHash(before),
    afterHash: canonicalHash(value),
  });
}

function addDeletion(spec, transformations, pointer, reason) {
  const before = pointerState(spec, pointer);
  if (!before.exists) throw new Error(`Missing transformation source: ${pointer}`);
  deletePointer(spec, pointer);
  transformations.push({
    pointer,
    reason,
    beforeHash: pointerHash(before),
    afterHash: null,
  });
}

function addValue(spec, transformations, pointer, value, reason) {
  const before = pointerState(spec, pointer);
  setPointer(spec, pointer, value);
  transformations.push({
    pointer,
    reason,
    beforeHash: pointerHash(before),
    afterHash: canonicalHash(value),
  });
}

function collectOperationIdentities(spec, section) {
  const entries = [];
  for (const key of Object.keys(spec?.[section] ?? {}).sort()) {
    for (const { method, operation } of httpOperations(spec[section][key])) {
      entries.push({ key, method, operationId: operation.operationId });
    }
  }
  return entries.sort(sortByFields(["key", "method", "operationId"]));
}

function collectLocatedProperty(spec, property) {
  const entries = [];
  if (Object.hasOwn(spec, property)) {
    entries.push({ location: "/", value: spec[property] });
  }

  for (const section of ["paths", "webhooks"]) {
    for (const key of Object.keys(spec?.[section] ?? {}).sort()) {
      const item = spec[section][key];
      if (isPlainObject(item) && Object.hasOwn(item, property)) {
        entries.push({ location: `/${section}/${key}`, value: item[property] });
      }
      for (const { method, operation } of httpOperations(item)) {
        if (Object.hasOwn(operation, property)) {
          entries.push({
            location: `/${section}/${key}/${method}`,
            value: operation[property],
          });
        }
      }
    }
  }

  return entries.sort(sortByFields(["location"]));
}

function collectResponseCodes(spec) {
  const entries = [];
  for (const section of ["paths", "webhooks"]) {
    for (const key of Object.keys(spec?.[section] ?? {}).sort()) {
      for (const { method, operation } of httpOperations(spec[section][key])) {
        entries.push({
          location: `/${section}/${key}/${method}`,
          codes: Object.keys(operation.responses ?? {}).sort(),
        });
      }
    }
  }
  return entries.sort(sortByFields(["location"]));
}

function collectRefs(value, pointer = "", refs = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectRefs(item, `${pointer}/${index}`, refs),
    );
    return refs;
  }
  if (!isPlainObject(value)) return refs;

  for (const key of Object.keys(value).sort()) {
    const childPointer = `${pointer}/${escapePointerSegment(key)}`;
    if (key === "$ref" && typeof value[key] === "string") {
      refs.push({ pointer: childPointer, ref: value[key] });
    } else {
      collectRefs(value[key], childPointer, refs);
    }
  }
  return refs;
}

function isWithinPointer(pointer, ancestor) {
  return pointer === ancestor || pointer.startsWith(`${ancestor}/`);
}

function refsOutsideTransformations(spec, transformations) {
  return collectRefs(spec).filter(
    (entry) =>
      !transformations.some((item) =>
        isWithinPointer(entry.pointer, item.pointer),
      ),
  );
}

function singleStringValue(schema) {
  if (!isPlainObject(schema)) return undefined;
  if (typeof schema.const === "string") return schema.const;
  if (
    Array.isArray(schema.enum) &&
    schema.enum.length === 1 &&
    typeof schema.enum[0] === "string"
  ) {
    return schema.enum[0];
  }
  return undefined;
}

function unionOptionLabels(union) {
  const branches = union.options;
  if (
    branches.length < 2 ||
    !branches.every(
      (branch) =>
        isPlainObject(branch) &&
        !Object.hasOwn(branch, "$ref") &&
        !Object.hasOwn(branch, "title") &&
        isPlainObject(branch.properties),
    )
  ) {
    return undefined;
  }

  const candidates = [
    "code",
    union.discriminator,
    ...Object.keys(branches[0].properties).sort(),
  ].filter((name) => typeof name === "string");
  for (const name of [...new Set(candidates)]) {
    const labels = branches.map((branch) =>
      singleStringValue(branch.properties[name]),
    );
    if (
      labels.every((label) => typeof label === "string" && label !== "") &&
      new Set(labels).size === labels.length
    ) {
      return labels;
    }
  }
  return undefined;
}

function collectUnions(value, pointer, unions) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectUnions(item, `${pointer}/${index}`, unions),
    );
    return unions;
  }
  if (!isPlainObject(value)) return unions;

  for (const key of Object.keys(value).sort()) {
    const childPointer = `${pointer}/${escapePointerSegment(key)}`;
    if (UNION_KEYWORDS.includes(key) && Array.isArray(value[key])) {
      unions.push({
        pointer: childPointer,
        options: value[key],
        discriminator: value.discriminator?.propertyName,
      });
    }
    collectUnions(value[key], childPointer, unions);
  }
  return unions;
}

function unionTitleTransformations(spec) {
  const transformations = [];
  for (const [value, pointer] of [
    [spec?.paths, "/paths"],
    [spec?.webhooks, "/webhooks"],
    [spec?.components?.schemas, "/components/schemas"],
  ]) {
    for (const union of collectUnions(value ?? {}, pointer, [])) {
      const labels = unionOptionLabels(union);
      if (!labels) continue;
      labels.forEach((label, index) =>
        transformations.push({ pointer: `${union.pointer}/${index}/title`, value: label }),
      );
    }
  }
  return transformations;
}

function collectExampleMaps(value, pointer, maps) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectExampleMaps(item, `${pointer}/${index}`, maps),
    );
    return maps;
  }
  if (!isPlainObject(value)) return maps;

  for (const key of Object.keys(value).sort()) {
    const childPointer = `${pointer}/${escapePointerSegment(key)}`;
    if (
      key === "examples" &&
      isPlainObject(value[key]) &&
      /\/(?:requestBody|responses\/[^/]+)\/content\/[^/]+$/.test(pointer)
    ) {
      maps.push({ pointer: childPointer, examples: value[key] });
      continue;
    }
    collectExampleMaps(value[key], childPointer, maps);
  }
  return maps;
}

function exampleNameTransformations(spec) {
  const transformations = [];
  for (const section of ["paths", "webhooks"]) {
    for (const { pointer, examples } of collectExampleMaps(
      spec?.[section] ?? {},
      `/${section}`,
      [],
    )) {
      const entries = Object.entries(examples).map(([name, example]) => [
        isPlainObject(example) &&
        typeof example.summary === "string" &&
        example.summary.trim() !== ""
          ? example.summary
          : name,
        example,
      ]);
      const names = entries.map(([name]) => name);
      if (new Set(names).size !== names.length) continue;
      if (names.every((name, index) => name === Object.keys(examples)[index])) {
        continue;
      }
      transformations.push({ pointer, value: Object.fromEntries(entries) });
    }
  }
  return transformations;
}

function optionalTransformationReason(pointer) {
  if (LEGACY_REFERENCE_REWRITES.some((rewrite) => rewrite.pointer === pointer)) {
    return LEGACY_REFERENCE_REASON;
  }
  if (PLAIN_LANGUAGE_REWRITES.some((rewrite) => rewrite.pointer === pointer)) {
    return PLAIN_LANGUAGE_REASON;
  }
  if (
    /^\/(?:paths|webhooks|components\/schemas)\/.+\/(?:oneOf|anyOf)\/\d+\/title$/.test(
      pointer,
    )
  ) {
    return UNION_TITLE_REASON;
  }
  if (
    /^\/(?:paths|webhooks)\/.+\/(?:requestBody|responses\/[^/]+)\/content\/[^/]+\/examples$/.test(
      pointer,
    )
  ) {
    return EXAMPLE_NAME_REASON;
  }
  return undefined;
}

function expectedTransformationReasons(spec) {
  const expected = new Map([
    [
      "/info/title",
      "Use the product-facing API title in the public reference.",
    ],
    [
      "/x-tagGroups/0/name",
      "Use the product-facing API group label in the public reference.",
    ],
    [
      "/components/securitySchemes/serviceToken",
      "Remove non-public service-token authentication from the public contract.",
    ],
    [
      "/components/securitySchemes/uploadToken",
      "Remove non-public upload-token authentication from the public contract.",
    ],
  ]);

  for (const name of CUSTOMER_WEBHOOKS) {
    const base = `/webhooks/${escapePointerSegment(name)}/post/requestBody/content/application~1json`;
    expected.set(
      `${base}/schema`,
      `Publish only the v3 ${name} webhook envelope.`,
    );
    expected.set(
      `${base}/examples/legacy`,
      `Remove the legacy ${name} webhook example.`,
    );
  }

  for (const path of Object.keys(spec?.paths ?? {}).sort()) {
    for (const { method, operation } of httpOperations(spec.paths[path])) {
      const base = `/paths/${escapePointerSegment(path)}/${method}`;
      expected.set(
        `${base}/x-mint/href`,
        "Assign a stable Mintlify URL to the HTTP operation.",
      );
      if (hasSummary(operation)) {
        expected.set(`${base}/x-mint/metadata/sidebarTitle`, SIDEBAR_TITLE_REASON);
      }
    }
  }

  for (const name of Object.keys(spec?.webhooks ?? {}).sort()) {
    for (const { method } of httpOperations(spec.webhooks[name])) {
      const base = `/webhooks/${escapePointerSegment(name)}/${method}`;
      expected.set(
        `${base}/x-mint/href`,
        "Assign a stable Mintlify URL to the webhook operation.",
      );
      expected.set(`${base}/security`, WEBHOOK_SECURITY_REASON);
      expected.set(`${base}/x-mint/content`, WEBHOOK_CONTENT_REASON);
    }
  }

  return expected;
}

function hasSummary(operation) {
  return typeof operation?.summary === "string" && operation.summary.trim() !== "";
}

function validateTransformationSet(spec, transformations) {
  if (!Array.isArray(transformations)) {
    throw new Error("Transformations must be an array");
  }
  const expected = expectedTransformationReasons(spec);
  const actual = new Map();

  for (const item of transformations) {
    if (!isPlainObject(item) || typeof item.pointer !== "string") {
      throw new Error("Invalid transformation record");
    }
    const reason =
      expected.get(item.pointer) ?? optionalTransformationReason(item.pointer);
    if (reason === undefined) {
      throw new Error(`Unexpected transformation pointer: ${item.pointer}`);
    }
    if (actual.has(item.pointer)) {
      throw new Error(`Duplicate transformation pointer: ${item.pointer}`);
    }
    if (item.reason !== reason) {
      throw new Error(`Unexpected transformation reason at ${item.pointer}`);
    }
    if (!/^[a-f0-9]{64}$/.test(item.beforeHash)) {
      throw new Error(`Invalid beforeHash at ${item.pointer}`);
    }
    if (item.afterHash !== null && !/^[a-f0-9]{64}$/.test(item.afterHash)) {
      throw new Error(`Invalid afterHash at ${item.pointer}`);
    }
    actual.set(item.pointer, item);
  }

  for (const pointer of expected.keys()) {
    if (!actual.has(pointer)) {
      throw new Error(`Missing transformation pointer: ${pointer}`);
    }
  }
  return actual;
}

function compareCanonical(label, source, prepared) {
  if (canonicalHash(source) !== canonicalHash(prepared)) {
    throw new Error(`${label} changed`);
  }
}

export function compareSourceToPrepared(source, prepared, transformations) {
  const records = validateTransformationSet(source, transformations);

  compareCanonical(
    "Path-method-operationId set",
    collectOperationIdentities(source, "paths"),
    collectOperationIdentities(prepared, "paths"),
  );
  compareCanonical(
    "Webhook name-operationId set",
    collectOperationIdentities(source, "webhooks"),
    collectOperationIdentities(prepared, "webhooks"),
  );
  compareCanonical(
    "Servers",
    collectLocatedProperty(source, "servers"),
    collectLocatedProperty(prepared, "servers"),
  );
  compareCanonical(
    "Parameters",
    collectLocatedProperty(source, "parameters"),
    collectLocatedProperty(prepared, "parameters"),
  );
  compareCanonical(
    "Response codes",
    collectResponseCodes(source),
    collectResponseCodes(prepared),
  );

  const sourceSchemas = source?.components?.schemas ?? {};
  const preparedSchemas = prepared?.components?.schemas ?? {};
  compareCanonical(
    "Component schema names",
    Object.keys(sourceSchemas).sort(),
    Object.keys(preparedSchemas).sort(),
  );
  for (const name of Object.keys(sourceSchemas).sort()) {
    const pointer = `/components/schemas/${escapePointerSegment(name)}`;
    if (transformations.some((item) => isWithinPointer(item.pointer, pointer))) {
      continue;
    }
    if (canonicalHash(sourceSchemas[name]) !== canonicalHash(preparedSchemas[name])) {
      throw new Error(`Component schema changed: ${name}`);
    }
  }

  compareCanonical(
    "Internal refs",
    refsOutsideTransformations(source, transformations),
    refsOutsideTransformations(prepared, transformations),
  );

  for (const [pointer, item] of records) {
    const before = pointerState(source, pointer);
    const after = pointerState(prepared, pointer);
    if (item.beforeHash !== pointerHash(before)) {
      throw new Error(`beforeHash does not match source at ${pointer}`);
    }
    if (after.exists) {
      if (item.afterHash !== canonicalHash(after.value)) {
        throw new Error(`afterHash does not match prepared output at ${pointer}`);
      }
    } else if (item.afterHash !== null) {
      throw new Error(`Deleted transformation must have null afterHash at ${pointer}`);
    }
  }

  const replayed = structuredClone(source);
  for (const item of [...transformations].sort(
    (left, right) =>
      parsePointer(left.pointer).length - parsePointer(right.pointer).length ||
      compareStrings(left.pointer, right.pointer),
  )) {
    const after = pointerState(prepared, item.pointer);
    if (after.exists) setPointer(replayed, item.pointer, after.value);
    else deletePointer(replayed, item.pointer);
  }

  if (canonicalHash(replayed) !== canonicalHash(prepared)) {
    throw new Error(
      "Prepared OpenAPI changed outside recorded transformation pointers",
    );
  }
}

function resolveInternalRef(spec, ref) {
  if (!ref.startsWith("#")) return { exists: true, value: undefined };
  let pointer;
  try {
    pointer = decodeURIComponent(ref.slice(1));
  } catch {
    throw new Error(`Invalid internal $ref URI fragment: ${ref}`);
  }
  if (pointer === "") return { exists: true, value: spec };
  if (!pointer.startsWith("/")) return { exists: true, value: undefined };
  return pointerState(spec, pointer);
}

function validateRefs(spec) {
  for (const { pointer, ref } of collectRefs(spec)) {
    if (ref.startsWith("#") && !resolveInternalRef(spec, ref).exists) {
      throw new Error(`Dangling internal $ref at ${pointer}: ${ref}`);
    }
  }
}

function validateOperationIds(spec) {
  const seen = new Map();
  for (const section of ["paths", "webhooks"]) {
    for (const key of Object.keys(spec?.[section] ?? {}).sort()) {
      for (const { method, operation } of httpOperations(spec[section][key])) {
        if (!isPlainObject(operation)) {
          throw new Error(`Invalid ${method} operation at ${section}.${key}`);
        }
        if (
          typeof operation.operationId !== "string" ||
          operation.operationId.trim() === ""
        ) {
          throw new Error(`Missing operationId for ${method.toUpperCase()} ${key}`);
        }
        const previous = seen.get(operation.operationId);
        if (previous) {
          throw new Error(
            `Duplicate operationId ${operation.operationId}: ${previous} and ${method.toUpperCase()} ${key}`,
          );
        }
        seen.set(operation.operationId, `${method.toUpperCase()} ${key}`);
      }
    }
  }
}

function referencedSecuritySchemes(security, location) {
  if (security === undefined) return [];
  if (!Array.isArray(security)) {
    throw new Error(`Security requirements must be an array at ${location}`);
  }

  const references = [];
  for (const requirement of security) {
    if (!isPlainObject(requirement)) {
      throw new Error(`Security requirement must be an object at ${location}`);
    }
    for (const name of Object.keys(requirement)) {
      references.push({ name, location });
    }
  }
  return references;
}

function assertSecuritySchemesUnreferenced(spec, schemeNames) {
  const references = referencedSecuritySchemes(
    spec.security,
    "global security requirement",
  );

  for (const section of ["paths", "webhooks"]) {
    for (const key of Object.keys(spec?.[section] ?? {}).sort()) {
      for (const { method, operation } of httpOperations(spec[section][key])) {
        references.push(
          ...referencedSecuritySchemes(
            operation.security,
            `${method.toUpperCase()} ${key}`,
          ),
        );
      }
    }
  }

  for (const { name, location } of references) {
    if (schemeNames.includes(name)) {
      throw new Error(`Cannot remove ${name}: referenced by ${location}`);
    }
  }
}

function validateV3Paths(spec) {
  if (!isPlainObject(spec?.paths)) throw new Error("OpenAPI paths must be an object");
  for (const path of Object.keys(spec.paths)) {
    if (
      path.startsWith("/") &&
      !path.startsWith("/v3/") &&
      !PUBLIC_V3_COMPATIBILITY_PATHS.has(path)
    ) {
      throw new Error(`Non-v3 path is not publishable: ${path}`);
    }
  }
}

function validateCustomerWebhooks(spec, prepared) {
  for (const name of CUSTOMER_WEBHOOKS) {
    const media =
      spec?.webhooks?.[name]?.post?.requestBody?.content?.["application/json"];
    if (!isPlainObject(media)) {
      throw new Error(`Missing application/json payload for ${name}`);
    }

    if (prepared) {
      if (!isPlainObject(media.schema) || Object.hasOwn(media.schema, "oneOf")) {
        throw new Error(`${name} must publish only the v3 webhook envelope`);
      }
      if (Object.hasOwn(media.examples ?? {}, "legacy")) {
        throw new Error(`${name} still contains a legacy webhook example`);
      }
      if (!Object.hasOwn(media.examples ?? {}, "v3")) {
        throw new Error(`${name} is missing its v3 webhook example`);
      }
    } else {
      if (!Array.isArray(media.schema?.oneOf) || media.schema.oneOf.length < 2) {
        throw new Error(`${name} is missing its legacy and v3 schema branches`);
      }
      if (!Object.hasOwn(media.examples ?? {}, "legacy")) {
        throw new Error(`${name} is missing its legacy webhook example`);
      }
      if (!Object.hasOwn(media.examples ?? {}, "v3")) {
        throw new Error(`${name} is missing its v3 webhook example`);
      }
    }
  }
}

function assertUniqueHrefs(coverage) {
  const seen = new Map();
  for (const entry of [...coverage.operations, ...coverage.webhooks]) {
    if (typeof entry.href !== "string" || !entry.href.startsWith("/")) {
      throw new Error(`Invalid generated href for ${entry.operationId}`);
    }
    const previous = seen.get(entry.href);
    if (previous) {
      throw new Error(
        `Duplicate generated href ${entry.href}: ${previous} and ${entry.operationId}`,
      );
    }
    seen.set(entry.href, entry.operationId);
  }
}

function validatePreparedHrefs(spec) {
  for (const path of Object.keys(spec.paths).sort()) {
    for (const { method, operation } of httpOperations(spec.paths[path])) {
      const expected = `/api-reference/${operationSlug(
        operationGroup(operation),
        operation.operationId,
      )}`;
      if (operation?.["x-mint"]?.href !== expected) {
        throw new Error(
          `Invalid x-mint.href for ${method.toUpperCase()} ${path}: expected ${expected}`,
        );
      }
    }
  }

  for (const name of Object.keys(spec?.webhooks ?? {}).sort()) {
    for (const { operation } of httpOperations(spec.webhooks[name])) {
      const expected = stableWebhookHref(operation);
      if (operation?.["x-mint"]?.href !== expected) {
        throw new Error(
          `Invalid x-mint.href for webhook ${name}: expected ${expected}`,
        );
      }
    }
  }
}

function validatePreparedDisplay(spec) {
  for (const path of Object.keys(spec.paths).sort()) {
    for (const { method, operation } of httpOperations(spec.paths[path])) {
      if (
        hasSummary(operation) &&
        operation["x-mint"]?.metadata?.sidebarTitle !== operation.summary
      ) {
        throw new Error(
          `Sidebar title must match the summary for ${method.toUpperCase()} ${path}`,
        );
      }
    }
  }

  for (const name of Object.keys(spec?.webhooks ?? {}).sort()) {
    for (const { operation } of httpOperations(spec.webhooks[name])) {
      if (canonicalHash(operation.security) !== canonicalHash([])) {
        throw new Error(`Webhook ${name} must not require API key authentication`);
      }
      if (!String(operation["x-mint"]?.content).startsWith(WEBHOOK_EVENT_CONTENT)) {
        throw new Error(`Webhook ${name} must explain signature verification`);
      }
    }
  }

  const untitled = unionTitleTransformations(spec);
  if (untitled.length > 0) {
    throw new Error(`Union option is missing a title at ${untitled[0].pointer}`);
  }
  const unnamed = exampleNameTransformations(spec);
  if (unnamed.length > 0) {
    throw new Error(`Examples are not named by summary at ${unnamed[0].pointer}`);
  }
  for (const { pointer, from } of PLAIN_LANGUAGE_REWRITES) {
    if (pointerState(spec, pointer).value === from) {
      throw new Error(`Internal implementation language remains at ${pointer}`);
    }
  }
}

export function validateOpenApi(spec, { prepared = false } = {}) {
  if (!isPlainObject(spec)) throw new Error("OpenAPI document must be an object");
  validateV3Paths(spec);
  validateOperationIds(spec);
  validateCustomerWebhooks(spec, prepared);
  validateRefs(spec);

  if (prepared) {
    const schemes = Object.keys(spec?.components?.securitySchemes ?? {}).sort();
    if (canonicalHash(schemes) !== canonicalHash(["apiKey"])) {
      throw new Error(
        `Public security schemes must contain only apiKey; received ${schemes.join(", ")}`,
      );
    }
    validatePreparedHrefs(spec);
    validatePreparedDisplay(spec);
    assertUniqueHrefs(buildCoverage(spec));
  }
}

export function verifyPreparedTransformations(spec, transformations) {
  validateOpenApi(spec, { prepared: true });
  const records = validateTransformationSet(spec, transformations);

  for (const [pointer, item] of records) {
    const after = pointerState(spec, pointer);
    if (after.exists) {
      if (item.afterHash !== canonicalHash(after.value)) {
        throw new Error(`afterHash does not match prepared output at ${pointer}`);
      }
    } else if (item.afterHash !== null) {
      throw new Error(`Deleted transformation must have null afterHash at ${pointer}`);
    }
  }
}

export function openApiCounts(spec) {
  const coverage = buildCoverage(spec);
  return {
    paths: Object.keys(spec?.paths ?? {}).filter((path) => path.startsWith("/"))
      .length,
    operations: coverage.operations.length,
    schemas: coverage.components.length,
    webhooks: Object.keys(spec?.webhooks ?? {}).length,
  };
}

export function assertOpenApiCounts(spec, expectedCounts) {
  const counts = openApiCounts(spec);
  for (const name of ["paths", "operations", "schemas", "webhooks"]) {
    const expected = expectedCounts?.[name];
    if (!Number.isInteger(expected) || expected < 0) {
      throw new Error(`Expected count for ${name} must be a non-negative integer`);
    }
    if (counts[name] !== expected) {
      throw new Error(
        `Expected ${expected} ${name}, received ${counts[name]}`,
      );
    }
  }
  if (buildCoverage(spec).webhooks.length !== expectedCounts.webhooks) {
    throw new Error("Each webhook must contain exactly one HTTP operation");
  }
  return counts;
}

export function assertExpectedOpenApiCounts(spec) {
  return assertOpenApiCounts(spec, EXPECTED_OPENAPI_COUNTS);
}

export function prepareOpenApi(
  source,
  actualSha,
  { expectedSourceSha256 = SOURCE_SHA256 } = {},
) {
  if (actualSha !== expectedSourceSha256) {
    throw new Error(
      `Source SHA-256 mismatch: expected ${expectedSourceSha256}, received ${actualSha}`,
    );
  }

  const sourceSnapshot = structuredClone(source);
  validateOpenApi(sourceSnapshot);
  const schemes = sourceSnapshot?.components?.securitySchemes;
  for (const name of ["apiKey", "serviceToken", "uploadToken"]) {
    if (!Object.hasOwn(schemes ?? {}, name)) {
      throw new Error(`Missing required source security scheme: ${name}`);
    }
  }
  assertSecuritySchemesUnreferenced(sourceSnapshot, [
    "serviceToken",
    "uploadToken",
  ]);

  const sourceCoverage = buildCoverage(sourceSnapshot);
  const spec = structuredClone(sourceSnapshot);
  const transformations = [];

  addReplacement(
    spec,
    transformations,
    "/info/title",
    "Swipelux API",
    "Use the product-facing API title in the public reference.",
  );
  addReplacement(
    spec,
    transformations,
    "/x-tagGroups/0/name",
    "API",
    "Use the product-facing API group label in the public reference.",
  );

  addDeletion(
    spec,
    transformations,
    "/components/securitySchemes/serviceToken",
    "Remove non-public service-token authentication from the public contract.",
  );
  addDeletion(
    spec,
    transformations,
    "/components/securitySchemes/uploadToken",
    "Remove non-public upload-token authentication from the public contract.",
  );

  for (const { pointer, value } of LEGACY_REFERENCE_REWRITES) {
    const current = pointerState(spec, pointer);
    if (
      !current.exists ||
      typeof current.value !== "string" ||
      !LEGACY_VERSION_PATTERN.test(current.value)
    ) {
      continue;
    }
    addReplacement(spec, transformations, pointer, value, LEGACY_REFERENCE_REASON);
  }

  for (const name of CUSTOMER_WEBHOOKS) {
    const base = `/webhooks/${escapePointerSegment(name)}/post/requestBody/content/application~1json`;
    const schema = pointerState(spec, `${base}/schema`).value;
    addReplacement(
      spec,
      transformations,
      `${base}/schema`,
      schema.oneOf[1],
      `Publish only the v3 ${name} webhook envelope.`,
    );
    addDeletion(
      spec,
      transformations,
      `${base}/examples/legacy`,
      `Remove the legacy ${name} webhook example.`,
    );
  }

  for (const { pointer, from, to } of PLAIN_LANGUAGE_REWRITES) {
    if (pointerState(spec, pointer).value !== from) continue;
    addReplacement(spec, transformations, pointer, to, PLAIN_LANGUAGE_REASON);
  }

  for (const { pointer, value } of exampleNameTransformations(spec)) {
    addReplacement(spec, transformations, pointer, value, EXAMPLE_NAME_REASON);
  }

  for (const { pointer, value } of unionTitleTransformations(spec)) {
    addValue(spec, transformations, pointer, value, UNION_TITLE_REASON);
  }

  for (const path of Object.keys(spec.paths).sort()) {
    for (const { method, operation } of httpOperations(spec.paths[path])) {
      validateXMint(operation, `${method.toUpperCase()} ${path}`);
      const base = `/paths/${escapePointerSegment(path)}/${method}`;
      const href = `/api-reference/${operationSlug(
        operationGroup(operation),
        operation.operationId,
      )}`;
      addValue(
        spec,
        transformations,
        `${base}/x-mint/href`,
        href,
        "Assign a stable Mintlify URL to the HTTP operation.",
      );
      if (hasSummary(operation)) {
        addValue(
          spec,
          transformations,
          `${base}/x-mint/metadata/sidebarTitle`,
          operation.summary,
          SIDEBAR_TITLE_REASON,
        );
      }
    }
  }

  for (const name of Object.keys(spec.webhooks ?? {}).sort()) {
    for (const { method, operation } of httpOperations(spec.webhooks[name])) {
      validateXMint(operation, `webhook ${name}`);
      const base = `/webhooks/${escapePointerSegment(name)}/${method}`;
      addValue(
        spec,
        transformations,
        `${base}/x-mint/href`,
        stableWebhookHref(operation),
        "Assign a stable Mintlify URL to the webhook operation.",
      );
      addValue(spec, transformations, `${base}/security`, [], WEBHOOK_SECURITY_REASON);
      const guidance = operation["x-mint"].content;
      addValue(
        spec,
        transformations,
        `${base}/x-mint/content`,
        typeof guidance === "string" && guidance.trim() !== ""
          ? `${WEBHOOK_EVENT_CONTENT}\n\n${guidance}`
          : WEBHOOK_EVENT_CONTENT,
        WEBHOOK_CONTENT_REASON,
      );
    }
  }

  transformations.sort(sortByFields(["pointer"]));
  validateOpenApi(spec, { prepared: true });
  compareSourceToPrepared(sourceSnapshot, spec, transformations);

  const preparedCoverage = buildCoverage(spec);
  assertUniqueHrefs(preparedCoverage);
  return { spec, transformations, sourceCoverage, preparedCoverage };
}
