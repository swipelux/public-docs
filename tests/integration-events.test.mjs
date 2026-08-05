import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { collectNavigationPages } from "../scripts/lib/docs-validation.mjs";
import {
  assertFrontmatter,
  assertNoBannedText,
  readPage,
} from "./helpers/content.mjs";
import { createOpenApiValidator } from "./helpers/openapi-validation.mjs";

const PAGES = [
  "integration/webhooks",
  "integration/sandbox",
  "integration/api-reliability",
  "integration/sync-and-reconciliation",
  "integration/production-readiness",
];

const SANDBOX_OPERATIONS = [
  ["post", "/v3/sandbox/accounts/{accountId}/topup"],
  [
    "post",
    "/v3/sandbox/customers/{customerId}/capabilities/{capabilityId}/status",
  ],
  ["post", "/v3/sandbox/customers/{customerId}/verification"],
  ["post", "/v3/sandbox/tasks"],
  ["post", "/v3/sandbox/tasks/{taskId}/review"],
  ["post", "/v3/sandbox/transfers/{transferId}/state"],
];

const REPRESENTATIVE_SYNC_OPERATIONS = [
  ["get", "/v3/customers"],
  ["get", "/v3/customers/{customerId}/accounts"],
  ["get", "/v3/customers/{customerId}/recipients"],
  [
    "get",
    "/v3/customers/{customerId}/recipients/{recipientId}/destinations",
  ],
  ["get", "/v3/transfers"],
  ["get", "/v3/tasks"],
];

const PATH_VARIABLES = new Map([
  ["CUSTOMER_ID", "customerId"],
  ["CAPABILITY_ID", "capabilityId"],
  ["TASK_ID", "taskId"],
  ["ACCOUNT_ID", "accountId"],
  ["TRANSFER_ID", "transferId"],
  ["WEBHOOK_ID", "webhookId"],
]);

const BODY_VARIABLES = Object.freeze({
  CAPABILITY_ID: "ach_pooled",
  CUSTOMER_ID: "cus_01JTESTCUSTOMER",
  REQUIREMENT_ID: "req_01JTESTREQUIREMENT",
  TASK_REVISION: 1,
});

const config = JSON.parse(readFileSync("docs.json", "utf8"));
const openapi = JSON.parse(readFileSync("openapi.json", "utf8"));
const openApiValidator = createOpenApiValidator(openapi);
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

function pageFile(page) {
  return `${page}.mdx`;
}

function requiredPage(page) {
  const text = readPage(page);
  assertFrontmatter(page, text);
  assertNoBannedText(page, text);
  return text;
}

function resolveReference(value) {
  let resolved = value;
  const visited = new Set();

  while (resolved?.$ref) {
    const reference = resolved.$ref;
    assert.match(reference, /^#\//, `Unsupported OpenAPI reference ${reference}`);
    assert.ok(!visited.has(reference), `Circular OpenAPI reference ${reference}`);
    visited.add(reference);
    resolved = reference
      .slice(2)
      .split("/")
      .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
      .reduce((current, segment) => current?.[segment], openapi);
    assert.ok(resolved, `Missing OpenAPI reference ${reference}`);
  }

  return resolved;
}

function openApiOperation(method, path) {
  const pathItem = openapi.paths[path];
  assert.ok(pathItem, `Missing OpenAPI path ${path}`);
  const operation = pathItem[method];
  assert.ok(operation, `Missing OpenAPI operation ${method.toUpperCase()} ${path}`);
  return { operation, pathItem };
}

function operationParameters(method, path) {
  const { operation, pathItem } = openApiOperation(method, path);
  return [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])].map(
    resolveReference,
  );
}

function requestBody(method, path) {
  const { operation } = openApiOperation(method, path);
  return operation.requestBody ? resolveReference(operation.requestBody) : undefined;
}

