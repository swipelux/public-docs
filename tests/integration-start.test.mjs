import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import { assertPages, readPage } from "./helpers/content.mjs";

const PAGES = [
  "integration/overview",
  "integration/quickstart",
  "integration/authentication",
  "integration/sandbox",
];

const PATH_VARIABLES = new Map([
  ["CUSTOMER_ID", "customerId"],
  ["CAPABILITY_ID", "capabilityId"],
  ["TASK_ID", "taskId"],
  ["ACCOUNT_ID", "accountId"],
  ["SOURCE_WALLET_ID", "accountId"],
  ["SETTLEMENT_WALLET_ID", "accountId"],
  ["BANK_ACCOUNT_ID", "accountId"],
  ["RECIPIENT_ID", "recipientId"],
  ["TRANSFER_ID", "transferId"],
]);

const BODY_VARIABLES = Object.freeze({
  CUSTOMER_ID: "cus_01JTESTCUSTOMER",
  CAPABILITY_ID: "ach_pooled",
  ACCOUNT_ID: "acc_01JTESTACCOUNT",
  SOURCE_WALLET_ID: "acc_01JTESTSOURCE",
  SETTLEMENT_WALLET_ID: "acc_01JTESTSETTLEMENT",
  BANK_ACCOUNT_ID: "acc_01JTESTBANK",
  RECIPIENT_ID: "rcp_01JTESTRECIPIENT",
  DESTINATION_ID: "dst_01JTESTDESTINATION",
  QUOTE_ID: "quo_01JTESTQUOTE",
  TRANSFER_ID: "tr_01JTESTTRANSFER",
});

const config = JSON.parse(readFileSync("docs.json", "utf8"));
const coverage = JSON.parse(readFileSync("openapi-coverage.json", "utf8"));
const openapi = JSON.parse(readFileSync("openapi.json", "utf8"));

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

function apiKeySecurity(method, path) {
  const { operation } = openApiOperation(method, path);
  const security = operation.security ?? openapi.security ?? [];
  return security.some((requirement) => Object.hasOwn(requirement, "apiKey"));
}

function coverageOperation(method, path) {
  const matches = coverage.operations.filter(
    (candidate) => candidate.method === method && candidate.path === path,
  );
  assert.equal(
    matches.length,
    1,
    `Expected one coverage entry for ${method.toUpperCase()} ${path}`,
  );
  return matches[0];
}

