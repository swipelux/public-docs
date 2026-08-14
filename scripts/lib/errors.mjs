import { canonicalHash, HTTP_METHODS } from "./openapi.mjs";

export const ERROR_CATEGORIES = Object.freeze([
  "Request and authentication",
  "Customers and profiles",
  "Capabilities, KYC, and tasks",
  "Accounts and payment rails",
  "Recipients and destinations",
  "Quotes and transfers",
  "Rules",
  "Idempotency and platform errors",
]);

export const INTERNAL_ONLY_PROBLEM_CODES = Object.freeze([
  "capability_terminal_correction_not_applicable",
  "customer_not_in_space",
  "customer_space_mismatch",
  "profile_pointer_not_supported",
  "scope_type_not_supported",
  "requirement_not_amendable",
  "requirement_not_reviewable",
  "requirement_not_forwardable",
  "requirement_not_cancelable",
  "payout_target_archived",
  "profile_required_by_capabilities",
  "verification_session_not_allowed",
]);

export const FORBIDDEN_GENERATED_TERMS = Object.freeze([
  "blindpay",
  "sumsub",
  "onemoney",
  "one money",
  "dfns",
  "fireblocks",
  "banxa",
  "wert",
  "watchtower",
  "/internal/",
  "service token",
  "upload token",
]);

const STANDARD_PROBLEM_FIELDS = new Set([
  "type",
  "title",
  "status",
  "code",
  "detail",
  "correlationId",
  "retryable",
  "errors",
]);

