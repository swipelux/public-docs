import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import { getDefaultNavigation } from "../scripts/lib/docs-validation.mjs";
import { assertPages, readPage } from "./helpers/content.mjs";
import { createOpenApiValidator } from "./helpers/openapi-validation.mjs";

const PAGES = [
  "integration/overview",
  "integration/quickstart",
  "integration/authentication",
  "integration/errors",
  "integration/sandbox",
];

const PATH_VARIABLES = new Map([
  ["CUSTOMER_ID", "customerId"],
  ["CAPABILITY_ID", "capabilityId"],
  ["TASK_ID", "taskId"],
  ["ACCOUNT_ID", "accountId"],
  ["FLOW_WALLET_ID", "accountId"],
  ["PAYOUT_ACCOUNT_ID", "accountId"],
  ["BANK_ACCOUNT_ID", "accountId"],
  ["TRANSFER_ID", "transferId"],
]);

const BODY_VARIABLES = Object.freeze({
  CUSTOMER_ID: "cus_01JTESTCUSTOMER",
  CAPABILITY_ID: "ach_pooled",
  ACCOUNT_ID: "acc_01JTESTACCOUNT",
  FLOW_WALLET_ID: "acc_01JTESTFLOW",
  PAYOUT_ACCOUNT_ID: "acc_01JTESTPAYOUT",
  BANK_ACCOUNT_ID: "acc_01JTESTBANK",
  QUOTE_ID: "quo_01JTESTQUOTE",
  REQUIREMENT_ID: "req_01JTESTREQUIREMENT",
  TASK_REVISION: 1,
  TRANSFER_ID: "tr_01JTESTTRANSFER",
});