function operationLinks(text) {
  return [...text.matchAll(/\[`([A-Z]+) ([^`]+)`\]\((\/api-reference\/[^)]+)\)/g)].map(
    (match) => ({
      method: match[1].toLowerCase(),
      path: match[2],
      href: match[3],
    }),
  );
}

function assertOperationLinksMatchOpenApi(page, text) {
  const links = operationLinks(text);
  assert.ok(links.length > 0, `${page}.mdx must link at least one API operation`);

  for (const { method, path, href } of links) {
    openApiOperation(method, path);
    assert.equal(
      coverageOperation(method, path).href,
      href,
      `${page}.mdx must bind ${method.toUpperCase()} ${path} to its generated href`,
    );
    assert.equal(
      apiKeySecurity(method, path),
      true,
      `${method.toUpperCase()} ${path} must use OpenAPI apiKey security`,
    );
  }

  for (const match of text.matchAll(/\[[^\]]+\]\((\/api-reference\/[^)]+)\)/g)) {
    const href = match[1];
    const linked = links.some((candidate) => candidate.href === href);
    assert.ok(linked, `${page}.mdx must label operation link ${href} with method and path`);
  }
}

function markdownHeadingIndex(text, heading) {
  const index = text.indexOf(`## ${heading}`);
  assert.notEqual(index, -1, `Missing section: ${heading}`);
  return index;
}

function assertHeadingOrder(text, headings) {
  const indexes = headings.map((heading) => markdownHeadingIndex(text, heading));
  assert.deepEqual(indexes, indexes.toSorted((left, right) => left - right));
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

function parseJsonBody(block) {
  const heredoc = block.match(/--data\s+@-\s+<<'?JSON'?\n([\s\S]*?)\n\s*JSON(?:\n|$)/);
  if (heredoc) return JSON.parse(heredoc[1]);

  const quoted = block.match(/--data\s+'([^']*)'/);
  if (quoted) return JSON.parse(quoted[1]);

  return undefined;
}

function parseCurl(block, label) {
  const methodMatch = block.match(/--request\s+([A-Z]+)/i);
  assert.ok(methodMatch, `${label} must declare an HTTP method`);

  const urlMatch = block.match(
    /["']((?:https:\/\/platform\.swipelux\.com|\$\{API_BASE\})\/v3\/[^"']+)["']/,
  );
  assert.ok(urlMatch, `${label} must use the shared base URL or API_BASE`);

  const headers = [...block.matchAll(/--header\s+["']([^"']+)["']/g)].map(
    (match) => match[1],
  );
  const forms = [...block.matchAll(/--form\s+["']([^"']+)["']/g)].map(
    (match) => match[1],
  );

  return {
    method: methodMatch[1].toLowerCase(),
    path: normalizePath(urlMatch[1]),
    headers,
    forms,
    body: parseJsonBody(block),
    source: block,
  };
}

function headerValues(example, name) {
  return example.headers
    .filter((header) => header.slice(0, header.indexOf(":")) === name)
    .map((header) => header.slice(header.indexOf(":") + 1).trim());
}

function schemaErrors(value, rawSchema, pointer = "$") {
  const schema = resolveReference(rawSchema);
  const errors = [];

  if (schema?.nullable === true && value === null) return errors;

  if (schema?.allOf) {
    return schema.allOf.flatMap((variant) => schemaErrors(value, variant, pointer));
  }

  if (schema?.oneOf || schema?.anyOf) {
    const variants = schema.oneOf ?? schema.anyOf;
    const passing = variants.filter(
      (variant) => schemaErrors(value, variant, pointer).length === 0,
    );
    if (passing.length === 0) errors.push(`${pointer} does not match any schema variant`);
    return errors;
  }

  if (schema?.enum && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    errors.push(`${pointer} is not in the OpenAPI enum`);
  }
  if (schema?.const !== undefined && !Object.is(schema.const, value)) {
    errors.push(`${pointer} does not match the OpenAPI const`);
  }

  const type = schema?.type ?? (schema?.properties ? "object" : undefined);
  if (type === "object") {
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      return [...errors, `${pointer} must be an object`];
    }
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) errors.push(`${pointer}.${required} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties ?? {}, key)) {
          errors.push(`${pointer}.${key} is not allowed`);
        }
      }
    }
    for (const [key, item] of Object.entries(value)) {
      const property = schema.properties?.[key];
      if (property) errors.push(...schemaErrors(item, property, `${pointer}.${key}`));
    }
  } else if (type === "array") {
    if (!Array.isArray(value)) return [...errors, `${pointer} must be an array`];
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${pointer} has fewer than ${schema.minItems} items`);
    }
    value.forEach((item, index) => {
      if (schema.items) errors.push(...schemaErrors(item, schema.items, `${pointer}[${index}]`));
    });
  } else if (type === "string") {
    if (typeof value !== "string") return [...errors, `${pointer} must be a string`];
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${pointer} is shorter than ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${pointer} does not match ${schema.pattern}`);
    }
  } else if (type === "integer") {
    if (!Number.isInteger(value)) errors.push(`${pointer} must be an integer`);
  } else if (type === "number") {
    if (typeof value !== "number") errors.push(`${pointer} must be a number`);
  } else if (type === "boolean") {
    if (typeof value !== "boolean") errors.push(`${pointer} must be a boolean`);
  }

  return errors;
}

function materializeBody(value) {
  if (Array.isArray(value)) return value.map(materializeBody);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, materializeBody(item)]),
    );
  }
  if (typeof value === "string") {
    const match = value.match(/^\$\{([A-Z_][A-Z0-9_]*)\}$/);
    if (match && Object.hasOwn(BODY_VARIABLES, match[1])) {
      return BODY_VARIABLES[match[1]];
    }
  }
  return value;
}

function assertCurlMatchesOpenApi(example, label) {
  const { method, path } = example;
  openApiOperation(method, path);

  assert.equal(headerValues(example, "X-API-Key").length, 1, `${label} needs X-API-Key`);
  assert.match(
    headerValues(example, "X-API-Key")[0],
    /^\$\{SWIPELUX_(?:SANDBOX_)?API_KEY\}$/,
    `${label} must use an environment variable for X-API-Key`,
  );

  const idempotency = operationParameters(method, path).find(
    (parameter) => parameter.in === "header" && parameter.name === "Idempotency-Key",
  );
  assert.equal(
    headerValues(example, "Idempotency-Key").length,
    idempotency?.required === true ? 1 : 0,
    `${label} must follow the operation's Idempotency-Key requirement`,
  );

  const body = requestBody(method, path);
  if (!body) {
    assert.equal(example.body, undefined, `${label} must not send a JSON body`);
    assert.deepEqual(example.forms, [], `${label} must not send multipart fields`);
    return;
  }

  const json = body.content?.["application/json"];
  const multipart = body.content?.["multipart/form-data"];
  if (json) {
    assert.notEqual(example.body, undefined, `${label} must send a JSON body`);
    assert.equal(
      headerValues(example, "Content-Type")[0],
      "application/json",
      `${label} must send JSON as application/json`,
    );
    assert.deepEqual(
      schemaErrors(materializeBody(example.body), json.schema),
      [],
      `${label} request body must match OpenAPI`,
    );
  } else if (multipart) {
    const schema = resolveReference(multipart.schema);
    const fieldNames = example.forms.map((form) => form.slice(0, form.indexOf("=")));
    for (const required of schema.required ?? []) {
      assert.ok(fieldNames.includes(required), `${label} requires multipart field ${required}`);
    }
  } else {
    assert.fail(`${label} uses an unsupported request media type`);
  }
}

