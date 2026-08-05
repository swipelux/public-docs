import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

const QUICKSTART_CURL_OPERATIONS = [
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
];

const QUICKSTART_PATH_VARIABLES = new Map([
  ["CUSTOMER_ID", "customerId"],
  ["CAPABILITY_ID", "capabilityId"],
  ["TASK_ID", "taskId"],
  ["RECIPIENT_ID", "recipientId"],
  ["TRANSFER_ID", "transferId"],
]);

const QUICKSTART_SHELL_ENV = Object.freeze({
  PATH: "/nonexistent",
  API_BASE: "https://quickstart.test",
  SWIPELUX_SANDBOX_API_KEY: "sandbox-key-shell-test",
  RUN_ID: "run-shell-test",
  WEBHOOK_URL: "https://webhooks.quickstart.test/swipelux",
  CUSTOMER_ID: "cus_shell_test",
  CAPABILITY_ID: "cap_shell_test",
  TASK_ID: "task_shell_test",
  RECIPIENT_ID: "recipient_shell_test",
  QUOTE_ID: "quote_shell_test",
  TRANSFER_ID: "transfer_shell_test",
});

const CAPABILITY_AVAILABILITY = Object.freeze({
  available: "available",
  beta: "beta",
  disabled: "disabled",
});

const config = JSON.parse(readFileSync("docs.json", "utf8"));
const coverage = JSON.parse(readFileSync("openapi-coverage.json", "utf8"));
const openapi = JSON.parse(readFileSync("openapi.json", "utf8"));
const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
];
const SANDBOX_OPERATIONS = Object.entries(openapi.paths).flatMap(
  ([path, pathItem]) =>
    path.startsWith("/v3/sandbox/")
      ? HTTP_METHODS.filter((method) => pathItem[method]).map((method) => [
          method,
          path,
        ])
      : [],
);

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

function responseSchema(method, path, status = "200") {
  const { operationObject } = openApiOperation(method, path);
  const response = resolveOpenApiReference(operationObject.responses?.[status]);
  assert.ok(response, `Missing ${status} response for ${method.toUpperCase()} ${path}`);
  const schema = response.content?.["application/json"]?.schema;
  assert.ok(
    schema,
    `Missing application/json schema for ${method.toUpperCase()} ${path} ${status}`,
  );
  return resolveOpenApiReference(schema);
}

function requestBodySchema(method, path) {
  const { operationObject } = openApiOperation(method, path);
  const requestBody = resolveOpenApiReference(operationObject.requestBody);
  assert.ok(requestBody, `Missing request body for ${method.toUpperCase()} ${path}`);
  const schema = requestBody.content?.["application/json"]?.schema;
  assert.ok(
    schema,
    `Missing application/json request schema for ${method.toUpperCase()} ${path}`,
  );
  return resolveOpenApiReference(schema);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertExactOpenApiSet(actual, expected, label) {
  assert.ok(Array.isArray(actual), `${label} must be an array`);
  assert.equal(
    new Set(actual).size,
    actual.length,
    `${label} must not contain duplicates`,
  );
  assert.deepEqual(
    actual.toSorted(),
    expected.toSorted(),
    `${label} must contain exactly the expected values`,
  );
}

function assertOperationLinksInText(label, text, operations) {
  for (const [method, path] of operations) {
    const { href } = operation(method, path);
    const operationLabel = `\`${method.toUpperCase()} ${path}\``;
    assert.match(
      text,
      new RegExp(
        `\\[${escapeRegExp(operationLabel)}\\]\\(${escapeRegExp(href)}\\)`,
      ),
      `${label} must bind ${operationLabel} to ${href}`,
    );
  }
}

function assertOperationLinks(page, operations) {
  assertOperationLinksInText(`${page}.mdx`, readPage(page), operations);
}

function mdxAttributeValues(attributes, name) {
  return [
    ...attributes.matchAll(
      new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, "g"),
    ),
  ].map((match) => match[2]);
}

function cardLinks(text, label) {
  return [...text.matchAll(/<Card\b([\s\S]*?)>/g)].map((match, index) => {
    const attributes = match[1];
    const titles = mdxAttributeValues(attributes, "title");
    const hrefs = mdxAttributeValues(attributes, "href");
    assert.equal(titles.length, 1, `${label} Card ${index + 1} must have one title`);
    assert.equal(hrefs.length, 1, `${label} Card ${index + 1} must have one href`);
    return { title: titles[0], href: hrefs[0] };
  });
}