const GUIDANCE_FIELDS = new Set([
  "category",
  "summary",
  "when",
  "resolution",
  "retry",
  "includeExample",
]);

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SNAKE_CASE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function assertString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function sortedUnique(values, compare = compareStrings) {
  return [...new Set(values)].sort(compare);
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolveReference(openapi, value) {
  if (!isRecord(value) || typeof value.$ref !== "string") return value;
  if (!value.$ref.startsWith("#/")) return value;
  return value.$ref
    .slice(2)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((current, segment) => current?.[segment], openapi);
}

function scalarValues(openapi, value) {
  const schema = resolveReference(openapi, value);
  if (!isRecord(schema)) return [];
  return [
    ...(Array.isArray(schema.enum) ? schema.enum : []),
    ...(schema.const === undefined ? [] : [schema.const]),
  ];
}

function problemVariants(openapi, schema) {
  const resolved = resolveReference(openapi, schema);
  if (!isRecord(resolved)) return [];
  const variants = [
    ...(Array.isArray(resolved.oneOf) ? resolved.oneOf : []),
    ...(Array.isArray(resolved.anyOf) ? resolved.anyOf : []),
  ];
  if (variants.length > 0) {
    return variants.flatMap((variant) => problemVariants(openapi, variant));
  }
  return scalarValues(openapi, resolved.properties?.code).some(
    (value) => typeof value === "string",
  )
    ? [resolved]
    : [];
}

function operationKey(operation) {
  return [
    operation.operationId,
    operation.method,
    operation.path,
    operation.status,
  ].join("\u0000");
}

function operationOrder(left, right) {
  return (
    left.path.localeCompare(right.path) ||
    left.method.localeCompare(right.method) ||
    left.status - right.status ||
    left.operationId.localeCompare(right.operationId)
  );
}

function collectOperationFacts(openapi) {
  const facts = [];
  for (const path of Object.keys(openapi.paths ?? {}).sort(compareStrings)) {
    const pathItem = openapi.paths[path];
    if (!isRecord(pathItem)) continue;
    for (const method of [...HTTP_METHODS].sort(compareStrings)) {
      const operation = pathItem[method];
      if (!isRecord(operation)) continue;
      const operationId = assertString(
        operation.operationId,
        `${method.toUpperCase()} ${path} operationId`,
      );
      const responses = assertRecord(
        operation.responses,
        `${method.toUpperCase()} ${path} responses`,
      );
      for (const statusText of Object.keys(responses).sort(
        (left, right) => Number(left) - Number(right),
      )) {
        const status = Number(statusText);
        if (!Number.isInteger(status)) continue;
        const response = resolveReference(openapi, responses[statusText]);
        const media = isRecord(response)
          ? response.content?.["application/problem+json"]
          : undefined;
        if (!isRecord(media)) continue;
        for (const variant of problemVariants(openapi, media.schema)) {
          const properties = assertRecord(
            variant.properties,
            `${method.toUpperCase()} ${path} ${status} problem properties`,
          );
          const codes = scalarValues(openapi, properties.code).filter(
            (value) => typeof value === "string",
          );
          for (const code of codes) {
            facts.push({
              code,
              retryableValues: scalarValues(
                openapi,
                properties.retryable,
              ).filter((value) => typeof value === "boolean"),
              operation: {
                operationId,
                method: method.toUpperCase(),
                path,
                status,
              },
              extensions: Object.keys(properties)
                .filter((name) => !STANDARD_PROBLEM_FIELDS.has(name))
                .sort(compareStrings),
              properties,
            });
          }
        }
      }
    }
  }
  return facts;
}

function validateCatalogEntry(entry, index) {
  assertRecord(entry, `x-swipelux-problems[${index}]`);
  const expectedKeys = [
    "code",
    "extensions",
    "operations",
    "retryableValues",
    "slug",
    "statuses",
    "title",
    "type",
  ];
  const actualKeys = Object.keys(entry).sort(compareStrings);
  if (!deepEqual(actualKeys, expectedKeys)) {
    throw new Error(
      `${entry.code ?? `catalog entry ${index}`} has unexpected fields: ${actualKeys.join(", ")}`,
    );
  }
  assertString(entry.code, `catalog entry ${index} code`);
  if (!SNAKE_CASE.test(entry.code)) {
    throw new Error(`${entry.code} is not snake_case`);
  }
  assertString(entry.slug, `${entry.code} slug`);
  if (!KEBAB_CASE.test(entry.slug)) {
    throw new Error(`${entry.code} slug is not kebab-case: ${entry.slug}`);
  }
  const expectedSlug = entry.code.replaceAll("_", "-");
  if (entry.slug !== expectedSlug) {
    throw new Error(`${entry.code} slug must be ${expectedSlug}`);
  }
  assertString(entry.title, `${entry.code} title`);
  const expectedType = `https://docs.swipelux.com/errors/${entry.slug}`;
  if (entry.type !== expectedType) {
    throw new Error(`${entry.code} type must be ${expectedType}`);
  }
  if (
    !Array.isArray(entry.statuses) ||
    entry.statuses.length === 0 ||
    entry.statuses.some((status) => !Number.isInteger(status))
  ) {
    throw new Error(`${entry.code} statuses must contain integers`);
  }
  const statuses = sortedUnique(entry.statuses, (left, right) => left - right);
  if (!deepEqual(entry.statuses, statuses)) {
    throw new Error(`${entry.code} statuses must be sorted and unique`);
  }
  if (
    !Array.isArray(entry.retryableValues) ||
    entry.retryableValues.some((value) => typeof value !== "boolean")
  ) {
    throw new Error(`${entry.code} retryableValues must contain booleans`);
  }
  const retryableValues = sortedUnique(
    entry.retryableValues,
    (left, right) => Number(left) - Number(right),
  );
  if (!deepEqual(entry.retryableValues, retryableValues)) {
    throw new Error(`${entry.code} retryableValues must be sorted and unique`);
  }
  if (
    !Array.isArray(entry.extensions) ||
    entry.extensions.some((value) => typeof value !== "string")
  ) {
    throw new Error(`${entry.code} extensions must contain strings`);
  }
  if (!deepEqual(entry.extensions, sortedUnique(entry.extensions))) {
    throw new Error(`${entry.code} extensions must be sorted and unique`);
  }
  if (!Array.isArray(entry.operations) || entry.operations.length === 0) {
    throw new Error(`${entry.code} must reference at least one operation`);
  }
  for (const [operationIndex, operation] of entry.operations.entries()) {
    assertRecord(operation, `${entry.code} operation ${operationIndex}`);
    assertString(operation.operationId, `${entry.code} operationId`);
    assertString(operation.method, `${entry.code} method`);
    assertString(operation.path, `${entry.code} path`);
    if (!Number.isInteger(operation.status)) {
      throw new Error(`${entry.code} operation status must be an integer`);
    }
  }
  const operations = [...entry.operations].sort(operationOrder);
  if (!deepEqual(entry.operations, operations)) {
    throw new Error(`${entry.code} operations must be deterministically sorted`);
  }
  if (new Set(entry.operations.map(operationKey)).size !== entry.operations.length) {
    throw new Error(`${entry.code} operations must be unique`);
  }
}

export function readProblemCatalog(openapi) {
  assertRecord(openapi, "openapi.json");
  const catalog = openapi["x-swipelux-problems"];
  if (!Array.isArray(catalog) || catalog.length === 0) {
    throw new Error("openapi.json is missing x-swipelux-problems");
  }
  for (const [index, entry] of catalog.entries()) {
    validateCatalogEntry(entry, index);
  }
  const codes = catalog.map((entry) => entry.code);
  if (!deepEqual(codes, [...codes].sort(compareStrings))) {
    throw new Error("x-swipelux-problems must be sorted by code");
  }
  for (const identity of ["code", "slug", "type"]) {
    if (new Set(catalog.map((entry) => entry[identity])).size !== catalog.length) {
      throw new Error(`x-swipelux-problems contains duplicate ${identity} values`);
    }
  }
  for (const code of INTERNAL_ONLY_PROBLEM_CODES) {
    if (codes.includes(code)) {
      throw new Error(`Internal-only problem code is public: ${code}`);
    }
  }
  return catalog;
}

export function validateCatalogAgainstOpenApi(openapi, catalog) {
  const facts = collectOperationFacts(openapi);
  const factsByCode = new Map();
  for (const fact of facts) {
    const entries = factsByCode.get(fact.code) ?? [];
    entries.push(fact);
    factsByCode.set(fact.code, entries);
  }
  const catalogCodes = new Set(catalog.map((entry) => entry.code));
  const factCodes = new Set(facts.map((fact) => fact.code));
  if (!deepEqual([...catalogCodes].sort(), [...factCodes].sort())) {
    throw new Error("x-swipelux-problems codes do not match OpenAPI problem variants");
  }

  for (const entry of catalog) {
    const matching = factsByCode.get(entry.code) ?? [];
    const statuses = sortedUnique(
      matching.map((fact) => fact.operation.status),
      (left, right) => left - right,
    );
    const retryableValues = sortedUnique(
      matching.flatMap((fact) => fact.retryableValues),
      (left, right) => Number(left) - Number(right),
    );
    const extensions = sortedUnique(
      matching.flatMap((fact) => fact.extensions),
    );
    const operations = [
      ...new Map(
        matching.map((fact) => [operationKey(fact.operation), fact.operation]),
      ).values(),
    ].sort(operationOrder);
    if (!deepEqual(entry.statuses, statuses)) {
      throw new Error(`${entry.code} statuses disagree with OpenAPI variants`);
    }
    if (!deepEqual(entry.retryableValues, retryableValues)) {
      throw new Error(`${entry.code} retryableValues disagree with OpenAPI variants`);
    }
    if (!deepEqual(entry.extensions, extensions)) {
      throw new Error(`${entry.code} extensions disagree with OpenAPI variants`);
    }
    if (!deepEqual(entry.operations, operations)) {
      throw new Error(`${entry.code} operations disagree with OpenAPI variants`);
    }
  }
  return facts;
}

function validateGuidanceEntry(code, guidance) {
  assertRecord(guidance, `${code} guidance`);
  const unknown = Object.keys(guidance).filter(
    (field) => !GUIDANCE_FIELDS.has(field),
  );
  if (unknown.length > 0) {
    throw new Error(`${code} guidance has unknown fields: ${unknown.join(", ")}`);
  }
  if (!ERROR_CATEGORIES.includes(guidance.category)) {
    throw new Error(`${code} has unknown category: ${guidance.category}`);
  }
  for (const field of ["summary", "when", "resolution"]) {
    assertString(guidance[field], `${code} guidance ${field}`);
  }
  if (guidance.retry !== undefined) {
    assertString(guidance.retry, `${code} guidance retry`);
  }
  if (
    guidance.includeExample !== undefined &&
    typeof guidance.includeExample !== "boolean"
  ) {
    throw new TypeError(`${code} includeExample must be a boolean`);
  }
}

export function validateGuidance(catalog, guidance) {
  assertRecord(guidance, "error guidance catalog");
  const expectedCodes = catalog.map((entry) => entry.code).sort(compareStrings);
  const guidanceCodes = Object.keys(guidance).sort(compareStrings);
  const missing = expectedCodes.filter((code) => !guidanceCodes.includes(code));
  const surplus = guidanceCodes.filter((code) => !expectedCodes.includes(code));
  if (missing.length > 0 || surplus.length > 0) {
    throw new Error(
      `Guidance mismatch; missing: ${missing.join(", ") || "none"}; surplus: ${surplus.join(", ") || "none"}`,
    );
  }
  for (const code of expectedCodes) validateGuidanceEntry(code, guidance[code]);
}

function factsForEntry(facts, code) {
  return facts.filter((fact) => fact.code === code);
}

function extensionDescriptions(openapi, entry, facts) {
  const result = {};
  for (const extension of entry.extensions) {
    const descriptions = sortedUnique(
      factsForEntry(facts, entry.code)
        .map((fact) => resolveReference(openapi, fact.properties[extension]))
        .filter(isRecord)
        .map((schema) => schema.description)
        .filter((description) => typeof description === "string")
        .map((description) => description.trim())
        .filter(Boolean),
    );
    if (descriptions.length > 1) {
      throw new Error(
        `${entry.code}.${extension} has inconsistent OpenAPI descriptions`,
      );
    }
    result[extension] = descriptions[0] ?? "Additional problem context.";
  }
  return result;
}

function collectExamples(value, code, examples) {
  if (Array.isArray(value)) {
    for (const item of value) collectExamples(item, code, examples);
    return;
  }
  if (!isRecord(value)) return;
  if (value.code === code && typeof value.detail === "string") {
    examples.set(JSON.stringify(value), value);
  }
  for (const child of Object.values(value)) {
    collectExamples(child, code, examples);
  }
}

function exampleForCode(openapi, code) {
  const examples = new Map();
  collectExamples(openapi, code, examples);
  return examples.values().next().value;
}

function retryLabel(values) {
  if (values.length === 0) return "Not returned";
  if (values.length === 2) return "Contextual";
  return values[0] ? "Yes" : "No";
}

function retryGuidance(entry, guidance) {
  let generated;
  if (entry.retryableValues.length === 0) {
    generated =
      "This problem does not return `retryable`. Do not assume an unchanged retry is safe; follow the action above and the operation's idempotency requirements.";
  } else if (entry.retryableValues.length === 2) {
    generated =
      "Read `retryable` on this response. Retry later only when it is `true`. For an idempotent write, reuse the original idempotency key and unchanged request.";
  } else if (entry.retryableValues[0]) {
    generated =
      "Retry after a delay. For an idempotent write, reuse the original idempotency key and unchanged request.";
  } else {
    generated =
      "Do not retry the unchanged request. Apply the action above before sending another request.";
  }
  return guidance.retry ? `${generated} ${guidance.retry}` : generated;
}

function allHttpOperations(openapi) {
  const operations = [];
  for (const path of Object.keys(openapi.paths ?? {}).sort(compareStrings)) {
    const pathItem = openapi.paths[path];
    if (!isRecord(pathItem)) continue;
    for (const method of [...HTTP_METHODS].sort(compareStrings)) {
      const operation = pathItem[method];
      if (!isRecord(operation)) continue;
      operations.push({
        operationId: operation.operationId,
        method: method.toUpperCase(),
        path,
      });
    }
  }
  return operations;
}

function operationIdentity(operation) {
  return [operation.operationId, operation.method, operation.path].join("\u0000");
}

function sameOperationScope(entryOperations, scopeOperations) {
  const entry = sortedUnique(entryOperations.map(operationIdentity));
  const scope = sortedUnique(scopeOperations.map(operationIdentity));
  return deepEqual(entry, scope);
}

function escapeTableCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

function renderOperations(entry, openapi, catalog) {
  const allOperations = allHttpOperations(openapi);
  const authenticatedOperations = catalog.find(
    (candidate) => candidate.code === "unauthorized",
  )?.operations;
  if (sameOperationScope(entry.operations, allOperations)) {
    return "**Relevant API operations:** All public API operations.";
  }
  if (
    authenticatedOperations &&
    sameOperationScope(entry.operations, authenticatedOperations)
  ) {
    return "**Relevant API operations:** All authenticated API operations.";
  }

  const lines = entry.operations.map((operation) => {
    const href =
      openapi.paths?.[operation.path]?.[operation.method.toLowerCase()]?.[
        "x-mint"
      ]?.href;
    if (typeof href !== "string") {
      throw new Error(
        `${operation.method} ${operation.path} is missing x-mint.href`,
      );
    }
    return `- [\`${operation.method} ${operation.path}\`](${href}) (\`${operation.operationId}\`, status \`${operation.status}\`)`;
  });
  if (lines.length > 8) {
    return [
      `<Accordion title="Relevant API operations (${lines.length})">`,
      "",
      ...lines,
      "",
      "</Accordion>",
    ].join("\n");
  }
  return ["**Relevant API operations:**", "", ...lines].join("\n");
}

function renderExample(openapi, entry, guidance) {
  if (!guidance.includeExample) return "";
  const example = exampleForCode(openapi, entry.code);
  if (!example) {
    throw new Error(`${entry.code} requests an example that OpenAPI does not provide`);
  }
  return [
    "**Example:**",
    "",
    "```json",
    JSON.stringify(example, null, 2),
    "```",
  ].join("\n");
}

function renderErrorSection(model, openapi, catalog) {
  const { entry, guidance, extensionDescriptions: descriptions } = model;
  const fields = entry.extensions.length
    ? [
        "**Additional response fields:**",
        "",
        ...entry.extensions.map(
          (field) => `- \`${field}\`: ${descriptions[field]}`,
        ),
      ].join("\n")
    : "";
  const lines = [
    `<a id="${entry.slug}" className="block scroll-mt-32">`,
    `  <span className="sr-only">${entry.code} error</span>`,
    "</a>",
    "",
    `### \`${entry.code}\``,
    "",
    `**HTTP status:** ${entry.statuses.map((status) => `\`${status}\``).join(", ")}<br />`,
    `**Retryable:** ${retryLabel(entry.retryableValues)}<br />`,
    `**Problem type:** \`${entry.type}\``,
    "",
    `**Meaning:** ${guidance.summary}`,
    "",
    `**When it occurs:** ${guidance.when}`,
    "",
    `**What to do:** ${guidance.resolution}`,
    "",
    `**Retry guidance:** ${retryGuidance(entry, guidance)}`,
    "",
    renderOperations(entry, openapi, catalog),
  ];
  if (fields) lines.push("", fields);
  if (guidance.includeExample) {
    lines.push("", renderExample(openapi, entry, guidance));
  }
  return lines.join("\n");
}