const config = JSON.parse(readFileSync("docs.json", "utf8"));
const coverage = JSON.parse(readFileSync("openapi-coverage.json", "utf8"));
const openapi = JSON.parse(readFileSync("openapi.json", "utf8"));
const openApiValidator = createOpenApiValidator(openapi);

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
    if (path.startsWith("/kyc/redirect/")) {
      assert.deepEqual(
        openApiOperation(method, path).operation.security,
        [],
        `${method.toUpperCase()} ${path} must remain an unauthenticated customer action link`,
      );
    } else {
      assert.equal(
        apiKeySecurity(method, path),
        true,
        `${method.toUpperCase()} ${path} must use OpenAPI apiKey security`,
      );
    }
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

  const requiredHeaders = openApiValidator.requiredParameterNames(
    method,
    path,
    "header",
  );
  for (const name of requiredHeaders) {
    const values = headerValues(example, name);
    assert.equal(values.length, 1, `${label} requires one ${name} header`);
    const validation = openApiValidator.validateParameter(
      method,
      path,
      "header",
      name,
      values[0],
    );
    assert.equal(
      validation.valid,
      true,
      `${label} has an invalid ${name}: ${JSON.stringify(validation.errors)}`,
    );
  }
  assert.equal(
    headerValues(example, "Idempotency-Key").length,
    requiredHeaders.includes("Idempotency-Key") ? 1 : 0,
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
    const validation = openApiValidator.validateRequestBody(
      method,
      path,
      materializeBody(example.body),
    );
    assert.equal(
      validation.valid,
      true,
      `${label} request body must match OpenAPI: ${JSON.stringify(validation.errors)}`,
    );
  } else if (multipart) {
    const fields = Object.fromEntries(
      example.forms.map((form) => {
        const separator = form.indexOf("=");
        return [form.slice(0, separator), form.slice(separator + 1)];
      }),
    );
    const validation = openApiValidator.validateRequestBody(
      method,
      path,
      fields,
      "multipart/form-data",
    );
    assert.equal(
      validation.valid,
      true,
      `${label} multipart body must match OpenAPI: ${JSON.stringify(validation.errors)}`,
    );
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

test("publishes the five Get started pages in the intended order", () => {
  assertPages(PAGES);
  const integration = getDefaultNavigation(config.navigation).tabs.find(
    (tab) => tab.tab === "Integration Docs",
  );
  assert.ok(integration, "Missing Integration Docs tab");
  const getStarted = integration.groups.find((group) => group.group === "Get started");
  assert.deepEqual(getStarted?.pages, PAGES);
});

test("surfaces the demo and starter as product references", () => {
  const homepage = readFileSync("index.mdx", "utf8");
  const overview = readPage("integration/overview");
  for (const text of [homepage, overview]) {
    assert.match(text, /https:\/\/demo\.swipelux\.com/);
    assert.match(text, /https:\/\/github\.com\/swipelux\/neobank-starter/);
    assert.match(text, /product and UI references/i);
    assert.match(text, /(?:do not replace|supported production integration|API contract)/i);
  }
  assert.throws(() => readPage("integration/starter-kit"), /ENOENT/);
});

test("every linked operation and representative curl remains OpenAPI-backed", () => {
  const apiKey = openapi.components.securitySchemes.apiKey;
  assert.deepEqual(
    { type: apiKey.type, in: apiKey.in, name: apiKey.name },
    { type: "apiKey", in: "header", name: "X-API-Key" },
  );

  for (const page of PAGES) {
    const text = readPage(page);
    if (page === "integration/overview") {
      assert.equal(operationLinks(text).length, 0);
    } else {
      assertOperationLinksMatchOpenApi(page, text);
    }
    for (const [index, example] of curlExamples(page, text).entries()) {
      assertCurlMatchesOpenApi(example, `${page}.mdx curl ${index + 1}`);
    }
  }
});

test("request validation rejects format, length, uniqueness, bounds, variants, and empty idempotency keys", () => {
  const validCustomer = {
    type: "individual",
    individual: {
      email: "developer@example.com",
      nationalities: ["US"],
    },
    financialProfile: { expectedMonthlyTransactionCount: 1 },
  };
  assert.equal(
    openApiValidator.validateRequestBody("post", "/v3/customers", validCustomer)
      .valid,
    true,
  );
  assert.equal(
    openApiValidator.validateRequestBody(
      "post",
      "/v3/customers",
      {
        ...validCustomer,
        individual: { ...validCustomer.individual, email: "not-an-email" },
      },
    ).valid,
    false,
    "invalid email formats must be rejected",
  );
  assert.equal(
    openApiValidator.validateRequestBody(
      "post",
      "/v3/customers",
      {
        ...validCustomer,
        individual: { ...validCustomer.individual, nationalities: ["US", "US"] },
      },
    ).valid,
    false,
    "duplicate uniqueItems values must be rejected",
  );
  assert.equal(
    openApiValidator.validateRequestBody(
      "post",
      "/v3/customers",
      {
        ...validCustomer,
        financialProfile: { expectedMonthlyTransactionCount: -1 },
      },
    ).valid,
    false,
    "numeric bounds must be rejected",
  );
  assert.equal(
    openApiValidator.validateRequestBody("post", "/v3/customers", {
      ...validCustomer,
      individual: { ...validCustomer.individual, phone: "123" },
    }).valid,
    false,
    "invalid patterns must be rejected",
  );

  assert.equal(
    openApiValidator.validateRequestBody(
      "post",
      "/v3/customers/{customerId}/accounts",
      {
        origin: "external",
        type: "bank",
        method: "ach",
        country: "US",
        currency: "USD",
        details: {},
      },
    ).valid,
    false,
    "invalid oneOf request shapes must be rejected",
  );

  assert.equal(
    openApiValidator.validateParameter(
      "post",
      "/v3/customers",
      "header",
      "Idempotency-Key",
      "",
    ).valid,
    false,
  );
  assert.equal(
    openApiValidator.validateParameter(
      "post",
      "/v3/customers",
      "header",
      "Idempotency-Key",
      "x".repeat(256),
    ).valid,
    false,
    "overlong Idempotency-Key values must be rejected",
  );
});

test("overview leads with outcomes, the shared lifecycle, and clear starting points", () => {
  const text = readPage("integration/overview");
  assertHeadingOrder(text, [
    "What you can build",
    "How an integration works",
    "See it in action",
    "Start building",
  ]);
  for (const [title, href] of [
    ["Receive funds", "/integration/receive-funds"],
    ["Send funds", "/integration/send-funds"],
    ["Issue a bank account", "/integration/issue-bank-account"],
    ["Quickstart", "/integration/quickstart"],
    ["Common flows", "/integration/common-flows"],
    ["API Reference", "/api-reference/introduction"],
  ]) {
    assert.equal(card(text, title, href), true, `Missing ${title} card`);
  }

  const lifecycle = [
    "Create customer",
    "Activate capability",
    "Complete open tasks",
    "Create account or destination",
    "Run the selected flow",
    "Track updates with webhooks",
  ];
  const indexes = lifecycle.map((step) => text.indexOf(step));
  assert.ok(indexes.every((index) => index >= 0), "Overview is missing a lifecycle step");
  assert.deepEqual(indexes, indexes.toSorted((left, right) => left - right));
  assert.doesNotMatch(text, /^## Core resources$/m);
  assert.doesNotMatch(text, /provider orchestration|source precedence|contract provenance/i);
});

test("authentication shows one backend API-key flow and preserves the environment anchor", () => {
  const text = readPage("integration/authentication");
  assertHeadingOrder(text, [
    "Send your API key",
    "Sandbox and production",
    "Store credentials safely",
  ]);
  assert.match(text, /https:\/\/platform\.swipelux\.com/);
  assert.match(text, /`X-API-Key`/);
  assert.match(text, /\$\{SWIPELUX_API_KEY\}/);
  assert.match(text, /API key selects (?:sandbox or production|the environment)/i);
  assert.match(text, /backend|server-side/i);
  assert.match(text, /secret[- ]manager/i);
  assert.doesNotMatch(text, /YOUR_API_KEY/);

  const examples = curlExamples("integration/authentication", text);
  assert.equal(examples.length, 1);
  assert.equal(examples[0].method, "get");
  assert.equal(examples[0].path, "/v3/capabilities");
  const requestBlock = bashBlocks(text).find((block) => /(^|\n)\s*curl\s/.test(block));
  assert.ok(requestBlock);
  assert.match(
    requestBlock,
    /export SWIPELUX_API_KEY=['"]replace-with-your-api-key['"]/,
  );
  assert.ok(
    requestBlock.indexOf("export SWIPELUX_API_KEY") < requestBlock.indexOf("curl"),
    "Authentication must define SWIPELUX_API_KEY before the request",
  );
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
  assert.ok(
    (text.match(/\S+/g) ?? []).length <= 1000,
    "Quickstart must stay at or below 1,000 words",
  );

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
  assert.match(
    text,
    /each request above already links to its complete API Reference schema and status page/i,
  );
  assert.doesNotMatch(text, /\]\(\/api-reference\)/);
});

test("quickstart keeps one customer-owned payout path and delegates third-party payouts", () => {
  const text = readPage("integration/quickstart");
  const linkedOperations = operationLinks(text);
  assert.equal(
    linkedOperations.some(
      ({ path }) => path.includes("/recipients") || path.includes("/destinations"),
    ),
    false,
    "Quickstart must send third-party payouts to the dedicated guides",
  );
  assert.match(text, /\/integration\/(?:recipients|send-funds)/);
  assert.match(text, /customer-owned/i);
});

test("quickstart stores the transfer instruction response fields", () => {
  const text = readPage("integration/quickstart");
  assert.match(text, /data\.transferId[\s\S]{0,160}data\.instructions/i);
  assert.match(text, /data\.instructions[\s\S]{0,120}FUNDING_INSTRUCTIONS/i);
  assert.doesNotMatch(text, /Store the returned `data` as `FUNDING_INSTRUCTIONS`/i);
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
  assert.equal(
    accounts.filter(
      ({ body }) =>
        body?.origin === "issued" &&
        body.type === "wallet" &&
        body.currency === "USDC" &&
        body.network === "base",
    ).length,
    1,
    "Quickstart needs one shared issued USDC/Base wallet",
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
  assert.ok(
    examplesFor(examples, "get", "/v3/customers/{customerId}/accounts/{accountId}")
      .length >= 3,
  );

  for (const field of ["data.id", "data.status", "data.openTaskIds"]) {
    assert.ok(text.includes(`\`${field}\``), `Quickstart must store ${field}`);
  }
  assert.match(text, /test control[^.]*not production onboarding|not production onboarding[^.]*test control/i);
  assert.match(text, /details may not be present immediately|do not assume[^.]*bank details/i);
});

test("quickstart gates both reusable accounts on current readiness before use", () => {
  const text = readPage("integration/quickstart");
  const tabs = text.indexOf("<Tabs>");
  const flowWallet = text.indexOf("FLOW_WALLET_ID");
  assert.ok(flowWallet >= 0 && flowWallet < tabs, "Create the shared wallet before the flow tabs");
  assert.match(
    text,
    /FLOW_WALLET_ID[\s\S]{0,240}data\.status[\s\S]{0,120}FLOW_WALLET_STATUS[\s\S]{0,160}data\.openTaskIds[\s\S]{0,120}FLOW_WALLET_TASK_IDS/i,
  );
  assert.match(
    text,
    /FLOW_WALLET_TASK_IDS[\s\S]{0,320}complete[\s\S]{0,120}(?:current )?tasks?/i,
  );
  assert.match(
    text,
    /GET \/v3\/customers\/\{customerId\}\/accounts\/\{accountId\}[\s\S]{0,500}FLOW_WALLET_STATUS[\s\S]{0,120}`ready`/i,
  );

  const flowReady = text.search(/FLOW_WALLET_STATUS[^\n.]{0,120}`ready`/i);
  const topup = text.indexOf("`POST /v3/sandbox/accounts/{accountId}/topup`");
  const firstQuote = text.indexOf("`POST /v3/quotes`");
  assert.ok(flowReady >= 0 && flowReady < topup && flowReady < firstQuote);

  assert.match(
    text,
    /PAYOUT_ACCOUNT_ID[\s\S]{0,240}data\.status[\s\S]{0,120}PAYOUT_ACCOUNT_STATUS[\s\S]{0,160}data\.openTaskIds[\s\S]{0,120}PAYOUT_ACCOUNT_TASK_IDS/i,
  );
  assert.match(
    text,
    /PAYOUT_ACCOUNT_TASK_IDS[\s\S]{0,320}complete[\s\S]{0,120}(?:current )?tasks?/i,
  );
  assert.match(
    text,
    /PAYOUT_ACCOUNT_STATUS[\s\S]{0,160}`ready`[\s\S]{0,500}`POST \/v3\/quotes`/i,
  );
});

test("sandbox is organized by testing scenario and links every helper", () => {
  const text = readPage("integration/sandbox");
  assertHeadingOrder(text, [
    "Test capability readiness",
    "Test an open task",
    "Fund a sandbox wallet",
    "Complete or fail a transfer",
  ]);

  const expected = [
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
  const taskBlock = bashBlocks(text).find((block) =>
    block.includes("/v3/sandbox/tasks"),
  );
  assert.ok(taskBlock);
  assert.match(taskBlock, /<<JSON/);
  assert.doesNotMatch(taskBlock, /<<'JSON'/);
  assert.match(taskBlock, /"customerId": "\$\{CUSTOMER_ID\}"/);
  assert.match(taskBlock, /"capabilityId": "\$\{CAPABILITY_ID\}"/);

  const createTask = text.indexOf("`POST /v3/sandbox/tasks`");
  const submitTask = text.indexOf(
    "`POST /v3/customers/{customerId}/tasks/{taskId}/submissions`",
  );
  const reviewTask = text.indexOf("`POST /v3/sandbox/tasks/{taskId}/review`");
  assert.ok(
    createTask >= 0 && createTask < submitTask && submitTask < reviewTask,
    "Sandbox requirements must be submitted before review",
  );
  assert.match(text, /data\.revision[\s\S]{0,160}data\.requirements/i);
  assert.match(text, /simulate|test control/i);
  assert.match(text, /do not replace production compliance|does not replace production compliance/i);
  assert.match(text, /same (?:base URL|API host)/i);
  assert.match(text, /sandbox (?:API )?key selects (?:the )?(?:test )?environment/i);
  assert.match(text, /without moving real funds|no real funds move/i);
  assert.doesNotMatch(
    text,
    /\/v3\/sandbox\/customers\/\{customerId\}\/verification/,
  );
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