function assertCardOperationLinksInText(label, text, expectedCards) {
  const cards = cardLinks(text, label);
  for (const [title, method, path] of expectedCards) {
    const matches = cards.filter((card) => card.title === title);
    assert.equal(matches.length, 1, `${label} must contain one ${title} Card`);
    const { href } = operation(method, path);
    assert.equal(
      matches[0].href,
      href,
      `${label} must bind the ${title} Card to ${method.toUpperCase()} ${path}`,
    );
  }
}

function assertCardOperationLinks(page, expectedCards) {
  assertCardOperationLinksInText(
    `${page}.mdx`,
    readPage(page),
    expectedCards,
  );
}

function shellBlocks(text) {
  return [...text.matchAll(/```(?:bash|sh|shell)\n([\s\S]*?)```/g)].map(
    (match) => match[1],
  );
}

function curlArgumentsFromBash(block, label) {
  const startMarker = "__SWIPELUX_CURL_START__";
  const endMarker = "__SWIPELUX_CURL_END__";
  const script = [
    "set -euo pipefail",
    "curl() {",
    `  printf '%s\\0' '${startMarker}' \"$@\" '${endMarker}'`,
    "}",
    block,
  ].join("\n");
  const result = spawnSync(
    "/bin/bash",
    ["--noprofile", "--norc", "-c", script],
    {
      encoding: "utf8",
      env: QUICKSTART_SHELL_ENV,
    },
  );

  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    `${label} must execute under Bash with the stub curl: ${result.stderr.trim()}`,
  );

  const output = result.stdout.split("\0");
  const startIndexes = output.flatMap((value, index) =>
    value === startMarker ? [index] : [],
  );
  const endIndexes = output.flatMap((value, index) =>
    value === endMarker ? [index] : [],
  );
  assert.equal(startIndexes.length, 1, `${label} must invoke curl exactly once`);
  assert.equal(endIndexes.length, 1, `${label} must finish one curl invocation`);

  const argv = output.slice(startIndexes[0] + 1, endIndexes[0]);
  assert.doesNotMatch(
    argv.join("\n"),
    /\$\{[^}]+\}/,
    `${label} must not pass an unresolved shell placeholder to curl`,
  );

  const curlSource = block.slice(block.search(/(?:^|\n)\s*curl\b/));
  const variables = new Set(
    [...curlSource.matchAll(/\$\{([A-Z][A-Z0-9_]*)(?:[^}]*)\}/g)].map(
      (match) => match[1],
    ),
  );
  for (const variable of variables) {
    assert.ok(
      Object.hasOwn(QUICKSTART_SHELL_ENV, variable),
      `${label} uses unknown shell placeholder ${variable}`,
    );
    assert.ok(
      argv.some((argument) =>
        argument.includes(QUICKSTART_SHELL_ENV[variable]),
      ),
      `${label} must expand ${variable} into curl argv`,
    );
  }

  return argv;
}