function representativeValidationResponse(catalog) {
  const validation = catalog.find((entry) => entry.code === "validation_error");
  if (!validation) throw new Error("validation_error is missing from the catalog");
  return {
    type: validation.type,
    title: validation.title,
    status: validation.statuses[0],
    code: validation.code,
    detail: "The request contains invalid fields.",
    correlationId: "01JERRORVALIDATION",
    retryable: false,
    errors: [
      {
        pointer: "/externalId",
        code: "invalid_format",
        message: "Use a valid external identifier.",
      },
    ],
  };
}

export function buildErrorModels(openapi, guidance) {
  const catalog = readProblemCatalog(openapi);
  const facts = validateCatalogAgainstOpenApi(openapi, catalog);
  validateGuidance(catalog, guidance);
  const models = catalog.map((entry) => ({
    entry,
    guidance: guidance[entry.code],
    extensionDescriptions: extensionDescriptions(openapi, entry, facts),
  }));
  return { catalog, models };
}

export function renderErrorsPage(openapi, guidance) {
  const { catalog, models } = buildErrorModels(openapi, guidance);
  const byCategory = new Map(
    ERROR_CATEGORIES.map((category) => [category, []]),
  );
  for (const model of models) byCategory.get(model.guidance.category).push(model);
  for (const categoryModels of byCategory.values()) {
    categoryModels.sort((left, right) =>
      left.entry.code.localeCompare(right.entry.code),
    );
  }

  const indexRows = models
    .map(({ entry, guidance: item }) =>
      `| [\`${entry.code}\`](#${entry.slug}) | ${entry.statuses.map((status) => `\`${status}\``).join(", ")} | ${retryLabel(entry.retryableValues)} | ${escapeTableCell(item.summary)} |`,
    )
    .join("\n");
  const sections = ERROR_CATEGORIES.flatMap((category) => [
    `## ${category}`,
    "",
    ...byCategory
      .get(category)
      .flatMap((model) => [renderErrorSection(model, openapi, catalog), ""]),
  ]).join("\n");
  const response = representativeValidationResponse(catalog);

  return `---
title: "Errors and retries"
description: "Handle every public Swipelux API problem code, decide when to retry, and resolve validation, state, idempotency, and platform failures."
---

Swipelux API errors use the \`application/problem+json\` media type. Branch your application behavior on the stable \`code\` value, then use the operation and guidance below to resolve the failure.

| Field | How to use it |
| --- | --- |
| \`type\` | Stable documentation URI for the problem code. |
| \`title\` | Short human-readable problem title. |
| \`status\` | HTTP status associated with this response. |
| \`code\` | Stable machine-readable value for application logic. |
| \`detail\` | Contextual human-readable text for this occurrence. Do not parse or compare it. |
| \`correlationId\` | Request identifier to store in logs and include when contacting support. |
| \`retryable\` | When \`true\`, the same request may succeed later. When \`false\`, change the request or satisfy a prerequisite before trying again. |
| \`errors[]\` | Field-level validation details, including a JSON Pointer when available. |

Retry idempotent writes with the original \`Idempotency-Key\` and the unchanged method, path, and body. Never reuse that key for a different intended operation.

\`\`\`json
${JSON.stringify(response, null, 2)}
\`\`\`

## Error index

| Error code | Status | Retryable | Meaning |
| --- | --- | --- | --- |
${indexRows}

${sections.trimEnd()}

## Next step

Use the operation links above to confirm the exact request and response schema you are handling, then exercise the failure path in [Sandbox testing](/integration/sandbox).
`;
}