function curlExamples(page, text) {
  return bashBlocks(text)
    .filter((block) => /(^|\n)\s*curl\s/.test(block))
    .map((block, index) => parseCurl(block, `${page}.mdx curl ${index + 1}`));
}

function examplesFor(examples, method, path) {
  return examples.filter((example) => example.method === method && example.path === path);
}

function containsBody(examples, expected) {
  return examples.some(({ body }) => isDeepStrictEqual(body, expected));
}

function card(text, title, href) {
  return new RegExp(
    `<Card\\b(?=[^>]*\\btitle=["']${title}["'])(?=[^>]*\\bhref=["']${href}["'])[^>]*>`,
  ).test(text);
}

test("publishes the four Get started pages in the intended order", () => {
  assertPages(PAGES);
  const integration = config.navigation.tabs.find((tab) => tab.tab === "Integration Docs");
  assert.ok(integration, "Missing Integration Docs tab");
  const getStarted = integration.groups.find((group) => group.group === "Get started");
  assert.deepEqual(getStarted?.pages, PAGES);
});

test("every linked operation and representative curl remains OpenAPI-backed", () => {
  const apiKey = openapi.components.securitySchemes.apiKey;
  assert.deepEqual(
    { type: apiKey.type, in: apiKey.in, name: apiKey.name },
    { type: "apiKey", in: "header", name: "X-API-Key" },
  );

  for (const page of PAGES) {
    const text = readPage(page);
    assertOperationLinksMatchOpenApi(page, text);
    for (const [index, example] of curlExamples(page, text).entries()) {
      assertCurlMatchesOpenApi(example, `${page}.mdx curl ${index + 1}`);
    }
  }
});

test("overview leads with outcomes, the shared lifecycle, and core resources", () => {
  const text = readPage("integration/overview");
  const opening = text.slice(text.indexOf("---", 3) + 3, text.indexOf("## "));
  assert.match(opening, /customer onboarding, pay-ins, payouts, and issued bank accounts through one API/i);

  assertHeadingOrder(text, ["What you can build", "How an integration works", "Core resources", "Start building"]);
  for (const [title, href] of [
    ["Pay-ins", "/integration/receive-funds"],
    ["Payouts", "/integration/send-funds"],
    ["Bank accounts", "/integration/issue-bank-account"],
    ["Quickstart", "/integration/quickstart"],
    ["Authentication", "/integration/authentication"],
    ["Common flows", "/integration/common-flows"],
  ]) {
    assert.equal(card(text, title, href), true, `Missing ${title} card`);
  }

  const lifecycle = [
    "Create a customer",
    "Choose the intended outcome",
    "Request an eligible capability",
    "Complete current requirements",
    "Create the account or destination",
    "Quote, execute, and monitor",
  ];
  const indexes = lifecycle.map((step) => text.indexOf(step));
  assert.ok(indexes.every((index) => index >= 0), "Overview is missing a lifecycle step");
  assert.deepEqual(indexes, indexes.toSorted((left, right) => left - right));

  for (const resource of ["customer", "capability", "account", "recipient", "destination", "quote", "transfer"]) {
    assert.match(text, new RegExp(`\\*\\*${resource}\\.\\*\\*`, "i"));
  }
  assert.doesNotMatch(text, /provider orchestration|source precedence|contract provenance/i);
});