function requestBodySchema(method, path) {
  const schema = requestBody(method, path)?.content?.["application/json"]?.schema;
  assert.ok(schema, `Missing JSON request schema for ${method.toUpperCase()} ${path}`);
  return resolveReference(schema);
}

function responseObject(method, path, status) {
  const { operation } = openApiOperation(method, path);
  const response = resolveReference(operation.responses?.[status]);
  assert.ok(response, `Missing ${status} response for ${method.toUpperCase()} ${path}`);
  return response;
}

function responseSchema(method, path, status = "200", mediaType = "application/json") {
  const schema = responseObject(method, path, status).content?.[mediaType]?.schema;
  assert.ok(
    schema,
    `Missing ${mediaType} schema for ${method.toUpperCase()} ${path} ${status}`,
  );
  return resolveReference(schema);
}

function idempotencyParameter(method, path) {
  return operationParameters(method, path).find(
    (parameter) =>
      parameter.in === "header" &&
      parameter.name.toLowerCase() === "idempotency-key",
  );
}

function successStatuses(method, path) {
  const { operation } = openApiOperation(method, path);
  return Object.keys(operation.responses).filter((status) => {
    const numeric = Number(status);
    return Number.isInteger(numeric) && numeric >= 200 && numeric < 300;
  });
}

function documentsReplayHeader(method, path) {
  return successStatuses(method, path).some((status) =>
    Object.keys(responseObject(method, path, status).headers ?? {}).some(
      (name) => name.toLowerCase() === "idempotency-replayed",
    ),
  );
}

function operationHref(method, path) {
  const { operation } = openApiOperation(method, path);
  const href = operation["x-mint"]?.href;
  assert.ok(href, `Missing generated href for ${method.toUpperCase()} ${path}`);
  return href;
}

function operationMarkdown(method, path) {
  return "[`" + method.toUpperCase() + " " + path + "`](" + operationHref(method, path) + ")";
}

function webhookExample(name) {
  const media = openapi.webhooks?.[name]?.post?.requestBody?.content?.[
    "application/json"
  ];
  const example = media?.example ?? Object.values(media?.examples ?? {})[0]?.value;
  assert.ok(example, `Missing webhook example ${name}`);
  return example;
}

function webhookHref(name) {
  const href = openapi.webhooks?.[name]?.post?.["x-mint"]?.href;
  assert.ok(href, `Missing generated webhook href ${name}`);
  return href;
}

function sectionText(text, heading) {
  const marker = `## ${heading}`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `Missing section ${marker}`);
  const next = text.indexOf("\n## ", start + marker.length);
  return text.slice(start, next === -1 ? text.length : next);
}

function h2Headings(text) {
  return [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
}

function wordCount(text) {
  return (text.match(/\S+/g) ?? []).length;
}

function jsonBlocks(text) {
  return [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((match, index) => {
    assert.doesNotThrow(
      () => JSON.parse(match[1]),
      `JSON block ${index + 1} must contain valid JSON`,
    );
    return JSON.parse(match[1]);
  });
}

function hasDeepEqual(values, expected) {
  return values.some((value) => {
    try {
      assert.deepEqual(value, expected);
      return true;
    } catch {
      return false;
    }
  });
}

function bashBlocks(text) {
  return [...text.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1]);
}

function normalizePath(url) {
  let path = url
    .replace(/^https:\/\/platform\.swipelux\.com/, "")
    .replace(/^\$\{API_BASE\}/, "")
    .split("?")[0];

  for (const [variable, parameter] of PATH_VARIABLES) {
    path = path.replaceAll(`\${${variable}}`, `{${parameter}}`);
  }
  return path;
}

function parseJsonBody(block) {
  const heredoc = block.match(/--data\s+@-\s+<<'?JSON'?\n([\s\S]*?)\n\s*JSON(?:\n|$)/);
  if (heredoc) {
    const materializedNumbers = heredoc[1].replace(
      /\$\{([A-Z_][A-Z0-9_]*)\}/g,
      (value, name) =>
        typeof BODY_VARIABLES[name] === "number"
          ? String(BODY_VARIABLES[name])
          : value,
    );
    return JSON.parse(materializedNumbers);
  }

  const quoted = block.match(/--data\s+'([^']*)'/);
  return quoted ? JSON.parse(quoted[1]) : undefined;
}

