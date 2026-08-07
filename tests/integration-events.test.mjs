import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { collectNavigationPages } from "../scripts/lib/docs-validation.mjs";
import {
  assertFrontmatter,
  assertNoBannedText,
  readPage,
} from "./helpers/content.mjs";
import { createOpenApiValidator } from "./helpers/openapi-validation.mjs";

const PAGES = [
  "api-reference/introduction",
  "integration/webhooks",
  "integration/sandbox",
  "integration/go-live",
];

const SANDBOX_GUIDE_OPERATIONS = [
  ["post", "/v3/sandbox/accounts/{accountId}/topup"],
  [
    "post",
    "/v3/sandbox/customers/{customerId}/capabilities/{capabilityId}/status",
  ],
  ["post", "/v3/sandbox/tasks"],
  ["post", "/v3/sandbox/tasks/{taskId}/review"],
  ["post", "/v3/sandbox/transfers/{transferId}/state"],
];

const PATH_VARIABLES = new Map([
  ["CUSTOMER_ID", "customerId"],
  ["CAPABILITY_ID", "capabilityId"],
  ["TASK_ID", "taskId"],
  ["ACCOUNT_ID", "accountId"],
  ["TRANSFER_ID", "transferId"],
]);

const BODY_VARIABLES = Object.freeze({
  CUSTOMER_ID: "cus_01JTESTCUSTOMER",
  CAPABILITY_ID: "ach_pooled",
  REQUIREMENT_ID: "req_01JTESTREQUIREMENT",
  TASK_REVISION: 1,
});

const config = JSON.parse(readFileSync("docs.json", "utf8"));
const openapi = JSON.parse(readFileSync("openapi.json", "utf8"));
const validator = createOpenApiValidator(openapi);

function requiredPage(page) {
  const text = readPage(page);
  assertFrontmatter(page, text);
  assertNoBannedText(page, text);
  return text;
}

function operation(method, path) {
  const value = openapi.paths?.[path]?.[method];
  assert.ok(value, `Missing ${method.toUpperCase()} ${path}`);
  return value;
}

function operationHref(method, path) {
  const href = operation(method, path)["x-mint"]?.href;
  assert.ok(href, `Missing generated href for ${method.toUpperCase()} ${path}`);
  return href;
}