export function buildErrorRedirects(catalog) {
  return catalog.map((entry) => ({
    source: `/errors/${entry.slug}`,
    destination: `/integration/errors#${entry.slug}`,
  }));
}

function replaceGeneratedRedirects(redirects, generated) {
  return [
    ...redirects.filter(
      (redirect) =>
        redirect.source !== "/integration/errors" &&
        !redirect.source.startsWith("/errors/"),
    ),
    ...generated,
  ].sort((left, right) => left.source.localeCompare(right.source));
}

export function updateDocsConfig(docsConfig, generatedRedirects) {
  const updated = structuredClone(docsConfig);
  const english = updated.navigation?.languages?.find(
    (language) => language.default === true,
  );
  const integration = english?.tabs?.find(
    (tab) => tab.tab === "Integration Docs",
  );
  const getStarted = integration?.groups?.find(
    (group) => group.group === "Get started",
  );
  if (!getStarted || !Array.isArray(getStarted.pages)) {
    throw new Error("English Integration Docs > Get started navigation is missing");
  }
  const pages = getStarted.pages.filter((page) => page !== "integration/errors");
  const authenticationIndex = pages.indexOf("integration/authentication");
  const sandboxIndex = pages.indexOf("integration/sandbox");
  if (authenticationIndex === -1 || sandboxIndex !== authenticationIndex + 1) {
    throw new Error("Authentication and Sandbox testing navigation order changed");
  }
  pages.splice(sandboxIndex, 0, "integration/errors");
  getStarted.pages = pages;
  updated.redirects = replaceGeneratedRedirects(
    Array.isArray(updated.redirects) ? updated.redirects : [],
    generatedRedirects,
  );
  return updated;
}