function normalizeQuickstartPath(path) {
  let normalized = path.split(/[?#]/, 1)[0];
  for (const [variable, parameter] of QUICKSTART_PATH_VARIABLES) {
    normalized = normalized.replaceAll(`\${${variable}}`, `{${parameter}}`);
  }
  assert.doesNotMatch(
    normalized,
    /\$\{[A-Z0-9_]+\}/,
    `Unrecognized shell path variable in ${path}`,
  );
  return normalized;
}

function curlOperation(block, label) {
  const methodMatches = [
    ...block.matchAll(/(?:--request|-X)\s+([A-Za-z]+)/g),
  ];
  assert.equal(methodMatches.length, 1, `${label} must declare exactly one method`);
  const method = methodMatches[0][1].toLowerCase();

  const pathMatches = [
    ...block.matchAll(/\$\{API_BASE\}(\/v3\/[^\s"'\\]+)/g),
  ];
  assert.equal(
    pathMatches.length,
    1,
    `${label} must contain exactly one API_BASE path`,
  );
  const path = normalizeQuickstartPath(pathMatches[0][1]);

  const matches = Object.entries(openapi.paths).filter(
    ([candidatePath, pathItem]) =>
      candidatePath === path && pathItem[method] !== undefined,
  );
  assert.equal(
    matches.length,
    1,
    `${label} must resolve exactly one OpenAPI operation, received ${method.toUpperCase()} ${path}`,
  );

  return { method, path };
}

function curlHeaderValues(block, headerName) {
  return [...block.matchAll(/(?:--header|-H)\s+(["'])([^"']*)\1/g)]
    .map((match) => match[2])
    .filter((header) => {
      const separator = header.indexOf(":");
      return (
        separator >= 0 &&
        header.slice(0, separator).trim().toLowerCase() ===
          headerName.toLowerCase()
      );
    })
    .map((header) => header.slice(header.indexOf(":") + 1).trim());
}

function curlBodyArgumentCount(block) {
  return [
    ...block.matchAll(
      /(?:^|\s)(?:--data(?:-[a-z]+)?|-d|--json)(?=\s|=)/gim,
    ),
  ].length;
}

function operationRequestBody(method, path) {
  const { operationObject } = openApiOperation(method, path);
  return operationObject.requestBody
    ? resolveOpenApiReference(operationObject.requestBody)
    : undefined;
}

function assertCurlMatchesOpenApi(block, label) {
  curlArgumentsFromBash(block, label);
  const { method, path } = curlOperation(block, label);
  assert.equal(
    curlHeaderValues(block, "X-API-Key").length,
    1,
    `${label} must include X-API-Key exactly once`,
  );

  const parameter = idempotencyParameter(method, path);
  const requiresIdempotency = parameter?.required === true;
  assert.equal(
    curlHeaderValues(block, "Idempotency-Key").length,
    requiresIdempotency ? 1 : 0,
    `${method.toUpperCase()} ${path} ${
      requiresIdempotency ? "requires" : "does not require"
    } exactly one Idempotency-Key`,
  );

  const requestBody = operationRequestBody(method, path);
  const bodyArgumentCount = curlBodyArgumentCount(block);
  if (requestBody?.required === true) {
    assert.equal(
      bodyArgumentCount,
      1,
      `${method.toUpperCase()} ${path} requires exactly one request body`,
    );
  } else if (!requestBody) {
    assert.equal(
      bodyArgumentCount,
      0,
      `${method.toUpperCase()} ${path} does not define a request body`,
    );
  } else {
    assert.ok(
      bodyArgumentCount <= 1,
      `${method.toUpperCase()} ${path} must send at most one request body`,
    );
  }

  const sendsJsonBody = bodyArgumentCount === 1;
  if (sendsJsonBody) {
    assert.ok(
      requestBody?.content?.["application/json"],
      `${method.toUpperCase()} ${path} must declare application/json before the curl sends JSON`,
    );
  }
  const contentTypes = curlHeaderValues(block, "Content-Type");
  assert.equal(
    contentTypes.length,
    sendsJsonBody ? 1 : 0,
    `${method.toUpperCase()} ${path} must include Content-Type exactly when sending a JSON body`,
  );
  if (sendsJsonBody) {
    assert.equal(
      contentTypes[0].toLowerCase(),
      "application/json",
      `${method.toUpperCase()} ${path} must send JSON as application/json`,
    );
  }

  return { method, path };
}

function capabilitySelectionFacts() {
  const supportedPath = "/v3/customers/{customerId}/capabilities/supported";
  const supported = responseSchema("get", supportedPath);
  assert.ok(supported.required?.includes("data"));
  assert.equal(supported.properties?.data?.type, "array");

  const variant = resolveOpenApiReference(supported.properties.data.items);
  for (const field of ["availability", "eligibility", "institutions"]) {
    assert.ok(
      variant.required?.includes(field),
      `supported capability variants must require ${field}`,
    );
  }

  const availability = variant.properties.availability;
  assertExactOpenApiSet(
    availability.enum,
    Object.values(CAPABILITY_AVAILABILITY),
    "supported capability availability enum",
  );

  const eligibility = resolveOpenApiReference(variant.properties.eligibility);
  assert.ok(
    eligibility.required?.includes("eligible"),
    "capability eligibility must require eligible",
  );
  assert.equal(eligibility.properties.eligible.type, "boolean");
  assert.match(
    eligibility.properties.eligible.description,
    /requires availability `available` or `beta`/i,
  );

  const capabilityPath =
    "/v3/customers/{customerId}/capabilities/{capabilityId}";
  const { operationObject } = openApiOperation("post", capabilityPath);
  assert.match(operationObject.description, /known ineligible variants fail/i);

  const capabilityRequest = requestBodySchema("post", capabilityPath);
  const institutions = capabilityRequest.properties?.institutions;
  assert.equal(institutions?.type, "array");
  assert.equal(institutions.items?.type, "string");
  assert.match(institutions.items.description, /opaque public institution id/i);
  assert.match(
    institutions.description,
    /omitted or empty[\s\S]*registry defaults[\s\S]*non-empty[\s\S]*overrides defaults/i,
  );
  assert.match(
    institutions.description,
    /returned by `GET \/v3\/customers\/\{customerId\}\/capabilities\/supported`/,
  );

  return {
    availability: CAPABILITY_AVAILABILITY,
    eligibilityField: "eligibility.eligible",
  };
}

function assertCapabilitySelectionProse(text) {
  const facts = capabilitySelectionFacts();
  assert.match(
    text,
    new RegExp(
      `known variants[\\s\\S]{0,160}\`${facts.availability.disabled}\`[\\s\\S]{0,120}ineligible`,
      "i",
    ),
  );
  assert.match(
    text,
    new RegExp(
      `\`availability\`[\\s\\S]{0,80}\`${facts.availability.available}\`[\\s\\S]{0,40}\`${facts.availability.beta}\``,
      "i",
    ),
  );
  assert.match(
    text,
    new RegExp(
      `\`${escapeRegExp(facts.eligibilityField)}\`[\\s\\S]{0,60}\`true\``,
      "i",
    ),
  );
  assert.match(text, /known ineligible variant[\s\S]{0,40}fail/i);
  assert.match(
    text,
    /omitted or empty[\s\S]{0,100}registry defaults[\s\S]{0,100}non-empty[\s\S]{0,100}overrides defaults/i,
  );
  assert.match(
    text,
    /public institution ids[\s\S]{0,120}supported-capability response/i,
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

test("semantic link checks reject mismatched labels and swapped Card hrefs", () => {
  const expected = operation("post", "/v3/customers");
  const wrong = operation("post", "/v3/transfers");
  const mismatchedFixture = [
    `[\`POST /v3/customers\`](${wrong.href})`,
    `Unrelated href: ${expected.href}`,
  ].join("\n");

  assert.throws(
    () =>
      assertOperationLinksInText("mismatched fixture", mismatchedFixture, [
        ["post", "/v3/customers"],
      ]),
    /must bind `POST \/v3\/customers`/,
  );

  const swappedCardsFixture = [
    `<Card title="Create a customer" href="${wrong.href}">`,
    "  Customer details.",
    "</Card>",
    `<Card title="Create a transfer" href="${expected.href}">`,
    "  Transfer details.",
    "</Card>",
  ].join("\n");
  assert.throws(
    () =>
      assertCardOperationLinksInText("swapped Card fixture", swappedCardsFixture, [
        ["Create a customer", "post", "/v3/customers"],
        ["Create a transfer", "post", "/v3/transfers"],
      ]),
    /must bind the Create a customer Card to POST \/v3\/customers/,
  );
});

test("curl contract checks reject request-body and Content-Type drift", () => {
  const postWithoutBody = [
    "curl --request POST \\",
    '  "${API_BASE}/v3/customers" \\',
    '  --header "X-API-Key: ${SWIPELUX_SANDBOX_API_KEY}" \\',
    '  --header "Idempotency-Key: quickstart-${RUN_ID}-customer"',
  ].join("\n");
  assert.throws(
    () => assertCurlMatchesOpenApi(postWithoutBody, "POST without body fixture"),
    /POST \/v3\/customers requires exactly one request body/,
  );

  const getWithBody = [
    "curl --request GET \\",
    '  "${API_BASE}/v3/customers/${CUSTOMER_ID}/tasks" \\',
    '  --header "X-API-Key: ${SWIPELUX_SANDBOX_API_KEY}" \\',
    '  --header "Content-Type: application/json" \\',
    "  --data '{}'",
  ].join("\n");
  assert.throws(
    () => assertCurlMatchesOpenApi(getWithBody, "GET with body fixture"),
    /GET \/v3\/customers\/\{customerId\}\/tasks does not define a request body/,
  );

  const jsonWithoutContentType = [
    "curl --request POST \\",
    '  "${API_BASE}/v3/customers" \\',
    '  --header "X-API-Key: ${SWIPELUX_SANDBOX_API_KEY}" \\',
    '  --header "Idempotency-Key: quickstart-${RUN_ID}-customer" \\',
    "  --data '{\"type\":\"individual\"}'",
  ].join("\n");
  assert.throws(
    () =>
      assertCurlMatchesOpenApi(
        jsonWithoutContentType,
        "JSON without Content-Type fixture",
      ),
    /must include Content-Type exactly when sending a JSON body/,
  );
});

test("curl contract checks reject placeholders Bash would leave unresolved", () => {
  const fixtures = [
    {
      label: "single-quoted API key fixture",
      block: [
        "curl --request POST \\",
        '  "${API_BASE}/v3/customers" \\',
        "  --header 'X-API-Key: ${SWIPELUX_SANDBOX_API_KEY}' \\",
        '  --header "Idempotency-Key: quickstart-${RUN_ID}-customer" \\',
        '  --header "Content-Type: application/json" \\',
        "  --data '{\"type\":\"individual\"}'",
      ].join("\n"),
    },
    {
      label: "single-quoted idempotency key fixture",
      block: [
        "curl --request POST \\",
        '  "${API_BASE}/v3/customers" \\',
        '  --header "X-API-Key: ${SWIPELUX_SANDBOX_API_KEY}" \\',
        "  --header 'Idempotency-Key: quickstart-${RUN_ID}-customer' \\",
        '  --header "Content-Type: application/json" \\',
        "  --data '{\"type\":\"individual\"}'",
      ].join("\n"),
    },
    {
      label: "single-quoted URL data fixture",
      block: [
        ': "${WEBHOOK_URL:?Set WEBHOOK_URL}"',
        "curl --request POST \\",
        '  "${API_BASE}/v3/webhooks" \\',
        '  --header "X-API-Key: ${SWIPELUX_SANDBOX_API_KEY}" \\',
        '  --header "Idempotency-Key: quickstart-${RUN_ID}-webhook" \\',
        '  --header "Content-Type: application/json" \\',
        "  --data '{\"url\":\"${WEBHOOK_URL}\",\"events\":[\"transfer.state_changed\"]}'",
      ].join("\n"),
    },
    {
      label: "single-quoted path placeholder fixture",
      block: [
        "curl --request GET \\",
        "  '${API_BASE}/v3/customers/${CUSTOMER_ID}/tasks' \\",
        '  --header "X-API-Key: ${SWIPELUX_SANDBOX_API_KEY}"',
      ].join("\n"),
    },
  ];

  for (const { block, label } of fixtures) {
    assert.throws(
      () => assertCurlMatchesOpenApi(block, label),
      /unresolved shell placeholder/i,
      `${label} must fail executable Bash validation`,
    );
  }
});

test("OpenAPI set assertions ignore order and reject incomplete or duplicate values", () => {
  assert.doesNotThrow(() =>
    assertExactOpenApiSet(
      ["disabled", "available", "beta"],
      ["available", "beta", "disabled"],
      "availability fixture",
    ),
  );
  assert.throws(
    () =>
      assertExactOpenApiSet(
        ["available", "available", "beta", "disabled"],
        ["available", "beta", "disabled"],
        "duplicate fixture",
      ),
    /must not contain duplicates/i,
  );
  assert.throws(
    () =>
      assertExactOpenApiSet(
        ["available", "beta"],
        ["available", "beta", "disabled"],
        "incomplete fixture",
      ),
    /must contain exactly the expected values/i,
  );
});

test("overview maps the contract lifecycle and availability boundaries", () => {
  const text = readPage("integration/overview");
  assertCapabilitySelectionProse(text);

  assert.match(
    text,
    /customer[\s\S]*supported capabilities[\s\S]*requested capability[\s\S]*application[\s\S]*tasks[\s\S]*submissions[\s\S]*account[\s\S]*recipient[\s\S]*quote[\s\S]*transfer/i,
  );
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

test("quickstart follows the common lifecycle and preserves destination alternatives", () => {
  const text = readPage("integration/quickstart");
  assertCapabilitySelectionProse(text);
  const warningBlocks = [
    ...text.matchAll(/<Warning>\s*([\s\S]*?)<\/Warning>/g),
  ].map((match) => match[1]);
  const sandboxOnlyWarning = warningBlocks.find((warning) =>
    /sandbox-only/i.test(warning),
  );
  assert.ok(
    sandboxOnlyWarning,
    "quickstart must include a prominent sandbox-only Warning",
  );
  assert.match(sandboxOnlyWarning, /shared (?:hostname|base URL)/i);
  assert.match(
    sandboxOnlyWarning,
    /production key[\s\S]{0,120}(?:select|target)[\s\S]{0,80}production/i,
  );
  assert.match(
    text,
    /export SWIPELUX_SANDBOX_API_KEY='YOUR_SANDBOX_API_KEY'/,
  );
  assert.doesNotMatch(text, /export SWIPELUX_API_KEY=/);
  assert.match(text, /export RUN_ID="\$\(date \+%s\)-\$\{RANDOM\}"/);
  assert.match(
    text,
    /`WEBHOOK_URL`[\s\S]{0,180}HTTPS[\s\S]{0,120}(?:you own|you control)/i,
  );
  assert.doesNotMatch(text, /https?:\/\/example\.com/i);

  const commonLifecycle = [
    "POST /v3/webhooks",
    "POST /v3/customers",
    "GET /v3/customers/{customerId}/capabilities/supported",
    "POST /v3/customers/{customerId}/capabilities/{capabilityId}",
    "GET /v3/customers/{customerId}/tasks",
    "POST /v3/customers/{customerId}/tasks/{taskId}/submissions",
    "GET /v3/customers/{customerId}/capabilities/{capabilityId}",
  ];

  let previousIndex = -1;
  for (const endpoint of commonLifecycle) {
    const index = text.indexOf(endpoint);
    assert.ok(index > previousIndex, `${endpoint} must appear in sequence`);
    previousIndex = index;
  }

  const accountIndex = text.indexOf("POST /v3/customers/{customerId}/accounts");
  const recipientIndex = text.indexOf(
    "POST /v3/customers/{customerId}/recipients",
  );
  const destinationIndex = text.indexOf(
    "POST /v3/customers/{customerId}/recipients/{recipientId}/destinations",
  );
  const quoteIndex = text.indexOf("POST /v3/quotes");
  const transferIndex = text.indexOf("POST /v3/transfers");
  const transferReadIndex = text.indexOf("GET /v3/transfers/{transferId}");

  assert.ok(accountIndex > previousIndex, "account alternative follows readiness");
  assert.ok(recipientIndex > previousIndex, "recipient alternative follows readiness");
  assert.ok(destinationIndex > recipientIndex, "recipient destination follows recipient");
  assert.ok(quoteIndex > accountIndex, "quote follows the account alternative");
  assert.ok(
    quoteIndex > destinationIndex,
    "quote follows the recipient-destination alternative",
  );
  assert.ok(transferIndex > quoteIndex, "transfer follows quote");
  assert.ok(transferReadIndex > transferIndex, "transfer read follows transfer");
  assert.match(
    text,
    /account branch or the recipient-destination branch[\s\S]{0,160}does not prescribe one/i,
  );

  const curlBlocks = shellBlocks(text).filter((block) => /\bcurl\b/.test(block));
  assert.equal(
    curlBlocks.length,
    QUICKSTART_CURL_OPERATIONS.length,
    "quickstart must contain exactly the intended curl walkthrough",
  );
  const resolvedOperations = curlBlocks.map((block, index) =>
    assertCurlMatchesOpenApi(block, `quickstart curl block ${index + 1}`),
  );
  assert.deepEqual(
    resolvedOperations,
    QUICKSTART_CURL_OPERATIONS.map(([method, path]) => ({ method, path })),
    "quickstart curl operations must match the exact intended order without duplicates",
  );
  for (const block of curlBlocks) {
    assert.deepEqual(curlHeaderValues(block, "X-API-Key"), [
      "${SWIPELUX_SANDBOX_API_KEY}",
    ]);
  }

  const idempotencyValues = resolvedOperations.flatMap(
    ({ method, path }, index) => {
      if (idempotencyParameter(method, path)?.required !== true) return [];
      return curlHeaderValues(curlBlocks[index], "Idempotency-Key");
    },
  );
  for (const value of idempotencyValues) {
    assert.match(value, /\$\{RUN_ID\}/, `${value} must reference RUN_ID`);
  }
  assert.equal(
    new Set(idempotencyValues).size,
    idempotencyValues.length,
    "each required operation must use a unique RUN_ID-scoped idempotency value",
  );
  assert.doesNotMatch(curlBlocks.join("\n"), /Idempotency-Key:[^"\n]*-001\b/i);
  assert.match(
    text,
    /retrying one intended effect[\s\S]{0,120}same generated key and body/i,
  );
  assert.match(text, /new run[\s\S]{0,80}new `RUN_ID`/i);

  const webhookIndex = resolvedOperations.findIndex(
    ({ method, path }) => method === "post" && path === "/v3/webhooks",
  );
  assert.ok(webhookIndex >= 0, "quickstart must include webhook registration");
  const webhookBlock = curlBlocks[webhookIndex];
  assert.match(webhookBlock, /: "\$\{WEBHOOK_URL:\?[^}]+\}"/);
  assert.match(webhookBlock, /--data[^\n]*\$\{WEBHOOK_URL\}/);
  assert.doesNotMatch(webhookBlock, /"url"\s*:\s*"https?:\/\//);

  const sandboxHelperProbe = [
    "curl --request POST \\",
    '  "${API_BASE}/v3/sandbox/tasks/${TASK_ID}/review" \\',
    '  --header "X-API-Key: ${SWIPELUX_SANDBOX_API_KEY}" \\',
    '  --header "Content-Type: application/json" \\',
    "  --data '{\"outcome\":\"accepted\"}'",
  ].join("\n");
  assert.doesNotMatch(sandboxHelperProbe, /Idempotency-Key:/);
  assert.deepEqual(
    assertCurlMatchesOpenApi(sandboxHelperProbe, "sandbox helper probe"),
    { method: "post", path: "/v3/sandbox/tasks/{taskId}/review" },
  );

  assert.doesNotMatch(text, /requires an institution choice/i);

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
  assert.match(
    text,
    /public hosted demo[\s\S]{0,100}do not enter any API key[\s\S]{0,100}built-in demo data/i,
  );
  assert.match(text, /git clone https:\/\/github\.com\/swipelux\/neobank-starter/);
  assert.match(text, /local demo data/i);
  assert.match(text, /connected sandbox data/i);
  assert.match(
    text,
    /cloned starter[\s\S]{0,120}in-app connected-sandbox mode[\s\S]{0,120}sandbox key[\s\S]{0,120}browser runtime/i,
  );
  assert.match(
    text,
    /demo-only[\s\S]{0,100}outside[\s\S]{0,80}production credential architecture/i,
  );
  assert.match(text, /never use a production key[\s\S]{0,80}(?:mode|there)/i);
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
  const apiKeySchemes = Object.entries(openapi.components?.securitySchemes ?? {}).filter(
    ([, scheme]) => resolveOpenApiReference(scheme).type === "apiKey",
  );
  assert.equal(apiKeySchemes.length, 1, "OpenAPI must define one apiKey scheme");
  const [schemeName, unresolvedScheme] = apiKeySchemes[0];
  const scheme = resolveOpenApiReference(unresolvedScheme);
  assert.equal(schemeName, "apiKey");
  assert.equal(scheme.type, "apiKey");
  assert.equal(scheme.in, "header");
  assert.equal(scheme.name, "X-API-Key");

  assert.equal(openapi.servers.length, 1, "OpenAPI must define one public server");
  const [server] = openapi.servers;
  assert.equal(server.url, "https://platform.swipelux.com");
  assert.equal(
    server.description,
    "Production and sandbox; environment selected by API key",
  );

  assert.match(text, new RegExp(`\\b${escapeRegExp(schemeName)}\\b`));
  assert.match(text, new RegExp(escapeRegExp(scheme.name)));
  assert.match(text, new RegExp(escapeRegExp(server.url)));
  assert.match(text, /same base URL/i);
  assert.match(text, /production and sandbox/i);
  assert.match(text, /environment[\s\S]{0,100}selected[\s\S]{0,100}API key/i);
  assert.match(text, /in your integration/i);
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
  assertOperationLinks("integration/authentication", [
    ["get", "/v3/capabilities"],
  ]);
});

test("environments lists exactly the six contract sandbox helpers", () => {
  const text = readPage("integration/environments");

  assert.equal(
    SANDBOX_OPERATIONS.length,
    6,
    "OpenAPI must expose exactly six /v3/sandbox helper operations",
  );

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
    assert.match(
      text,
      new RegExp(escapeRegExp(openapi.paths[path][method].summary)),
    );
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

  assertCardOperationLinks("integration/using-the-api-reference", [
    ["Create a customer", "post", "/v3/customers"],
    [
      "Read supported capabilities",
      "get",
      "/v3/customers/{customerId}/capabilities/supported",
    ],
    ["Create a transfer", "post", "/v3/transfers"],
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

  assertCardOperationLinks("integration/request-safety", [
    ["Create a quote", "post", "/v3/quotes"],
    ["Create a transfer", "post", "/v3/transfers"],
  ]);
});

test("errors documents the shared Problem contract and safe diagnostics", () => {
  const text = readPage("integration/errors");
  const problem = resolveOpenApiReference(openapi.components?.schemas?.Problem);
  assert.ok(problem, "OpenAPI must define components.schemas.Problem");
  assertExactOpenApiSet(
    problem.required,
    ["type", "title", "status", "code", "detail", "correlationId"],
    "Problem required fields",
  );

  const fieldErrors = resolveOpenApiReference(problem.properties?.errors);
  assert.equal(fieldErrors.type, "array");
  const fieldError = resolveOpenApiReference(fieldErrors.items);
  assertExactOpenApiSet(
    fieldError.required,
    ["pointer", "code", "message"],
    "Problem field error required fields",
  );

  assert.match(
    problem.properties.correlationId.description,
    /mirrors `X-Request-Id`/i,
  );
  assert.equal(problem.properties.retryable.type, "boolean");
  assert.equal(problem.properties.statusReason.type, "object");

  for (const field of problem.required) {
    assert.match(text, new RegExp(`\\b${field}\\b`), `missing ${field}`);
  }
  for (const field of fieldError.required) {
    assert.match(text, new RegExp(`\\b${field}\\b`), `missing field error ${field}`);
  }
  assert.match(text, /X-Request-Id/);
  assert.match(text, /correlationId[\s\S]{0,100}mirrors[\s\S]{0,100}X-Request-Id/i);
  assert.match(text, /retryable/);
  assert.match(text, /statusReason/);
  assert.match(text, /PII/);
  assert.match(text, /```json\n[\s\S]*"correlationId"[\s\S]*```/);

  assertCardOperationLinks("integration/errors", [
    ["Customer problems", "post", "/v3/customers"],
    ["Transfer problems", "post", "/v3/transfers"],
  ]);
});

test("pagination scopes ordering and explains cursor recovery", () => {
  const text = readPage("integration/pagination-and-sync");
  const page = responseSchema("get", "/v3/customers");
  assertExactOpenApiSet(
    page.required,
    ["data", "nextCursor", "hasMore"],
    "Page required fields",
  );
  assert.equal(page.properties.data.type, "array");
  assert.equal(page.properties.nextCursor.type, "string");
  assert.equal(page.properties.nextCursor.nullable, true);
  assert.equal(page.properties.hasMore.type, "boolean");

  const customerParameters = operationParameters("get", "/v3/customers");
  const cursor = customerParameters.find((parameter) => parameter.name === "cursor");
  assert.ok(cursor, "GET /v3/customers must declare cursor");
  assert.equal(cursor.in, "query");
  assert.equal(cursor.schema.type, "string");

  const updatedAfter = customerParameters.find(
    (parameter) => parameter.name === "updatedAfter",
  );
  assert.ok(updatedAfter, "GET /v3/customers must declare updatedAfter");
  assert.equal(updatedAfter.in, "query");
  assert.equal(updatedAfter.required, false);
  assert.equal(updatedAfter.schema.format, "date-time");
  assert.match(updatedAfter.description, /at or after[\s\S]*RFC 3339/i);
  assert.match(updatedAfter.description, /missed webhooks/i);

  const { operationObject: listCustomers } = openApiOperation(
    "get",
    "/v3/customers",
  );
  assert.match(
    listCustomers.description,
    /deterministic createdAt DESC, id DESC order/,
  );

  assert.match(text, /paginated list operations[\s\S]{0,80}cursor envelope/i);
  assert.doesNotMatch(text, /^List operations use\b/im);
  for (const field of page.required) {
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

  const javascriptBlocks = [
    ...text.matchAll(/```js\n([\s\S]*?)```/g),
  ].map((match) => match[1]);
  const paginationExample = javascriptBlocks.find((block) => /fetch\(/.test(block));
  assert.ok(paginationExample, "pagination page must include a fetch example");
  const responseCheckIndex = paginationExample.indexOf("if (!response.ok)");
  const pageParseIndex = paginationExample.indexOf("const page");
  assert.ok(responseCheckIndex >= 0, "pagination example must check response.ok");
  assert.ok(
    pageParseIndex > responseCheckIndex,
    "pagination example must check response.ok before treating JSON as a page",
  );
  assert.match(
    paginationExample,
    /if \(!response\.ok\) \{[\s\S]*const problem = await response\.json\(\);[\s\S]*throw new Error\(`\$\{problem\.code\}: \$\{problem\.detail\}`\);[\s\S]*\}/,
  );
  assert.doesNotMatch(paginationExample, /console\.(?:log|error|warn)/);

  assertOperationLinks("integration/pagination-and-sync", [
    ["get", "/v3/customers"],
  ]);
});
