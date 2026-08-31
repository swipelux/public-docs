import { createHash } from "node:crypto";

export const SOURCE_SHA256 =
  "09bd715378799315c42fdb99e479d085463a4958da4ad1869fcd4dafab9dc3b0";
export const SOURCE_BASENAME = "openapi-v3-3f90f6b.json";
export const SOURCE_REPOSITORY = "swipelux/wallet-infrastructure";
export const SOURCE_COMMIT = "3f90f6b420a2a760e74c388bc15b20ee748bf663";
export const SOURCE_ROUTE = "/openapi-v3.json";
export const EXPECTED_OUTPUT_SHA256 =
  "e9296815d9f7b07931cbfe342191c8a12ac44b2b929b27cd57a9833de6cb4d65";
export const EXPECTED_COVERAGE_SHA256 =
  "c49e62b9f2c317f571fad715c00a54835451cf3ab9db8bba59ace138ef69776e";
export const EXPECTED_TRANSFORMATIONS_SHA256 =
  "b20d078feee08524924780f1b7c48a7b18a92b66986559335896493c98353f9c";
// Public API label preparation timestamp, normalized to UTC whole seconds.
export const APPROVED_GENERATED_AT = "2026-08-31T16:19:34.000Z";
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
export const PREPARATION_VERSION = "1.3.0";

export const EXPECTED_OPENAPI_COUNTS = Object.freeze({
  paths: 51,
  operations: 76,
  schemas: 92,
  webhooks: 12,
});
const CUSTOMER_WEBHOOKS = ["customer.created", "customer.updated"];
const PUBLIC_V3_COMPATIBILITY_PATHS = new Set([
  "/kyc/redirect/{customerId}/{taskId}/{verificationSessionId}",
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
    for (const { method } of httpOperations(spec.paths[path])) {
      expected.set(
        `/paths/${escapePointerSegment(path)}/${method}/x-mint/href`,
        "Assign a stable Mintlify URL to the HTTP operation.",
      );
    }
  }

  for (const name of Object.keys(spec?.webhooks ?? {}).sort()) {
    for (const { method } of httpOperations(spec.webhooks[name])) {
      expected.set(
        `/webhooks/${escapePointerSegment(name)}/${method}/x-mint/href`,
        "Assign a stable Mintlify URL to the webhook operation.",
      );
    }
  }

  return expected;
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
    if (!expected.has(item.pointer)) {
      throw new Error(`Unexpected transformation pointer: ${item.pointer}`);
    }
    if (actual.has(item.pointer)) {
      throw new Error(`Duplicate transformation pointer: ${item.pointer}`);
    }
    if (item.reason !== expected.get(item.pointer)) {
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

  for (const path of Object.keys(spec.paths).sort()) {
    for (const { method, operation } of httpOperations(spec.paths[path])) {
      validateXMint(operation, `${method.toUpperCase()} ${path}`);
      const href = `/api-reference/${operationSlug(
        operationGroup(operation),
        operation.operationId,
      )}`;
      addValue(
        spec,
        transformations,
        `/paths/${escapePointerSegment(path)}/${method}/x-mint/href`,
        href,
        "Assign a stable Mintlify URL to the HTTP operation.",
      );
    }
  }

  for (const name of Object.keys(spec.webhooks ?? {}).sort()) {
    for (const { method, operation } of httpOperations(spec.webhooks[name])) {
      validateXMint(operation, `webhook ${name}`);
      addValue(
        spec,
        transformations,
        `/webhooks/${escapePointerSegment(name)}/${method}/x-mint/href`,
        stableWebhookHref(operation),
        "Assign a stable Mintlify URL to the webhook operation.",
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