test("authentication shows one backend API-key flow and preserves the environment anchor", () => {
  const text = readPage("integration/authentication");
  assertHeadingOrder(text, [
    "Send your API key",
    "Make your first request",
    "Sandbox and production",
    "Store credentials safely",
  ]);
  assert.match(text, /https:\/\/platform\.swipelux\.com/);
  assert.match(text, /`X-API-Key`/);
  assert.match(text, /\$\{SWIPELUX_API_KEY\}/);
  assert.match(text, /API key selects (?:sandbox or production|the environment)/i);
  assert.match(text, /backend|server-side/i);
  assert.match(text, /separate secret-manager entries/i);
  assert.doesNotMatch(text, /YOUR_API_KEY/);

  const examples = curlExamples("integration/authentication", text);
  assert.equal(examples.length, 1);
  assert.equal(examples[0].method, "get");
  assert.equal(examples[0].path, "/v3/capabilities");
});

test("quickstart follows the customer-first shared setup before outcome branches", () => {
  const text = readPage("integration/quickstart");
  assertHeadingOrder(text, [
    "1. Configure sandbox",
    "2. Create a customer",
    "3. Choose the outcome",
    "4. Find an eligible capability",
    "5. Request the capability",
    "6. Complete onboarding in sandbox",
    "7. Build the selected flow",
  ]);

  const customer = text.indexOf("`POST /v3/customers`");
  const supported = text.indexOf("`GET /v3/customers/{customerId}/capabilities/supported`");
  const request = text.indexOf("`POST /v3/customers/{customerId}/capabilities/{capabilityId}`");
  assert.ok(customer >= 0 && customer < supported && supported < request);
  assert.ok(markdownHeadingIndex(text, "3. Choose the outcome") < supported);

  for (const value of ["pay-in", "payout", "issued bank account"]) {
    assert.match(text, new RegExp(value, "i"));
  }
  for (const field of ["`directions`", "`method`", "`accountType`", "`availability`", "`eligibility.eligible`", "`institutions`", "`destinationId`"]) {
    assert.ok(text.includes(field), `Quickstart must explain ${field}`);
  }
  assert.match(text, /hardcod(?:e|ing)[^.]*universal capability ID|response-derived capability/i);
  assert.doesNotMatch(text, /@(?:account|recipient|destination|quote|task-submission)\.json/);

  const firstWebhook = text.search(/\/integration\/webhooks|\/v3\/webhooks/);
  const firstTransfer = text.indexOf("`POST /v3/transfers`");
  assert.ok(firstTransfer >= 0 && (firstWebhook === -1 || firstWebhook > firstTransfer));

  for (const [title, href] of [
    ["Pay-in", "/integration/receive-funds"],
    ["Payout", "/integration/send-funds"],
    ["Issued bank account", "/integration/issue-bank-account"],
  ]) {
    assert.equal(card(text, title, href), true, `Missing ${title} next-step card`);
  }
  assert.match(text, /\/integration\/webhooks/);
  assert.match(text, /\/api-reference/);
});