function operationLinks(text) {
  return [
    ...text.matchAll(
      /\[`(GET|POST|PUT|PATCH|DELETE) (\/v3\/[^`]+)`\]\((\/api-reference\/[^)]+)\)/g,
    ),
  ].map((match) => ({
    method: match[1].toLowerCase(),
    path: match[2],
    href: match[3],
  }));
}

function bashBlocks(text) {
  return [...text.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1]);
}

function normalizePath(url) {
  let path = url
    .replace(/^https:\/\/platform\.swipelux\.com/, "")
    .replace(/^\$\{API_BASE\}/, "");
  for (const [variable, parameter] of PATH_VARIABLES) {
    path = path.replaceAll(`\${${variable}}`, `{${parameter}}`);
  }
  return path;
}

function parseBody(block) {
  const heredoc = block.match(/--data\s+@-\s+<<'?JSON'?\n([\s\S]*?)\n\s*JSON(?:\n|$)/);
  if (heredoc) {
    return JSON.parse(
      heredoc[1].replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (value, name) =>
        typeof BODY_VARIABLES[name] === "number"
          ? String(BODY_VARIABLES[name])
          : value,
      ),
    );
  }
  const quoted = block.match(/--data\s+'([^']*)'/);
  return quoted ? JSON.parse(quoted[1]) : undefined;
}

function curlExamples(text) {
  return bashBlocks(text)
    .filter((block) => /(^|\n)\s*curl\s/.test(block))
    .map((block) => {
      const method = block.match(/--request\s+([A-Z]+)/i)?.[1]?.toLowerCase();
      const url = block.match(
        /["']((?:https:\/\/platform\.swipelux\.com|\$\{API_BASE\})\/v3\/[^"']+)["']/,
      )?.[1];
      assert.ok(method && url, "Every curl example must declare a method and API URL");
      return {
        method,
        path: normalizePath(url),
        headers: [...block.matchAll(/--header\s+["']([^"']+)["']/g)].map(
          (match) => match[1],
        ),
        body: parseBody(block),
      };
    });
}

function headerValues(example, name) {
  return example.headers
    .filter((header) => header.startsWith(`${name}:`))
    .map((header) => header.slice(name.length + 1).trim());
}

function materialize(value) {
  if (Array.isArray(value)) return value.map(materialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, materialize(item)]),
    );
  }
  if (typeof value === "string") {
    const name = /^\$\{([A-Z_][A-Z0-9_]*)\}$/.exec(value)?.[1];
    if (name && Object.hasOwn(BODY_VARIABLES, name)) return BODY_VARIABLES[name];
  }
  return value;
}

function assertCurlMatchesOpenApi(example) {
  operation(example.method, example.path);
  assert.equal(headerValues(example, "X-API-Key").length, 1);

  const requiredHeaders = validator.requiredParameterNames(
    example.method,
    example.path,
    "header",
  );
  for (const name of requiredHeaders) {
    const values = headerValues(example, name);
    assert.equal(values.length, 1, `${example.method} ${example.path} needs ${name}`);
    const result = validator.validateParameter(
      example.method,
      example.path,
      "header",
      name,
      values[0],
    );
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  }

  const requestBody = operation(example.method, example.path).requestBody;
  if (!requestBody) {
    assert.equal(example.body, undefined);
    return;
  }
  assert.notEqual(example.body, undefined);
  const result = validator.validateRequestBody(
    example.method,
    example.path,
    materialize(example.body),
  );
  assert.equal(result.valid, true, JSON.stringify(result.errors));
}

function operationKey([method, path]) {
  return `${method} ${path}`;
}

test("publishes the operational pages once", () => {
  const navigation = collectNavigationPages(config.navigation);
  for (const page of PAGES) {
    requiredPage(page);
    assert.equal(navigation.filter((candidate) => candidate === page).length, 1);
  }
});

test("API Reference introduction owns write and problem conventions", () => {
  const text = requiredPage("api-reference/introduction");
  for (const value of [
    "Idempotency-Key",
    "Idempotency-Replayed",
    "application/problem+json",
    "errors[].pointer",
    "X-Request-Id",
    "correlationId",
  ]) {
    assert.ok(text.includes(value), `Missing ${value}`);
  }
  assert.match(text, /^## Make writes safe to retry$/m);
  assert.match(text, /^## Handle errors$/m);
  assert.match(text, /retry the identical method, path, and body with the same key/i);
  assert.match(text, /Do not reuse that key for a different operation or changed body/i);

  const links = operationLinks(text);
  assert.deepEqual(links, [
    {
      method: "post",
      path: "/v3/customers",
      href: operationHref("post", "/v3/customers"),
    },
  ]);
  const examples = curlExamples(text);
  assert.equal(examples.length, 1);
  assertCurlMatchesOpenApi(examples[0]);
});

test("webhooks verify, persist, acknowledge, and refetch safely", () => {
  const text = requiredPage("integration/webhooks");
  const headings = [
    "Register only the events you need",
    "Verify before parsing",
    "Persist, acknowledge, then process",
    "Refetch current state",
    "Recover deliveries",
  ];
  const positions = headings.map((heading) => text.indexOf(`## ${heading}`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, positions.toSorted((left, right) => left - right));

  const examples = curlExamples(text);
  assert.deepEqual(
    examples.map(({ method, path }) => `${method} ${path}`),
    ["post /v3/webhooks", "get /v3/transfers/{transferId}"],
  );
  examples.forEach(assertCurlMatchesOpenApi);
  const eventHref =
    openapi.webhooks["transfer.state_changed"].post["x-mint"].href;
  assert.ok(text.includes("[`transfer.state_changed`](" + eventHref + ")"));

  for (const header of ["svix-id", "svix-timestamp", "svix-signature"]) {
    assert.ok(text.includes(header));
  }
  const rawBody = text.indexOf("const rawBody = await request.text()");
  const verify = text.indexOf("verifier.verify(rawBody");
  const persist = text.indexOf("webhookInbox.insertIfAbsent");
  const response = text.indexOf("status: 204");
  assert.ok(rawBody >= 0 && rawBody < verify && verify < persist && persist < response);

  assert.match(text, /Delivery is at least once/i);
  assert.match(text, /duplicate, delayed, and out of order/i);
  assert.match(text, /uniqueness constraint on the envelope `id`/i);
  assert.match(text, /return `2xx` promptly[\s\S]{0,100}process it asynchronously/i);
  assert.match(text, /Do not use the envelope `attempt` field as a deduplication key/i);
  assert.match(text, /fetch its current state before updating your system/i);
  assert.match(text, /delivery logs[\s\S]{0,100}retry failed deliveries[\s\S]{0,100}manual replay/i);
  assert.doesNotMatch(text, /api\.deprecation|transfer\.created|contact Swipelux/i);
  assert.doesNotMatch(text, /exactly[- ]once|strictly ordered|retry after \d+/i);
});