function parseCurl(block, label) {
  const method = block.match(/--request\s+([A-Z]+)/i)?.[1]?.toLowerCase();
  const rawUrl = block.match(
    /["']((?:https:\/\/platform\.swipelux\.com|\$\{API_BASE\})\/v3\/[^"']+)["']/,
  )?.[1];
  assert.ok(method && rawUrl, `${label} must declare a method and API URL`);

  return {
    body: parseJsonBody(block),
    headers: [...block.matchAll(/--header\s+["']([^"']+)["']/g)].map(
      (match) => match[1],
    ),
    method,
    path: normalizePath(rawUrl),
    source: block,
  };
}

function curlExamples(text, label) {
  return bashBlocks(text)
    .filter((block) => /(^|\n)\s*curl\s/.test(block))
    .map((block, index) => parseCurl(block, `${label} curl ${index + 1}`));
}

function headerValues(example, name) {
  return example.headers
    .filter((header) => header.slice(0, header.indexOf(":")) === name)
    .map((header) => header.slice(header.indexOf(":") + 1).trim());
}

function materializeBody(value) {
  if (Array.isArray(value)) return value.map(materializeBody);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, materializeBody(item)]),
    );
  }
  if (typeof value === "string") {
    const variable = value.match(/^\$\{([A-Z_][A-Z0-9_]*)\}$/)?.[1];
    if (variable && Object.hasOwn(BODY_VARIABLES, variable)) {
      return BODY_VARIABLES[variable];
    }
  }
  return value;
}

function assertCurlMatchesOpenApi(example, label) {
  openApiOperation(example.method, example.path);
  assert.equal(headerValues(example, "X-API-Key").length, 1, `${label} needs X-API-Key`);

  const requiredHeaders = openApiValidator.requiredParameterNames(
    example.method,
    example.path,
    "header",
  );
  for (const name of requiredHeaders) {
    const values = headerValues(example, name);
    assert.equal(values.length, 1, `${label} requires one ${name} header`);
    const validation = openApiValidator.validateParameter(
      example.method,
      example.path,
      "header",
      name,
      values[0],
    );
    assert.equal(
      validation.valid,
      true,
      `${label} has invalid ${name}: ${JSON.stringify(validation.errors)}`,
    );
  }

  const body = requestBody(example.method, example.path);
  if (!body) {
    assert.equal(example.body, undefined, `${label} must not send a JSON body`);
    return;
  }

  assert.notEqual(example.body, undefined, `${label} must send a JSON body`);
  assert.equal(
    headerValues(example, "Content-Type")[0],
    "application/json",
    `${label} must send application/json`,
  );
  const validation = openApiValidator.validateRequestBody(
    example.method,
    example.path,
    materializeBody(example.body),
  );
  assert.equal(
    validation.valid,
    true,
    `${label} body must match OpenAPI: ${JSON.stringify(validation.errors)}`,
  );
}