test("quickstart includes complete contract-valid bodies and stores response-derived values", () => {
  const text = readPage("integration/quickstart");
  const examples = curlExamples("integration/quickstart", text);

  assert.equal(
    containsBody(examplesFor(examples, "post", "/v3/customers"), {
      type: "individual",
      externalId: "quickstart-customer-001",
    }),
    true,
  );
  assert.equal(
    containsBody(
      examplesFor(examples, "post", "/v3/customers/{customerId}/capabilities/{capabilityId}"),
      {},
    ),
    true,
  );
  assert.equal(
    containsBody(
      examplesFor(
        examples,
        "post",
        "/v3/sandbox/customers/{customerId}/capabilities/{capabilityId}/status",
      ),
      { status: "ready" },
    ),
    true,
  );

  const accounts = examplesFor(examples, "post", "/v3/customers/{customerId}/accounts");
  assert.ok(
    accounts.some(
      ({ body }) => body?.origin === "issued" && body.type === "wallet" && body.currency === "USDC" && body.network === "base",
    ),
    "Quickstart needs an issued USDC/Base wallet body",
  );
  assert.ok(
    accounts.some(
      ({ body }) => body?.origin === "external" && body.type === "bank" && body.currency === "USD",
    ),
    "Payout branch needs a customer-owned bank account body",
  );
  assert.ok(
    accounts.some(
      ({ body }) => body?.origin === "issued" && body.type === "bank" && body.method === "ach" && body.currency === "USD" && body.settlement?.accountId,
    ),
    "Issued-bank-account branch needs an ACH/USD body with settlement account",
  );

  const quotes = examplesFor(examples, "post", "/v3/quotes");
  assert.ok(quotes.some(({ body }) => body?.in?.currency === "USD" && body?.out?.currency === "USDC"));
  assert.ok(quotes.some(({ body }) => body?.in?.currency === "USDC" && body?.out?.currency === "USD"));
  assert.ok(examplesFor(examples, "post", "/v3/transfers").length >= 2);
  assert.ok(examplesFor(examples, "get", "/v3/transfers/{transferId}/instructions").length >= 1);
  assert.ok(examplesFor(examples, "get", "/v3/customers/{customerId}/accounts/{accountId}").length >= 1);

  for (const name of [
    "CUSTOMER_ID",
    "CAPABILITY_ID",
    "CAPABILITY_STATUS",
    "TASK_IDS",
    "SOURCE_WALLET_ID",
    "ACCOUNT_ID",
    "RECIPIENT_ID",
    "DESTINATION_ID",
    "QUOTE_ID",
    "TRANSFER_ID",
    "FUNDING_INSTRUCTIONS",
    "BANK_ACCOUNT_STATUS",
    "BANK_ACCOUNT_DETAILS",
  ]) {
    assert.match(text, new RegExp(`\\b${name}\\b`), `Quickstart must name ${name}`);
  }
  assert.match(text, /test control[^.]*not production onboarding|not production onboarding[^.]*test control/i);
  assert.match(text, /details may not be present immediately|do not assume[^.]*bank details/i);
});

test("sandbox is organized by testing scenario and links every helper", () => {
  const text = readPage("integration/sandbox");
  assertHeadingOrder(text, [
    "Test customer verification",
    "Test capability readiness",
    "Test requirements",
    "Fund a sandbox wallet",
    "Complete or fail a transfer",
  ]);

  const expected = [
    ["post", "/v3/sandbox/customers/{customerId}/verification"],
    ["post", "/v3/sandbox/customers/{customerId}/capabilities/{capabilityId}/status"],
    ["post", "/v3/sandbox/tasks"],
    ["post", "/v3/sandbox/tasks/{taskId}/review"],
    ["post", "/v3/sandbox/accounts/{accountId}/topup"],
    ["post", "/v3/sandbox/transfers/{transferId}/state"],
  ];
  const actual = operationLinks(text)
    .filter(({ path }) => path.startsWith("/v3/sandbox/"))
    .map(({ method, path }) => `${method} ${path}`);
  assert.deepEqual(actual.toSorted(), expected.map(([method, path]) => `${method} ${path}`).toSorted());

  const examples = curlExamples("integration/sandbox", text);
  for (const [method, path] of expected) {
    assert.ok(examplesFor(examples, method, path).length >= 1, `Missing curl for ${method.toUpperCase()} ${path}`);
  }
  assert.match(text, /simulate|test control/i);
  assert.match(text, /do not replace production compliance|does not replace production compliance/i);
});

test("Get started pages keep public-only language and root-relative links", () => {
  const text = PAGES.map((page) => readPage(page)).join("\n");
  assert.doesNotMatch(
    text,
    /openapi-coverage\.json|openapi-provenance\.json|x-mint|source precedence|provider orchestration|internal review|migration mechanics/i,
  );
  assert.doesNotMatch(text, /\bv1\b|\bv2\b|Bearer |serviceToken|uploadToken/i);
  assert.doesNotMatch(text, /guaranteed|guarantees|always available|immediately ready/i);
  assert.doesNotMatch(text, /retry every|exponential backoff|retry schedule/i);

  for (const page of PAGES) {
    for (const match of readPage(page).matchAll(/(?:href=["']|\]\()([^"')]+)(?:["']|\))/g)) {
      const href = match[1];
      if (/^(?:https?:|mailto:|#)/.test(href)) continue;
      assert.match(href, /^\//, `${page}.mdx has a non-root-relative link ${href}`);
      assert.doesNotMatch(href, /\.mdx?(?:$|[?#])/i);
    }
  }
});