test("sandbox documents the five current API v3 controls", () => {
  const text = requiredPage("integration/sandbox");
  const linked = operationLinks(text)
    .filter(({ path }) => path.startsWith("/v3/sandbox/"))
    .map(({ method, path }) => `${method} ${path}`)
    .toSorted();
  assert.deepEqual(linked, SANDBOX_GUIDE_OPERATIONS.map(operationKey).toSorted());

  const examples = curlExamples(text);
  examples.forEach(assertCurlMatchesOpenApi);
  const sandboxExamples = examples
    .filter(({ path }) => path.startsWith("/v3/sandbox/"))
    .map(({ method, path }) => `${method} ${path}`);
  assert.deepEqual(
    [...new Set(sandboxExamples)].toSorted(),
    SANDBOX_GUIDE_OPERATIONS.map(operationKey).toSorted(),
  );

  const create = text.indexOf("`POST /v3/sandbox/tasks`");
  const submit = text.indexOf(
    "`POST /v3/customers/{customerId}/tasks/{taskId}/submissions`",
  );
  const review = text.indexOf("`POST /v3/sandbox/tasks/{taskId}/review`");
  assert.ok(create >= 0 && create < submit && submit < review);
  assert.match(text, /Keep the key on your backend/i);
  assert.match(text, /without moving real funds/i);
  assert.match(text, /do not replace production compliance or onboarding/i);
  assert.doesNotMatch(
    text,
    /\/v3\/sandbox\/customers\/\{customerId\}\/verification/,
  );
});

test("Go live separates business activation from API customer onboarding", () => {
  const text = requiredPage("integration/go-live");
  assert.match(text, /integrating business[\s\S]{0,120}separate from the API customers/i);
  assert.match(text, /Create a production space/);
  assert.match(text, /KYB tab/i);
  assert.match(text, /https:\/\/www\.swipelux\.app\/kyb/);
  assert.match(text, /Only after[\s\S]{0,140}approved[\s\S]{0,140}create production API customers and transactions/i);
  for (const value of [
    "production credentials",
    "deployment configuration",
    "resource IDs",
    "production webhook endpoint",
  ]) {
    assert.match(text, new RegExp(value, "i"));
  }
  assert.match(text, /known customer and one low-value transaction/i);
  assert.match(text, /Expected result/);
  assert.match(text, /Owner/);
  assert.match(text, /Stop condition/);
  assert.match(text, /increase volume gradually/i);
  assert.doesNotMatch(
    text,
    /\/integration\/(?:api-reliability|sync-and-reconciliation|production-readiness|starter-kit|rules)/,
  );
});

test("retired operational pages stay removed", () => {
  for (const path of [
    "integration/api-reliability.mdx",
    "integration/sync-and-reconciliation.mdx",
    "integration/production-readiness.mdx",
    "integration/rules.mdx",
    "integration/starter-kit.mdx",
  ]) {
    assert.equal(existsSync(path), false, `${path} must remain retired`);
  }
});
