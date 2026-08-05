import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  collectNavigationPages,
  parseFrontmatter,
} from "../scripts/lib/docs-validation.mjs";
import {
  assertPages,
  readPage,
} from "./helpers/content.mjs";

const PAGES = [
  "integration/overview",
  "integration/quickstart",
  "integration/starter-kit",
  "integration/authentication",
  "integration/environments",
  "integration/using-the-api-reference",
  "integration/request-safety",
  "integration/errors",
  "integration/pagination-and-sync",
];

const SANDBOX_OPERATIONS = [
  ["post", "/v3/sandbox/accounts/{accountId}/topup"],
  ["post", "/v3/sandbox/transfers/{transferId}/state"],
  ["post", "/v3/sandbox/tasks"],
  ["post", "/v3/sandbox/tasks/{taskId}/review"],
  ["post", "/v3/sandbox/customers/{customerId}/verification"],
  [
    "post",
    "/v3/sandbox/customers/{customerId}/capabilities/{capabilityId}/status",
  ],
];

const NORMAL_GUIDE_IDEMPOTENT_OPERATIONS = [
  ["post", "/v3/customers"],
  ["post", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
  ["post", "/v3/customers/{customerId}/tasks/{taskId}/submissions"],
  ["post", "/v3/customers/{customerId}/accounts"],
  ["post", "/v3/customers/{customerId}/recipients"],
  [
    "post",
    "/v3/customers/{customerId}/recipients/{recipientId}/destinations",
  ],
  ["post", "/v3/quotes"],
  ["post", "/v3/transfers"],
  ["post", "/v3/webhooks"],
];

const config = JSON.parse(readFileSync("docs.json", "utf8"));
const coverage = JSON.parse(readFileSync("openapi-coverage.json", "utf8"));
const openapi = JSON.parse(readFileSync("openapi.json", "utf8"));

function operation(method, path) {
  const matches = coverage.operations.filter(
    (candidate) => candidate.method === method && candidate.path === path,
  );
  assert.equal(
    matches.length,
    1,
    `Expected one coverage operation for ${method.toUpperCase()} ${path}`,
  );
  return matches[0];
}

function resolveOpenApiReference(value) {
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

  const operationObject = pathItem[method];
  assert.ok(
    operationObject,
    `Missing OpenAPI operation ${method.toUpperCase()} ${path}`,
  );

  return { operationObject, pathItem };
}

function operationParameters(method, path) {
  const { operationObject, pathItem } = openApiOperation(method, path);
  return [...(pathItem.parameters ?? []), ...(operationObject.parameters ?? [])].map(
    resolveOpenApiReference,
  );
}

function idempotencyParameter(method, path) {
  return operationParameters(method, path).find(
    (parameter) =>
      parameter.in === "header" &&
      parameter.name.toLowerCase() === "idempotency-key",
  );
}

function documentsResponseHeader(method, path, headerName) {
  const { operationObject } = openApiOperation(method, path);
  return Object.values(operationObject.responses ?? {}).some((response) => {
    const resolvedResponse = resolveOpenApiReference(response);
    return Object.keys(resolvedResponse.headers ?? {}).some(
      (name) => name.toLowerCase() === headerName.toLowerCase(),
    );
  });
}

function assertOperationLinks(page, operations) {
  const text = readPage(page);
  for (const [method, path] of operations) {
    const { href } = operation(method, path);
    assert.ok(
      text.includes(href),
      `${page}.mdx must link ${method.toUpperCase()} ${path} through ${href}`,
    );
  }
}

function shellBlocks(text) {
  return [...text.matchAll(/```(?:bash|sh|shell)\n([\s\S]*?)```/g)].map(
    (match) => match[1],
  );
}

test("publishes all start pages once with valid guarded MDX", () => {
  assertPages(PAGES);

  const navigationPages = collectNavigationPages(config.navigation);
  for (const page of PAGES) {
    assert.equal(
      navigationPages.filter((candidate) => candidate === page).length,
      1,
      `${page} must appear in navigation exactly once`,
    );

    const text = readPage(page);
    const { attributes } = parseFrontmatter(text);
    assert.ok(attributes.title?.trim(), `${page} must have a nonempty title`);
    assert.ok(
      attributes.description?.trim(),
      `${page} must have a nonempty description`,
    );
    assert.doesNotMatch(
      text,
      /^\s*import\s/m,
      `${page} must use Mintlify built-ins without imports`,
    );
  }
});

test("keeps public authentication and external-doc boundaries narrow", () => {
  const published = PAGES.map((page) => readPage(page)).join("\n");

  assert.doesNotMatch(
    published,
    /\bBearer\b|serviceToken|uploadToken|token endpoints?|client credentials/i,
  );
  assert.doesNotMatch(published, /\blocalStorage\b|\bsessionStorage\b/i);
  assert.doesNotMatch(published, /\bHMAC\b|webhook signatures?/i);
  assert.doesNotMatch(
    published,
    /\bsk\.(?:sbx|live)\b/i,
    "published docs must not assert unproven API-key prefixes",
  );
  assert.doesNotMatch(
    published,
    /https?:\/\/(?:docs|platform)\.swipelux\.com\/(?:api-reference|reference|get-started)/i,
  );
  assert.doesNotMatch(published, /https?:\/\/demo\.swipelux\.com/i);
});

test("overview maps the contract lifecycle and availability boundaries", () => {
  const text = readPage("integration/overview");

  assert.match(
    text,
    /customer[\s\S]*supported capabilities[\s\S]*requested capability[\s\S]*application[\s\S]*tasks[\s\S]*submissions[\s\S]*account[\s\S]*recipient[\s\S]*quote[\s\S]*transfer/i,
  );
  assert.match(text, /availability[\s\S]*supported capabilities/i);
  assert.match(text, /resource status/i);
  assert.match(text, /do not assume/i);

  assertOperationLinks("integration/overview", [
    ["post", "/v3/customers"],
    ["get", "/v3/customers/{customerId}/capabilities/supported"],
    ["post", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
    ["get", "/v3/customers/{customerId}/tasks"],
    ["post", "/v3/customers/{customerId}/tasks/{taskId}/submissions"],
    ["post", "/v3/customers/{customerId}/accounts"],
    ["post", "/v3/customers/{customerId}/recipients"],
    [
      "post",
      "/v3/customers/{customerId}/recipients/{recipientId}/destinations",
    ],
    ["post", "/v3/quotes"],
    ["post", "/v3/transfers"],
    ["get", "/v3/transfers/{transferId}"],
  ]);
});

test("quickstart follows the sandbox sequence and protects every curl mutation", () => {
  const text = readPage("integration/quickstart");
  assert.match(text, /export SWIPELUX_API_KEY='YOUR_SANDBOX_API_KEY'/);
  const orderedEndpoints = [
    "POST /v3/webhooks",
    "POST /v3/customers",
    "GET /v3/customers/{customerId}/capabilities/supported",
    "POST /v3/customers/{customerId}/capabilities/{capabilityId}",
    "GET /v3/customers/{customerId}/tasks",
    "POST /v3/customers/{customerId}/tasks/{taskId}/submissions",
    "GET /v3/customers/{customerId}/capabilities/{capabilityId}",
    "POST /v3/customers/{customerId}/accounts",
    "POST /v3/customers/{customerId}/recipients",
    "POST /v3/customers/{customerId}/recipients/{recipientId}/destinations",
    "POST /v3/quotes",
    "POST /v3/transfers",
    "GET /v3/transfers/{transferId}",
  ];

  let previousIndex = -1;
  for (const endpoint of orderedEndpoints) {
    const index = text.indexOf(endpoint);
    assert.ok(index > previousIndex, `${endpoint} must appear in sequence`);
    previousIndex = index;
  }

  const curlBlocks = shellBlocks(text).filter((block) => /\bcurl\b/.test(block));
  assert.ok(curlBlocks.length >= 3, "quickstart must include focused curl examples");
  for (const block of curlBlocks) {
    assert.match(block, /X-API-Key:/, "every curl example needs X-API-Key");
    const mutates =
      /(?:--request|-X)\s+(?:POST|PATCH|PUT|DELETE)\b/i.test(block) ||
      /(?:--data|-d)(?:\s|=)/.test(block);
    if (mutates) {
      assert.match(
        block,
        /Idempotency-Key:/,
        "every effectful curl example needs Idempotency-Key",
      );
    }
  }

  assert.match(text, /optional[\s\S]{0,120}recommended/i);
  assert.match(text, /depends on[\s\S]{0,120}capability/i);
  assert.match(text, /conditional|when required/i);
  assert.match(
    text,
    /continue only when[\s\S]{0,100}current status[\s\S]{0,100}permits[\s\S]{0,140}(?:account|destination|quote)/i,
  );
  assert.match(
    text,
    /controlled sandbox state change[\s\S]{0,180}\[Environments\]\(\/integration\/environments\)/i,
  );
  assert.doesNotMatch(
    text,
    /(?:always|automatically|will)\s+(?:become|transition to|reach)\s+ready/i,
  );
  assert.doesNotMatch(text, /will (?:complete|settle)|guaranteed to (?:complete|settle)/i);

  assertOperationLinks("integration/quickstart", [
    ["post", "/v3/webhooks"],
    ["post", "/v3/customers"],
    ["get", "/v3/customers/{customerId}/capabilities/supported"],
    ["post", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
    ["get", "/v3/customers/{customerId}/tasks"],
    ["post", "/v3/customers/{customerId}/tasks/{taskId}/submissions"],
    ["get", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
    ["post", "/v3/customers/{customerId}/accounts"],
    ["post", "/v3/customers/{customerId}/recipients"],
    [
      "post",
      "/v3/customers/{customerId}/recipients/{recipientId}/destinations",
    ],
    ["post", "/v3/quotes"],
    ["post", "/v3/transfers"],
    ["get", "/v3/transfers/{transferId}"],
  ]);
});

test("starter kit uses current links and separates local, sandbox, and production", () => {
  const text = readPage("integration/starter-kit");

  assert.match(text, /https:\/\/github\.com\/swipelux\/neobank-starter/);
  assert.match(text, /https:\/\/neobank-starter\.vercel\.app/);
  assert.match(text, /git clone https:\/\/github\.com\/swipelux\/neobank-starter/);
  assert.match(text, /local demo data/i);
  assert.match(text, /connected sandbox data/i);
  assert.match(text, /in-app sandbox connection[\s\S]{0,140}demo-only sandbox behavior/i);
  assert.match(text, /not[\s\S]{0,80}production credential architecture/i);
  assert.match(text, /sandbox key[\s\S]*not[\s\S]*production credential/i);
  assert.match(text, /does not authorize[\s\S]*production|does not authorize[\s\S]*real-money/i);
  assert.match(
    text,
    /production[\s\S]{0,180}(?:move|keep)[\s\S]{0,80}API credentials[\s\S]{0,120}backend[\s\S]{0,120}secret manager/i,
  );
  assert.match(text, /production[\s\S]*readiness process/i);
  assert.doesNotMatch(text, /one key|single key|live tomorrow|go live/i);
});

test("authentication documents only the public apiKey header flow", () => {
  const text = readPage("integration/authentication");

  assert.match(text, /\bapiKey\b/);
  assert.match(text, /X-API-Key/);
  assert.match(text, /https:\/\/platform\.swipelux\.com/);
  assert.match(text, /same base URL/i);
  assert.match(text, /key[\s\S]{0,100}determines[\s\S]{0,100}environment/i);
  assert.match(text, /backend|server-side/i);
  assert.match(text, /secret manager/i);
  assert.ok(
    shellBlocks(text).some((block) =>
      block.includes('--header "X-API-Key: YOUR_API_KEY"'),
    ),
    "authentication curl must use the safe YOUR_API_KEY placeholder",
  );
  assert.doesNotMatch(text, /\bsk\.(?:sbx|live)\b/i);
  assert.doesNotMatch(
    text,
    /\bBearer\b|serviceToken|uploadToken|token endpoints?|client credentials|\bscopes?\b|\bpermissions?\b/i,
  );
  assert.doesNotMatch(text, /store[\s\S]{0,40}(?:browser|localStorage)/i);
});

test("environments lists exactly the six contract sandbox helpers", () => {
  const text = readPage("integration/environments");

  assert.match(text, /same base URL/i);
  assert.match(text, /https:\/\/platform\.swipelux\.com/);
  assert.match(text, /environment[\s\S]{0,100}(?:selected|determined)[\s\S]{0,100}key/i);
  assert.match(text, /sandbox context/i);
  assert.doesNotMatch(text, /\b403\b|dashboard/i);

  const mentionedSandboxPaths = [
    ...text.matchAll(/\/v3\/sandbox\/[A-Za-z0-9{}._/-]+/g),
  ].map((match) => match[0]);
  assert.deepEqual(
    [...mentionedSandboxPaths].sort(),
    SANDBOX_OPERATIONS.map(([, path]) => path).sort(),
  );

  for (const [method, path] of SANDBOX_OPERATIONS) {
    assert.equal(
      mentionedSandboxPaths.filter((candidate) => candidate === path).length,
      1,
      `${path} must appear once`,
    );
    assert.match(text, new RegExp(openapi.paths[path][method].summary));
  }
  assertOperationLinks("integration/environments", SANDBOX_OPERATIONS);
});

test("API reference guide explains generated exact fields and stable links", () => {
  const text = readPage("integration/using-the-api-reference");

  assert.match(text, /committed `openapi\.json`/i);
  assert.match(text, /generated/i);
  assert.match(text, /exact[\s\S]{0,120}(?:operation|schema|field)/i);
  assert.match(text, /`x-mint\.href`/);
  assert.match(text, /guides[\s\S]{0,120}concept/i);

  assertOperationLinks("integration/using-the-api-reference", [
    ["post", "/v3/customers"],
    ["get", "/v3/customers/{customerId}/capabilities/supported"],
    ["post", "/v3/transfers"],
  ]);
});

test("OpenAPI scopes required idempotency keys to declared operations", () => {
  for (const [method, path] of SANDBOX_OPERATIONS) {
    assert.equal(
      idempotencyParameter(method, path),
      undefined,
      `${method.toUpperCase()} ${path} must not declare Idempotency-Key`,
    );
  }

  for (const [method, path] of NORMAL_GUIDE_IDEMPOTENT_OPERATIONS) {
    const parameter = idempotencyParameter(method, path);
    assert.ok(parameter, `${method.toUpperCase()} ${path} must declare Idempotency-Key`);
    assert.equal(
      parameter.required,
      true,
      `${method.toUpperCase()} ${path} must require Idempotency-Key`,
    );
  }
});

test("OpenAPI scopes replay response headers separately from required keys", () => {
  const cancellation = ["post", "/v3/transfers/{transferId}/cancel"];
  const cancellationParameter = idempotencyParameter(...cancellation);
  assert.ok(
    cancellationParameter,
    "transfer cancellation must declare Idempotency-Key",
  );
  assert.equal(
    cancellationParameter.required,
    true,
    "transfer cancellation must require Idempotency-Key",
  );
  assert.equal(
    documentsResponseHeader(...cancellation, "Idempotency-Replayed"),
    false,
    "transfer cancellation responses must not document Idempotency-Replayed",
  );

  for (const operationEntry of [
    ["post", "/v3/quotes"],
    ["post", "/v3/transfers"],
  ]) {
    assert.ok(
      documentsResponseHeader(...operationEntry, "Idempotency-Replayed"),
      `${operationEntry[0].toUpperCase()} ${operationEntry[1]} must document Idempotency-Replayed`,
    );
  }
});

test("request safety preserves the documented idempotency and retry boundary", () => {
  const text = readPage("integration/request-safety");

  assert.match(text, /idempotency is operation-specific/i);
  assert.match(text, /generated operation page/i);
  assert.match(text, /committed `openapi\.json`/i);
  assert.match(text, /authoritative|source of truth/i);
  assert.match(
    text,
    /when an operation declares[\s\S]{0,120}`Idempotency-Key`[\s\S]{0,120}required/i,
  );
  assert.match(text, /unique key[\s\S]{0,100}intended effect/i);
  assert.match(
    text,
    /transport uncertainty[\s\S]{0,120}(?:reuse|same key)[\s\S]{0,120}identical body/i,
  );
  assert.match(
    text,
    /normal (?:integration )?guides[\s\S]{0,220}customer[\s\S]{0,80}capability[\s\S]{0,80}task[\s\S]{0,80}account[\s\S]{0,80}recipient[\s\S]{0,80}quote[\s\S]{0,80}transfer[\s\S]{0,80}webhook/i,
  );
  assert.match(
    text,
    /six current[\s\S]{0,80}`\/v3\/sandbox\/\*`[\s\S]{0,100}do not declare[\s\S]{0,80}`Idempotency-Key`/i,
  );
  assert.match(
    text,
    /do not add[\s\S]{0,120}(?:header|`Idempotency-Key`)[\s\S]{0,120}sandbox[\s\S]{0,120}unless[\s\S]{0,120}operation page changes/i,
  );
  assert.match(text, /`Idempotency-Replayed: true`/);
  assert.match(
    text,
    /operations? or responses?[\s\S]{0,100}document[\s\S]{0,80}`Idempotency-Replayed`/i,
  );
  assert.match(
    text,
    /check the generated operation page[\s\S]{0,140}(?:rather than|instead of)[\s\S]{0,100}(?:rely|assum)[\s\S]{0,80}universally/i,
  );
  assert.match(text, /safe[\s\S]{0,80}(?:read|GET)[\s\S]{0,80}retr/i);
  assert.match(text, /retryable[\s\S]{0,100}status[\s\S]{0,100}code|status[\s\S]{0,100}code[\s\S]{0,100}retryable/i);
  assert.match(text, /idempotency_conflict/);
  assert.match(text, /idempotency_request_in_progress/);
  assert.match(text, /where they apply/i);
  assert.match(text, /do not blindly retry/i);
  assert.doesNotMatch(
    text,
    /every effectful[\s\S]{0,100}(?:requires|must include)[\s\S]{0,80}`Idempotency-Key`/i,
  );
  assert.doesNotMatch(
    text,
    /a replayed response includes[\s\S]{0,100}`Idempotency-Replayed`/i,
  );
  assert.doesNotMatch(text, /\bTTL\b|time[- ]to[- ]live|concurren(?:cy|t) guarantee/i);

  assertOperationLinks("integration/request-safety", [
    ["post", "/v3/quotes"],
    ["post", "/v3/transfers"],
  ]);
});

test("errors documents the shared Problem contract and safe diagnostics", () => {
  const text = readPage("integration/errors");

  for (const field of [
    "type",
    "title",
    "status",
    "code",
    "detail",
    "correlationId",
  ]) {
    assert.match(text, new RegExp(`\\b${field}\\b`), `missing ${field}`);
  }
  for (const field of ["pointer", "code", "message"]) {
    assert.match(text, new RegExp(`\\b${field}\\b`), `missing field error ${field}`);
  }
  assert.match(text, /X-Request-Id/);
  assert.match(text, /correlationId[\s\S]{0,100}mirrors[\s\S]{0,100}X-Request-Id/i);
  assert.match(text, /retryable/);
  assert.match(text, /statusReason/);
  assert.match(text, /PII/);
  assert.match(text, /```json\n[\s\S]*"correlationId"[\s\S]*```/);

  assertOperationLinks("integration/errors", [
    ["post", "/v3/customers"],
    ["post", "/v3/transfers"],
  ]);
});

test("pagination scopes ordering and explains cursor recovery", () => {
  const text = readPage("integration/pagination-and-sync");

  assert.match(text, /paginated list operations[\s\S]{0,80}cursor envelope/i);
  assert.doesNotMatch(text, /^List operations use\b/im);
  for (const field of ["data", "nextCursor", "hasMore"]) {
    assert.match(text, new RegExp(`\\b${field}\\b`), `missing ${field}`);
  }
  assert.match(text, /opaque cursor/i);
  assert.match(text, /customers?[\s\S]{0,180}`createdAt DESC`[\s\S]{0,100}`id DESC`/i);
  assert.match(text, /do not (?:assume|generalize)[\s\S]{0,120}(?:other|every) resource/i);
  assert.match(text, /updatedAfter/);
  assert.match(text, /inclusive[\s\S]{0,80}RFC 3339[\s\S]{0,80}lower bound/i);
  assert.match(text, /missed webhook/i);
  assert.match(text, /overlap window/i);
  assert.match(text, /deduplicat[\s\S]{0,80}resource id/i);
  assert.match(text, /refetch[\s\S]{0,80}(?:changed|resource)/i);
  assert.match(text, /does not[\s\S]{0,80}(?:promise|imply)[\s\S]{0,80}delivery guarantee/i);

  assertOperationLinks("integration/pagination-and-sync", [
    ["get", "/v3/customers"],
  ]);
});