function linkedOperationLabels(text) {
  return [
    ...text.matchAll(
      /\[`(GET|POST|PATCH|PUT|DELETE) (\/v3\/[^`]+)`\]\(([^)]+)\)/g,
    ),
  ].map((match) => ({
    href: match[3],
    method: match[1].toLowerCase(),
    path: match[2],
  }));
}

function enumValues(schema, seen = new Set()) {
  if (!schema || typeof schema !== "object") return [];
  const resolved = resolveReference(schema);
  if (seen.has(resolved)) return [];
  seen.add(resolved);
  const values = [
    ...(resolved.enum ?? []),
    ...(Object.hasOwn(resolved, "const") ? [resolved.const] : []),
  ];
  for (const key of ["oneOf", "anyOf", "allOf"]) {
    for (const branch of resolved[key] ?? []) values.push(...enumValues(branch, seen));
  }
  return [...new Set(values)];
}

function assertExactSet(actual, expected, label) {
  assert.equal(new Set(actual).size, actual.length, `${label} contains duplicates`);
  assert.deepEqual(actual.toSorted(), expected.toSorted(), label);
}

function assertSandboxSafetyBoundary(label, text) {
  assert.doesNotMatch(
    text,
    /sandbox[\s\S]{0,120}(?:requires?|send|use)[\s\S]{0,80}`Idempotency-Key`/i,
    `${label} must not invent a sandbox-wide idempotency requirement`,
  );
  assert.doesNotMatch(
    text,
    /sandbox[\s\S]{0,120}`Idempotency-Replayed`/i,
    `${label} must not invent sandbox replay headers`,
  );
}

function assertEnvironmentSemantics(label, text) {
  assert.match(
    text,
    /same (?:API )?(?:host|base URL)[\s\S]{0,120}`https:\/\/platform\.swipelux\.com`/i,
  );
  assert.match(text, /sandbox (?:API )?key selects (?:the )?environment/i);
  assert.match(text, /no real funds move|without moving real funds/i);
  assert.match(text, /do not replace production compliance or onboarding/i);
  assert.doesNotMatch(text, /sandbox\.swipelux\.com|api\.swipelux\.com/i);
  assert.doesNotMatch(text, /same as production|identical to production|production equivalent/i);
}

function checklistItems(text) {
  return [...text.matchAll(/^- \[ \] (.+)$/gm)].map((match) => match[1]);
}

for (const page of PAGES) {
  test(`${pageFile(page)} exists with valid frontmatter and published text`, () => {
    requiredPage(page);
  });
}

test("operational pages appear in navigation exactly once", () => {
  const navigationPages = collectNavigationPages(config.navigation);
  for (const page of PAGES) {
    assert.equal(
      navigationPages.filter((candidate) => candidate === page).length,
      1,
      `${page} must appear in navigation exactly once`,
    );
  }
});

test("webhooks presents one complete crash-safe delivery workflow", () => {
  const text = requiredPage("integration/webhooks");
  assert.deepEqual(h2Headings(text), [
    "Register an endpoint",
    "Process an event",
    "Refetch current state",
    "Replay a delivery",
    "Recover missed changes",
  ]);

  const examples = curlExamples(text, pageFile("integration/webhooks"));
  const create = examples.filter(
    ({ method, path }) => method === "post" && path === "/v3/webhooks",
  );
  assert.equal(create.length, 1, "Webhooks needs one endpoint registration request");
  assert.deepEqual(create[0].body, {
    url: "https://example.com/webhooks/swipelux",
    events: ["transfer.state_changed"],
  });
  assertCurlMatchesOpenApi(create[0], "webhook registration");
  assert.ok(text.includes(operationMarkdown("post", "/v3/webhooks")));

  const register = sectionText(text, "Register an endpoint");
  assert.match(register, /data\.id[\s\S]{0,120}WEBHOOK_ID/i);
  assert.match(register, /data\.status[\s\S]{0,120}WEBHOOK_STATUS/i);
  assert.equal(
    (text.match(/\]\(\/integration\/api-reliability\)/g) ?? []).length,
    1,
    "Webhooks should link API reliability once for configuration writes",
  );

  const process = sectionText(text, "Process an event");
  assert.ok(
    process.includes(
      "[`transfer.state_changed`](" + webhookHref("transfer.state_changed") + ")",
    ),
  );
  assert.ok(
    hasDeepEqual(jsonBlocks(process), webhookExample("transfer.state_changed")),
    "Webhooks must use the exact transfer.state_changed example",
  );
  assert.match(process, /persist[\s\S]{0,100}(?:event )?`id`[\s\S]{0,120}durable inbox/i);
  assert.match(process, /before[\s\S]{0,100}side effects?/i);
  assert.match(process, /completed[\s\S]{0,100}(?:duplicate|deduplicat|no-op)/i);
  assert.match(process, /(?:incomplete|pending|failed)[\s\S]{0,140}(?:resume|crash)/i);

  const refetch = sectionText(text, "Refetch current state");
  assert.match(refetch, /`resource\.type`[\s\S]{0,100}`resource\.id`/i);
  assert.match(refetch, /authenticated[\s\S]{0,120}current state/i);
  assert.ok(refetch.includes(operationMarkdown("get", "/v3/transfers/{transferId}")));
  const transferRead = examples.filter(
    ({ method, path }) =>
      method === "get" && path === "/v3/transfers/{transferId}",
  );
  assert.equal(transferRead.length, 1);
  assertCurlMatchesOpenApi(transferRead[0], "transfer refetch");

  const replay = sectionText(text, "Replay a delivery");
  assert.ok(replay.includes(operationMarkdown("get", "/v3/webhooks/portal")));
  assert.match(replay, /delivery logs[\s\S]{0,100}retries[\s\S]{0,100}manual replay/i);
  assert.match(replay, /returned `url`[\s\S]{0,120}(?:store|open|use)/i);
  assert.deepEqual(responseSchema("get", "/v3/webhooks/portal").required, ["url"]);

  const recover = sectionText(text, "Recover missed changes");
  assert.match(recover, /\]\(\/integration\/sync-and-reconciliation\)/);
  assert.ok(wordCount(text) <= 900, "Webhooks must stay at or below 900 words");
});

test("API reliability explains one idempotent write and one Problem response", () => {
  const text = requiredPage("integration/api-reliability");
  assert.deepEqual(h2Headings(text), [
    "Make writes idempotent",
    "Retry after an uncertain response",
    "Handle errors",
    "Log correlation IDs",
    "Next step",
  ]);

  const examples = curlExamples(text, pageFile("integration/api-reliability"));
  const write = examples.filter(
    ({ method, path }) => method === "post" && path === "/v3/customers",
  );
  assert.equal(write.length, 1, "API reliability needs one representative write");
  assert.deepEqual(write[0].body, {
    type: "individual",
    externalId: "reliability-example-001",
  });
  assertCurlMatchesOpenApi(write[0], "idempotent customer write");
  assert.ok(text.includes(operationMarkdown("post", "/v3/customers")));

  const idempotency = sectionText(text, "Make writes idempotent");
  assert.match(idempotency, /one (?:key|`Idempotency-Key`)[\s\S]{0,100}intended effect/i);
  const uncertain = sectionText(text, "Retry after an uncertain response");
  assert.match(uncertain, /same key[\s\S]{0,100}identical (?:request and )?body/i);
  assert.match(
    uncertain,
    /intended effect[\s\S]{0,80}(?:changes|different)[\s\S]{0,80}new key/i,
  );

  const problem = openapi.paths["/v3/customers"].post.responses["409"].content[
    "application/problem+json"
  ].examples.requestInProgress.value;
  const errors = sectionText(text, "Handle errors");
  assert.ok(hasDeepEqual(jsonBlocks(errors), problem), "Use the exact OpenAPI Problem example");
  assert.match(errors, /`retryable`[\s\S]{0,140}unchanged retry[\s\S]{0,120}may succeed/i);
  assert.match(errors, /does not make every error retryable|not every error is retryable/i);

  const correlation = sectionText(text, "Log correlation IDs");
  assert.match(correlation, /`correlationId`/);
  assert.match(correlation, /local request[\s\S]{0,120}customer[\s\S]{0,120}resource/i);

  const next = sectionText(text, "Next step");
  assert.match(
    next,
    /\]\(\/integration\/(?:sync-and-reconciliation|webhooks|production-readiness)\)/,
  );
  assert.ok(wordCount(text) <= 800, "API reliability must stay at or below 800 words");
});

test("sync and reconciliation follows every cursor before advancing a checkpoint", () => {
  const text = requiredPage("integration/sync-and-reconciliation");
  const javascript = [...text.matchAll(/```(?:js|javascript)\n([\s\S]*?)```/g)].map(
    (match) => match[1],
  );
  assert.equal(javascript.length, 1, "Sync needs one cursor-loop example");
  assert.match(javascript[0], /updatedAfter/);
  assert.match(javascript[0], /cursor/);
  assert.match(javascript[0], /data/);
  assert.match(javascript[0], /nextCursor/);
  assert.match(javascript[0], /hasMore/);

  assert.match(text, /checkpoint[\s\S]{0,80}minus[\s\S]{0,80}overlap/i);
  assert.match(text, /follow[\s\S]{0,80}every cursor/i);
  assert.match(text, /deduplicate[\s\S]{0,80}resource ID/i);
  assert.match(text, /apply[\s\S]{0,80}current state/i);
  assert.match(
    text,
    /(?:advance|save)[\s\S]{0,80}checkpoint[\s\S]{0,100}only after[\s\S]{0,140}(?:every page|complete|entire)/i,
  );
  assert.match(
    text,
    /(?:page|window)[\s\S]{0,80}fails?[\s\S]{0,120}(?:retain|keep)[\s\S]{0,80}(?:prior|previous) checkpoint/i,
  );
  assert.match(text, /`updatedAfter`[\s\S]{0,100}inclusive[\s\S]{0,100}RFC 3339/i);
  assert.doesNotMatch(text, /\b\d+\s*(?:seconds?|minutes?|hours?|days?)\b/i);

  for (const [method, path] of REPRESENTATIVE_SYNC_OPERATIONS) {
    assert.ok(text.includes(operationMarkdown(method, path)));
    const updatedAfter = operationParameters(method, path).find(
      (parameter) => parameter.in === "query" && parameter.name === "updatedAfter",
    );
    assert.ok(updatedAfter, `${method.toUpperCase()} ${path} must define updatedAfter`);
    assert.match(updatedAfter.description, /at or after[\s\S]*RFC 3339/i);
    const schema = responseSchema(method, path);
    for (const field of ["data", "nextCursor", "hasMore"]) {
      assert.ok(schema.properties?.[field], `${method.toUpperCase()} ${path} needs ${field}`);
    }
  }

  const tail = text.slice(-1000);
  assert.match(tail, /\]\(\/integration\/webhooks\)/);
  assert.match(tail, /\]\(\/integration\/production-readiness\)/);
  assert.ok(wordCount(text) <= 800, "Sync must stay at or below 800 words");
});

test("production readiness covers a controlled environment cutover", () => {
  const text = requiredPage("integration/production-readiness");
  const items = checklistItems(sectionText(text, "Launch checklist"));
  assert.ok(items.length >= 7, "Production readiness needs an actionable checklist");

  const one = (pattern, message) => {
    const matches = items.filter((item) => pattern.test(item));
    assert.equal(matches.length, 1, message);
    return matches[0];
  };

  one(/production key[\s\S]{0,100}(?:separate|server-side)/i, "Missing key separation");
  const environments = one(
    /sandbox[\s\S]{0,120}production[\s\S]{0,160}(?:configuration|IDs?)/i,
    "Missing environment separation",
  );
  assert.match(environments, /same (?:host|base URL)/i);
  assert.match(environments, /key selects/i);
  assert.match(environments, /do not[\s\S]{0,100}(?:automatically )?migrat/i);
  one(/capabilit[\s\S]{0,100}compliance[\s\S]{0,100}launch scope/i, "Missing launch approvals");
  one(/idempotency[\s\S]{0,100}correlation/i, "Missing write observability");
  one(/durable webhook inbox[\s\S]{0,140}(?:portal|replay)[\s\S]{0,140}reconciliation/i, "Missing recovery test");
  one(/account[\s\S]{0,80}recipient[\s\S]{0,80}destination[\s\S]{0,80}transfer[\s\S]{0,80}monitor/i, "Missing state monitoring");
  one(/low-risk[\s\S]{0,80}smoke test[\s\S]{0,120}Swipelux[\s\S]{0,120}broad writes/i, "Missing agreed smoke test");

  for (const href of [
    "/integration/authentication",
    "/integration/api-reliability",
    "/integration/sync-and-reconciliation",
    "/integration/webhooks",
    "/integration/sandbox",
  ]) {
    assert.ok(text.includes(`](${href})`), `Missing ${href}`);
  }
  for (const [method, path] of [
    ["get", "/v3/customers/{customerId}/capabilities/supported"],
    ["get", "/v3/customers/{customerId}/accounts"],
    ["get", "/v3/customers/{customerId}/recipients"],
    [
      "get",
      "/v3/customers/{customerId}/recipients/{recipientId}/destinations",
    ],
    ["get", "/v3/transfers"],
  ]) {
    assert.ok(text.includes(operationMarkdown(method, path)));
  }
  assert.doesNotMatch(text, /\b\d+ generated webhook|event-to-read|event matrix/i);
  assert.ok(wordCount(text) <= 800, "Production readiness must stay at or below 800 words");
});

test("sandbox guide links the exact six helpers while API Reference owns their catalogs", () => {
  const text = requiredPage("integration/sandbox");
  const examples = curlExamples(text, pageFile("integration/sandbox"));
  const sandboxExamples = examples.filter(({ path }) => path.startsWith("/v3/sandbox/"));
  const contractOperations = Object.entries(openapi.paths).flatMap(
    ([path, pathItem]) =>
      HTTP_METHODS.filter(
        (method) => path.startsWith("/v3/sandbox/") && pathItem[method],
      ).map((method) => [method, path]),
  );
  assertExactSet(
    contractOperations.map(JSON.stringify),
    SANDBOX_OPERATIONS.map(JSON.stringify),
    "sandbox operations",
  );
  assertExactSet(
    linkedOperationLabels(text)
      .filter(({ path }) => path.startsWith("/v3/sandbox/"))
      .map(({ method, path }) => JSON.stringify([method, path])),
    SANDBOX_OPERATIONS.map(JSON.stringify),
    "sandbox guide helper links",
  );
  assertExactSet(
    [...new Set(sandboxExamples.map(({ method, path }) => JSON.stringify([method, path])))],
    SANDBOX_OPERATIONS.map(JSON.stringify),
    "sandbox guide helper examples",
  );

  for (const [method, path] of SANDBOX_OPERATIONS) {
    const { operation } = openApiOperation(method, path);
    const security = operation.security ?? openapi.security ?? [];
    assert.ok(
      security.some((requirement) => Object.hasOwn(requirement, "apiKey")),
      `${method.toUpperCase()} ${path} must use apiKey security`,
    );
    assert.ok(requestBodySchema(method, path));
  }
  for (const example of sandboxExamples) {
    assert.deepEqual(
      example.headers.filter((header) => header.startsWith("X-API-Key:")),
      ["X-API-Key: ${SWIPELUX_SANDBOX_API_KEY}"],
    );
    const validation = openApiValidator.validateRequestBody(
      example.method,
      example.path,
      materializeBody(example.body),
    );
    assert.equal(
      validation.valid,
      true,
      `${example.method.toUpperCase()} ${example.path} example must match OpenAPI: ${JSON.stringify(validation.errors)}`,
    );
  }

  assertExactSet(
    enumValues(
      requestBodySchema("post", "/v3/sandbox/transfers/{transferId}/state")
        .properties.state,
    ),
    ["completed", "failed"],
    "sandbox transfer states",
  );
  assert.ok(
    enumValues(
      requestBodySchema(
        "post",
        "/v3/sandbox/customers/{customerId}/verification",
      ).properties.status,
    ).includes("approved"),
  );
  assert.ok(
    enumValues(
      requestBodySchema(
        "post",
        "/v3/sandbox/customers/{customerId}/capabilities/{capabilityId}/status",
      ).properties.status,
    ).includes("ready"),
  );
});

test("sandbox requirements use response-derived task data and submit before review", () => {
  const text = requiredPage("integration/sandbox");
  const examples = curlExamples(text, pageFile("integration/sandbox"));
  assert.doesNotMatch(text, /cus_01JTESTCUSTOMER|capability_from_supported_response/);
  const create = text.indexOf(operationMarkdown("post", "/v3/sandbox/tasks"));
  const submit = text.indexOf(
    operationMarkdown(
      "post",
      "/v3/customers/{customerId}/tasks/{taskId}/submissions",
    ),
  );
  const review = text.indexOf(
    operationMarkdown("post", "/v3/sandbox/tasks/{taskId}/review"),
  );
  assert.ok(create >= 0 && create < submit && submit < review);
  assert.match(text, /\/integration\/onboarding\/capabilities-and-requirements/);
  assert.match(text, /"customerId": "\$\{CUSTOMER_ID\}"/);
  assert.match(text, /"capabilityId": "\$\{CAPABILITY_ID\}"/);
  assert.match(text, /data\.id[\s\S]{0,120}TASK_ID/i);
  assert.match(text, /data\.revision[\s\S]{0,120}TASK_REVISION/i);
  assert.match(text, /data\.requirements[\s\S]{0,160}REQUIREMENT_ID/i);
  assert.match(
    sectionText(text, "Fund a sandbox wallet"),
    /data\.id[\s\S]{0,120}TRANSFER_ID/i,
  );

  const taskBlock = bashBlocks(text).find((block) => block.includes("/v3/sandbox/tasks"));
  assert.ok(taskBlock);
  assert.match(taskBlock, /<<JSON/);
  assert.doesNotMatch(taskBlock, /<<'JSON'/);

  const submission = examples.find(
    ({ method, path }) =>
      method === "post" &&
      path === "/v3/customers/{customerId}/tasks/{taskId}/submissions",
  );
  assert.ok(submission);
  const validation = openApiValidator.validateRequestBody(
    submission.method,
    submission.path,
    materializeBody(submission.body),
  );
  assert.equal(
    validation.valid,
    true,
    `Sandbox task submission must match OpenAPI: ${JSON.stringify(validation.errors)}`,
  );
});

test("keeps sandbox credentials backend-only and does not invent idempotency", () => {
  const text = requiredPage("integration/sandbox");
  for (const [method, path] of SANDBOX_OPERATIONS) {
    assert.equal(idempotencyParameter(method, path), undefined);
    assert.equal(documentsReplayHeader(method, path), false);
  }
  assertSandboxSafetyBoundary(pageFile("integration/sandbox"), text);
  assert.match(text, /backend/i);
  assert.match(text, /do not expose[\s\S]{0,100}`X-API-Key`[\s\S]{0,100}(?:browser|client)/i);
});

test("documents environment-by-key sandbox behavior and the no-real-funds boundary", () => {
  assert.deepEqual(openapi.servers, [
    {
      url: "https://platform.swipelux.com",
      description: "Production and sandbox; environment selected by API key",
    },
  ]);
  const { operation } = openApiOperation(
    "post",
    "/v3/sandbox/accounts/{accountId}/topup",
  );
  assert.match(operation.description, /No real funds move/);
  assertEnvironmentSemantics(
    pageFile("integration/sandbox"),
    requiredPage("integration/sandbox"),
  );
});