export function updateRedirectInventory(inventory, generatedRedirects) {
  const existing = inventory.filter(
    (redirect) =>
      redirect.source !== "/integration/errors" &&
      !redirect.source.startsWith("/errors/"),
  );
  const generated = generatedRedirects.map((redirect) => ({
    ...redirect,
    reason: "Stable public problem type URI",
    verified: true,
  }));
  return [...existing, ...generated].sort((left, right) =>
    left.source.localeCompare(right.source),
  );
}

export function buildErrorIndex(provenance, catalog, guidance) {
  const source = assertRecord(provenance.source, "OpenAPI provenance source");
  return {
    source: {
      repository: assertString(source.repository, "source repository"),
      commit: assertString(source.commit, "source commit"),
      route: assertString(source.route, "source route"),
      catalogSha256: canonicalHash(catalog),
    },
    errorCount: catalog.length,
    redirectCount: catalog.length,
    categories: ERROR_CATEGORIES.map((category) => ({
      category,
      count: catalog.filter((entry) => guidance[entry.code].category === category)
        .length,
    })),
    errors: catalog.map((entry) => ({
      code: entry.code,
      slug: entry.slug,
      anchor: `#${entry.slug}`,
      category: guidance[entry.code].category,
      type: entry.type,
      source: `/errors/${entry.slug}`,
      destination: `/integration/errors#${entry.slug}`,
    })),
  };
}

export function formattedJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function assertNoForbiddenGeneratedTerms(text) {
  const normalized = text.toLowerCase();
  const matches = FORBIDDEN_GENERATED_TERMS.filter((term) =>
    normalized.includes(term),
  );
  if (matches.length > 0) {
    throw new Error(`Generated errors content contains forbidden terms: ${matches.join(", ")}`);
  }
}
