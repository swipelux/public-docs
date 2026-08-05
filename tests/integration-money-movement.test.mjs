import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import { assertPages, readPage } from "./helpers/content.mjs";
import { createOpenApiValidator } from "./helpers/openapi-validation.mjs";

const PAGES = [
  "integration/common-flows",
  "integration/accounts",
  "integration/issue-bank-account",
  "integration/recipients",
  "integration/receive-funds",
  "integration/send-funds",
  "integration/quotes-and-transfers",
  "integration/rules",
];

const REQUIRED_OPERATIONS = new Map([
  [
    "integration/accounts",
    [
      ["post", "/v3/customers/{customerId}/accounts"],
      ["get", "/v3/customers/{customerId}/accounts/{accountId}"],
      ["get", "/v3/customers/{customerId}/accounts/{accountId}/fees"],
      ["put", "/v3/customers/{customerId}/accounts/{accountId}/fees"],
      ["patch", "/v3/customers/{customerId}/accounts/{accountId}"],
      ["delete", "/v3/customers/{customerId}/accounts/{accountId}"],
    ],
  ],
  [
    "integration/issue-bank-account",
    [
      ["post", "/v3/customers/{customerId}/accounts"],
      ["get", "/v3/customers/{customerId}/accounts/{accountId}"],
    ],
  ],
  [
    "integration/recipients",
    [
      ["post", "/v3/customers/{customerId}/recipients"],
      ["get", "/v3/customers/{customerId}/recipients/{recipientId}"],
      ["patch", "/v3/customers/{customerId}/recipients/{recipientId}"],
      ["delete", "/v3/customers/{customerId}/recipients/{recipientId}"],
      [
        "post",
        "/v3/customers/{customerId}/recipients/{recipientId}/destinations",
      ],
      [
        "get",
        "/v3/customers/{customerId}/recipients/{recipientId}/destinations/{destinationId}",
      ],
      [
        "delete",
        "/v3/customers/{customerId}/recipients/{recipientId}/destinations/{destinationId}",
      ],
    ],
  ],
  [
    "integration/receive-funds",
    [
      ["post", "/v3/quotes"],
      ["post", "/v3/transfers"],
      ["get", "/v3/transfers/{transferId}/instructions"],
      ["get", "/v3/transfers/{transferId}"],
    ],
  ],
  [
    "integration/send-funds",
    [
      ["post", "/v3/customers/{customerId}/accounts"],
      ["get", "/v3/customers/{customerId}/accounts/{accountId}"],
      ["post", "/v3/customers/{customerId}/recipients"],
      [
        "post",
        "/v3/customers/{customerId}/recipients/{recipientId}/destinations",
      ],
      [
        "get",
        "/v3/customers/{customerId}/recipients/{recipientId}/destinations/{destinationId}",
      ],
      ["post", "/v3/quotes"],
      ["post", "/v3/transfers"],
      ["get", "/v3/transfers/{transferId}"],
    ],
  ],
  [
    "integration/quotes-and-transfers",
    [
      ["post", "/v3/quotes"],
      ["get", "/v3/quotes/{quoteId}"],
      ["post", "/v3/transfers"],
      ["get", "/v3/transfers/{transferId}"],
      ["get", "/v3/transfers/{transferId}/tasks"],
      ["get", "/v3/transfers/{transferId}/instructions"],
    ],
  ],
  [
    "integration/rules",
    [
      ["post", "/v3/customers/{customerId}/rules"],
      ["get", "/v3/customers/{customerId}/rules/{ruleId}"],
      ["patch", "/v3/customers/{customerId}/rules/{ruleId}"],
      ["delete", "/v3/customers/{customerId}/rules/{ruleId}"],
    ],
  ],
]);

const BODY_VARIABLES = Object.freeze({
  CUSTOMER_ID: "cus_7F3pL2nQ9xA5mW8kR1sT4v",
  CAPABILITY_ID: "ach_pooled",
  SETTLEMENT_WALLET_ID: "acc_3eG7xN2pQ4rT8mA1sL6dVc",
  SOURCE_WALLET_ID: "acc_6dV8xN2pQ4rT7mA9sL1kBc",
  CUSTOMER_BANK_ACCOUNT_ID: "acc_7mA9sL1kBc6dV8xN2pQ4rT",
  RECIPIENT_DESTINATION_ID: "dst_2pQ4rT7mA9sL1kBc6dV8xN",
  WALLET_DESTINATION_ID: "dst_8xN2pQ4rT7mA9sL1kBc6dV",
  QUOTE_ID: "quo_6dV8xN2pQ4rT7mA9sL1kBc",
  RULE_TRIGGER_ACCOUNT_ID: "acc_2pQ4rT7mA9sL1kBc6dV8xN",
  RULE_TARGET_ACCOUNT_ID: "acc_9sL1kBc6dV8xN2pQ4rT7mA",
});

const EXAMPLES = Object.freeze({
  issuedWallet: {
    origin: "issued",
    type: "wallet",
    currency: "USDC",
    network: "base",
    label: "Settlement wallet",
  },
  issuedBank: {
    origin: "issued",
    type: "bank",
    method: "ach",
    country: "US",
    currency: "USD",
    settlement: { accountId: "${SETTLEMENT_WALLET_ID}" },
    label: "USD pay-in account",
  },
  externalWallet: {
    origin: "external",
    type: "wallet",
    currency: "USDC",
    network: "polygon",
    details: { address: "0x4997b0a68bebc1b0d80a93567ba7002be92b8b11" },
    label: "Customer Polygon wallet",
  },
  externalBank: {
    origin: "external",
    type: "bank",
    methods: ["ach", "wire"],
    country: "US",
    currency: "USD",
    details: {
      routingNumber: "021000021",
      accountNumber: "123456789",
      accountType: "checking",
      bankName: "JPMorgan Chase Bank",
      accountHolderName: "Swipelux Inc.",
    },
    label: "Customer operating account",
  },
  feeRule: {
    breakdown: { developer: { fixed: "1.00", bips: 50 } },
  },
  individualRecipient: {
    type: "individual",
    relationship: "contractor",
    firstName: "Jason",
    lastName: "Swipelux",
    email: "jason@swipelux.com",
    phone: "+14155551234",
    address: {
      streetLine1: "1 Market Street",
      city: "San Francisco",
      state: "CA",
      postalCode: "94105",
      country: "US",
    },
    label: "Jason contractor",
  },
  bankDestination: {
    type: "ach",
    currency: "USD",
    details: {
      routingNumber: "021000021",
      accountNumber: "123456789",
      accountType: "checking",
      bankName: "JPMorgan Chase",
      accountHolderName: "Jason Swipelux",
      country: "US",
    },
  },
  walletDestination: {
    type: "wallet",
    currency: "USDC",
    ownership: { type: "self_custodied" },
    details: {
      network: "base",
      address: "0x1111111111111111111111111111111111111111",
    },
  },
  payInQuote: {
    customerId: "${CUSTOMER_ID}",
    capabilityId: "${CAPABILITY_ID}",
    externalId: "payin-order-123",
    in: { amount: "150.00", currency: "USD" },
    destinationId: "${SETTLEMENT_WALLET_ID}",
    out: { currency: "USDC" },
  },
  firstPartyPayoutQuote: {
    customerId: "${CUSTOMER_ID}",
    capabilityId: "${CAPABILITY_ID}",
    in: {
      amount: "150.00",
      currency: "USDC",
      accountId: "${SOURCE_WALLET_ID}",
    },
    destinationId: "${CUSTOMER_BANK_ACCOUNT_ID}",
    out: { currency: "USD" },
  },
  thirdPartyPayoutQuote: {
    customerId: "${CUSTOMER_ID}",
    capabilityId: "${CAPABILITY_ID}",
    in: {
      amount: "150.00",
      currency: "USDC",
      accountId: "${SOURCE_WALLET_ID}",
    },
    destinationId: "${RECIPIENT_DESTINATION_ID}",
    out: { currency: "USD" },
  },
  exactInQuote: {
    customerId: "${CUSTOMER_ID}",
    capabilityId: "stablecoin_transfers",
    in: {
      amount: "1.234567",
      currency: "USDC",
      accountId: "${SOURCE_WALLET_ID}",
    },
    destinationId: "${WALLET_DESTINATION_ID}",
    out: { currency: "USDC" },
  },
  exactOutQuote: {
    customerId: "${CUSTOMER_ID}",
    capabilityId: "${CAPABILITY_ID}",
    in: { currency: "USDC", accountId: "${SOURCE_WALLET_ID}" },
    destinationId: "${RECIPIENT_DESTINATION_ID}",
    out: { amount: "100.00", currency: "USD" },
  },
  transfer: { quoteId: "${QUOTE_ID}" },
  ruleCreate: {
    trigger: {
      type: "funds_received",
      accountId: "${RULE_TRIGGER_ACCOUNT_ID}",
    },
    action: {
      type: "transfer",
      target: { type: "account", id: "${RULE_TARGET_ACCOUNT_ID}" },
    },
    label: "Treasury consolidation",
  },
  ruleUpdate: {
    status: "paused",
    label: "Paused while destination changes",
  },
});

const BODY_CASES = [
  ["integration/accounts", "post", "/v3/customers/{customerId}/accounts", EXAMPLES.issuedWallet],
  ["integration/accounts", "post", "/v3/customers/{customerId}/accounts", EXAMPLES.issuedBank],
  ["integration/accounts", "post", "/v3/customers/{customerId}/accounts", EXAMPLES.externalWallet],
  ["integration/accounts", "post", "/v3/customers/{customerId}/accounts", EXAMPLES.externalBank],
  ["integration/accounts", "put", "/v3/customers/{customerId}/accounts/{accountId}/fees", EXAMPLES.feeRule],
  ["integration/issue-bank-account", "post", "/v3/customers/{customerId}/accounts", EXAMPLES.issuedBank],
  ["integration/recipients", "post", "/v3/customers/{customerId}/recipients", EXAMPLES.individualRecipient],
  ["integration/recipients", "post", "/v3/customers/{customerId}/recipients/{recipientId}/destinations", EXAMPLES.bankDestination],
  ["integration/recipients", "post", "/v3/customers/{customerId}/recipients/{recipientId}/destinations", EXAMPLES.walletDestination],
  ["integration/receive-funds", "post", "/v3/quotes", EXAMPLES.payInQuote],
  ["integration/receive-funds", "post", "/v3/transfers", EXAMPLES.transfer],
  ["integration/send-funds", "post", "/v3/customers/{customerId}/accounts", EXAMPLES.externalBank],
  ["integration/send-funds", "post", "/v3/customers/{customerId}/recipients", EXAMPLES.individualRecipient],
  ["integration/send-funds", "post", "/v3/customers/{customerId}/recipients/{recipientId}/destinations", EXAMPLES.bankDestination],
  ["integration/send-funds", "post", "/v3/quotes", EXAMPLES.firstPartyPayoutQuote],
  ["integration/send-funds", "post", "/v3/quotes", EXAMPLES.thirdPartyPayoutQuote],
  ["integration/send-funds", "post", "/v3/transfers", EXAMPLES.transfer],
  ["integration/quotes-and-transfers", "post", "/v3/quotes", EXAMPLES.exactInQuote],
  ["integration/quotes-and-transfers", "post", "/v3/quotes", EXAMPLES.exactOutQuote],
  ["integration/quotes-and-transfers", "post", "/v3/transfers", EXAMPLES.transfer],
  ["integration/rules", "post", "/v3/customers/{customerId}/rules", EXAMPLES.ruleCreate],
  ["integration/rules", "patch", "/v3/customers/{customerId}/rules/{ruleId}", EXAMPLES.ruleUpdate],
];

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
  const pathItem = openapi.paths?.[path];
  assert.ok(pathItem, `Missing OpenAPI path ${path}`);
  const operation = pathItem[method];
  assert.ok(operation, `Missing OpenAPI operation ${method.toUpperCase()} ${path}`);
  return operation;
}

function coverageOperation(method, path) {
  const matches = coverage.operations.filter(
    (candidate) => candidate.method === method && candidate.path === path,
  );
  assert.equal(matches.length, 1, `Expected one coverage entry for ${method.toUpperCase()} ${path}`);
  assert.equal(openApiOperation(method, path)["x-mint"]?.href, matches[0].href);
  return matches[0];
}

function operationMarkdown(method, path) {
  return `[\`${method.toUpperCase()} ${path}\`](${coverageOperation(method, path).href})`;
}

function operationLinks(text) {
  return [...text.matchAll(/\[`([A-Z]+) ([^`]+)`\]\((\/api-reference\/[^)]+)\)/g)].map(
    (match) => ({ method: match[1].toLowerCase(), path: match[2], href: match[3] }),
  );
}

function assertOperationLinksMatchOpenApi(page, text) {
  for (const { method, path, href } of operationLinks(text)) {
    assert.equal(
      coverageOperation(method, path).href,
      href,
      `${page}.mdx must bind ${method.toUpperCase()} ${path} to its generated href`,
    );
  }
  for (const match of text.matchAll(/\[[^\]]+\]\((\/api-reference\/[^)]+)\)/g)) {
    assert.ok(
      operationLinks(text).some(({ href }) => href === match[1]),
      `${page}.mdx must label ${match[1]} with its method and path`,
    );
  }
}

function responseSchema(method, path, status) {
  const response = resolveReference(openApiOperation(method, path).responses?.[status]);
  assert.ok(response, `Missing ${status} response for ${method.toUpperCase()} ${path}`);
  const schema = response.content?.["application/json"]?.schema;
  assert.ok(schema, `Missing JSON schema for ${method.toUpperCase()} ${path} ${status}`);
  return schema;
}

function expandSchemas(schema, seen = new Set()) {
  const resolved = resolveReference(schema);
  if (!resolved || typeof resolved !== "object" || seen.has(resolved)) return [];
  seen.add(resolved);
  return [
    resolved,
    ...["oneOf", "anyOf", "allOf"].flatMap((key) =>
      (resolved[key] ?? []).flatMap((branch) => expandSchemas(branch, seen)),
    ),
  ];
}

function schemasAtPath(schema, path) {
  let candidates = [schema];
  for (const segment of path.split(".")) {
    candidates = candidates.flatMap((candidate) =>
      expandSchemas(candidate).flatMap((expanded) =>
        expanded.properties?.[segment] ? [expanded.properties[segment]] : [],
      ),
    );
  }
  return candidates.flatMap((candidate) => expandSchemas(candidate));
}

function assertResponseFields(method, path, status, fields) {
  const schema = responseSchema(method, path, status);
  for (const field of fields) {
    assert.ok(
      schemasAtPath(schema, field).length > 0,
      `${method.toUpperCase()} ${path} ${status} must expose ${field}`,
    );
  }
}

function responseEnum(method, path, status, field) {
  return [
    ...new Set(
      schemasAtPath(responseSchema(method, path, status), field).flatMap(
        (schema) => schema.enum ?? (Object.hasOwn(schema, "const") ? [schema.const] : []),
      ),
    ),
  ];
}

function jsonBlocks(text) {
  return [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((match, index) => {
    try {
      return JSON.parse(match[1]);
    } catch (error) {
      assert.fail(`JSON block ${index + 1} is invalid: ${error.message}`);
    }
  });
}

function materializeBody(value) {
  if (Array.isArray(value)) return value.map(materializeBody);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, materializeBody(item)]),
    );
  }
  if (typeof value === "string") {
    const variable = /^\$\{([A-Z_][A-Z0-9_]*)\}$/.exec(value)?.[1];
    if (variable && Object.hasOwn(BODY_VARIABLES, variable)) return BODY_VARIABLES[variable];
  }
  return value;
}

function assertRepresentativeBody(page, method, path, expected) {
  const blocks = jsonBlocks(readPage(page));
  assert.ok(
    blocks.some((body) => isDeepStrictEqual(body, expected)),
    `${page}.mdx must include the representative ${method.toUpperCase()} ${path} body`,
  );
  const validation = openApiValidator.validateRequestBody(
    method,
    path,
    materializeBody(expected),
  );
  assert.equal(
    validation.valid,
    true,
    `${page}.mdx ${method.toUpperCase()} ${path} body must match OpenAPI: ${JSON.stringify(validation.errors)}`,
  );
}

function assertWriteHeaders(method, path) {
  const required = openApiValidator.requiredParameterNames(method, path, "header");
  assert.ok(required.includes("Idempotency-Key"), `${method.toUpperCase()} ${path} must require Idempotency-Key`);
  const validation = openApiValidator.validateParameter(
    method,
    path,
    "header",
    "Idempotency-Key",
    "stage-c-money-movement-0001",
  );
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
}

function headingOrder(text, headings) {
  const positions = headings.map((heading) => text.indexOf(`## ${heading}`));
  assert.ok(positions.every((position) => position >= 0), `Missing heading from ${headings.join(", ")}`);
  assert.deepEqual(positions, positions.toSorted((left, right) => left - right));
}

function textOrder(text, values) {
  const positions = values.map((value) => text.indexOf(value));
  assert.ok(positions.every((position) => position >= 0), `Missing sequence item from ${values.join(", ")}`);
  assert.deepEqual(positions, positions.toSorted((left, right) => left - right));
}

function hasCard(text, title, href) {
  return new RegExp(
    `<Card\\b(?=[^>]*\\btitle=["']${title}["'])(?=[^>]*\\bhref=["']${href}["'])[^>]*>`,
  ).test(text);
}

function linkCount(text, href) {
  return [...text.matchAll(/\]\(([^)]+)\)/g)].filter(
    (match) => match[1] === href || match[1].startsWith(`${href}#`),
  ).length;
}

function proseWordCount(text) {
  const prose = text
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[[^\]]+\]\([^)]+\)/g, (match) => match.slice(1, match.indexOf("]")))
    .replace(/[|#*_>`]/g, " ");
  return prose.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu)?.length ?? 0;
}

test("publishes the complete money-movement guide set in navigation order", () => {
  assertPages(PAGES);
  const integration = config.navigation.tabs.find((tab) => tab.tab === "Integration Docs");
  const group = integration?.groups.find((candidate) => candidate.group === "Build money flows");
  assert.deepEqual(group?.pages, PAGES);

  const common = readPage("integration/common-flows");
  assert.match(common, /^title: "Common flows"$/m);
  assert.match(
    common,
    /^description: "Choose the right Swipelux workflow for pay-ins, payouts, or issued bank accounts\."$/m,
  );
  const issue = readPage("integration/issue-bank-account");
  assert.match(issue, /^title: "Issue a bank account"$/m);
  assert.match(
    issue,
    /^description: "Create a settlement wallet, issue a bank account, and monitor provisioning\."$/m,
  );
});

test("binds every required operation to its generated API Reference href", () => {
  for (const page of PAGES) assertOperationLinksMatchOpenApi(page, readPage(page));
  for (const [page, operations] of REQUIRED_OPERATIONS) {
    const text = readPage(page);
    for (const [method, path] of operations) {
      assert.ok(text.includes(operationMarkdown(method, path)), `${page}.mdx must link ${method.toUpperCase()} ${path}`);
    }
  }
});

test("operation-link validation rejects a swapped generated href", () => {
  const page = "integration/accounts";
  const text = readPage(page);
  const account = operationMarkdown("post", "/v3/customers/{customerId}/accounts");
  const quoteHref = coverageOperation("post", "/v3/quotes").href;
  const mutated = text.replace(
    account,
    `[\`POST /v3/customers/{customerId}/accounts\`](${quoteHref})`,
  );
  assert.notEqual(mutated, text, "Account operation fixture must exist");
  assert.throws(() => assertOperationLinksMatchOpenApi(page, mutated), /must bind POST/);
});

test("keeps every representative request body and write header OpenAPI-valid", () => {
  for (const [page, method, path, body] of BODY_CASES) {
    assertRepresentativeBody(page, method, path, body);
    assertWriteHeaders(method, path);
  }
  for (const operations of REQUIRED_OPERATIONS.values()) {
    for (const [method, path] of operations) {
      if (["post", "patch", "put", "delete"].includes(method)) assertWriteHeaders(method, path);
    }
  }
});

test("anchors readiness and retained fields in response schemas", () => {
  assert.ok(
    responseEnum("get", "/v3/customers/{customerId}/capabilities/{capabilityId}", "200", "data.status").includes("ready"),
  );
  assert.ok(
    responseEnum("get", "/v3/customers/{customerId}/accounts/{accountId}", "200", "data.status").includes("ready"),
  );
  assert.ok(
    responseEnum(
      "get",
      "/v3/customers/{customerId}/recipients/{recipientId}/destinations/{destinationId}",
      "200",
      "data.status",
    ).includes("ready"),
  );

  assertResponseFields("post", "/v3/customers/{customerId}/accounts", "201", [
    "data.id",
    "data.status",
    "data.openTaskIds",
    "data.statusReason.message",
    "data.statusReason.retryable",
    "data.details",
    "data.settlement.accountId",
  ]);
  assertResponseFields("post", "/v3/customers/{customerId}/recipients", "201", [
    "data.id",
    "data.status",
  ]);
  assertResponseFields(
    "post",
    "/v3/customers/{customerId}/recipients/{recipientId}/destinations",
    "201",
    ["data.id", "data.status"],
  );
  assertResponseFields("post", "/v3/quotes", "201", ["data.id", "data.status", "data.expiresAt"]);
  assertResponseFields("post", "/v3/transfers", "201", [
    "data.id",
    "data.state",
    "data.stateDetail",
    "data.openTaskIds",
    "data.instructions",
  ]);
  assertResponseFields("get", "/v3/transfers/{transferId}/instructions", "200", [
    "data.instructions",
    "data.instructions.reference.required",
    "data.instructions.reference.value",
  ]);
  assertResponseFields("post", "/v3/customers/{customerId}/rules", "201", [
    "data.id",
    "data.status",
  ]);
});

test("common flows compares the three developer outcomes without implementation prose", () => {
  const text = readPage("integration/common-flows");
  assert.equal((text.match(/<Card\b/g) ?? []).length, 3);
  assert.equal(hasCard(text, "Receive funds", "/integration/receive-funds"), true);
  assert.equal(hasCard(text, "Send funds", "/integration/send-funds"), true);
  assert.equal(hasCard(text, "Issue a bank account", "/integration/issue-bank-account"), true);
  assert.match(text, /Pay-in[\s\S]*ready pay-in capability[\s\S]*destination wallet[\s\S]*funding instructions[\s\S]*stablecoin settlement/i);
  assert.match(text, /Payout[\s\S]*ready payout capability[\s\S]*source funds[\s\S]*ready destination[\s\S]*(?:fiat|stablecoin) delivery/i);
  assert.match(text, /Issued bank account[\s\S]*ready bank capability[\s\S]*ready settlement wallet[\s\S]*reusable bank details[\s\S]*provisioning/i);
  assert.ok(proseWordCount(text) <= 300, "Common flows must stay concise");
});

test("accounts explains the four account choices and gates use on current state", () => {
  const text = readPage("integration/accounts");
  for (const label of ["Issued wallet", "Issued bank", "External wallet", "External bank"]) {
    assert.match(text, new RegExp(`^\\| ${label} \\|`, "m"));
  }
  assert.match(text, /Store `data\.id`, `data\.status`, and `data\.openTaskIds`/i);
  assert.match(text, /refetch|read the current account/i);
  assert.match(text, /current `data\.status` is `ready`/i);
  assert.match(text, /`statusReason`[\s\S]{0,180}(?:next action|action signal)/i);
  assert.match(text, /`statusReason`[\s\S]{0,220}`retryable`/i);
  assert.match(text, /issued bank[\s\S]{0,180}`settlement\.accountId`/i);
  assert.match(text, /details may be absent|`data\.details` may be `null`/i);
  assert.match(text, /`details\.referenceRequired`[\s\S]{0,160}`details\.reference`/i);
  assert.match(text, /developer fee|fee rule/i);
  assert.match(text, /archive/i);
  assert.equal(linkCount(text, "/integration/api-reliability"), 1);
  assert.doesNotMatch(text, /account_holder_name_mismatch|provider_provisioning|provisioning_failed/);
});

test("issued bank account follows settlement, provisioning, and safe presentation order", () => {
  const text = readPage("integration/issue-bank-account");
  headingOrder(text, [
    "Before you start",
    "1. Create or select the settlement wallet",
    "2. Create the issued bank account",
    "3. Monitor provisioning",
    "4. Present bank details safely",
    "Next step",
  ]);
  textOrder(text, ["ready bank capability", "ready settlement wallet", "settlement.accountId", "Monitor provisioning", "Present bank details safely"]);
  assert.match(text, /Store `data\.id`, `data\.status`, `data\.openTaskIds`, and `data\.details`/i);
  assert.match(text, /refetch|read the current account/i);
  assert.match(text, /do not present|only present/i);
  assert.match(text, /details[\s\S]{0,180}(?:absent|`null`)[\s\S]{0,180}provision/i);
  assert.match(text, /`details\.referenceRequired`[\s\S]{0,180}`details\.reference`/i);
  assert.match(text, /\[Accounts and wallets\]\(\/integration\/accounts(?:#[^)]+)?\)/);
  assert.equal(linkCount(text, "/integration/api-reliability"), 1);
});

test("recipients keeps ownership, address, destinations, and readiness explicit", () => {
  const text = readPage("integration/recipients");
  assert.match(text, /Use an account when the customer owns the destination; use a recipient and destination for another person or business\./i);
  textOrder(text, ["Individual recipient", "streetLine1", "Bank destination"]);
  assert.match(text, /Store (?:the )?recipient `data\.id` and `data\.status`/i);
  assert.match(text, /Store (?:the )?destination `data\.id` and `data\.status`/i);
  assert.match(text, /current destination[\s\S]{0,120}`data\.status` is `ready`/i);
  assert.match(text, /ownership[\s\S]{0,180}declaration/i);
  assert.match(text, /read[\s\S]{0,200}update[\s\S]{0,200}archive/i);
  assert.doesNotMatch(text, /POST \/v3\/quotes|POST \/v3\/transfers/);
  assert.equal(linkCount(text, "/integration/api-reliability"), 1);
});

test("receive funds implements the complete pay-in sequence and exact reference handling", () => {
  const text = readPage("integration/receive-funds");
  headingOrder(text, [
    "Before you start",
    "1. Create a quote",
    "2. Execute the quote",
    "3. Retrieve funding instructions",
    "4. Show the required reference",
    "5. Monitor settlement",
    "Next step",
  ]);
  textOrder(text, ["ready pay-in capability", "ready destination wallet", "Store `data.id` as the quote ID", "Store transfer `data.id` as the transfer ID", "`data.instructions`", "`reference.required`", "current `data.state`"]);
  assert.match(text, /transfer-specific[\s\S]{0,220}issued bank account[\s\S]{0,220}reusable/i);
  assert.match(text, /`reference\.required`[\s\S]{0,180}`reference\.value`/i);
  assert.doesNotMatch(text, /payout[\s\S]{0,80}instructions|instructions[\s\S]{0,80}payout/i);
  assert.equal(linkCount(text, "/integration/api-reliability"), 1);
});

test("send funds separates first-party and third-party payout preparation", () => {
  const text = readPage("integration/send-funds");
  assert.match(text, /<Tab title="First-party">/);
  assert.match(text, /<Tab title="Third-party">/);
  assert.match(text, /ready, funded source wallet/i);
  assert.match(text, /customer-owned external bank account/i);
  assert.match(text, /current account[\s\S]{0,160}`data\.status` is `ready`/i);
  assert.match(text, /addressed individual recipient/i);
  assert.match(text, /current destination[\s\S]{0,160}`data\.status` is `ready`/i);
  const tabsEnd = text.indexOf("</Tabs>");
  const execute = text.indexOf("## Execute the payout");
  assert.ok(tabsEnd >= 0 && execute > tabsEnd, "Transfer execution must follow both preparation tabs");
  assert.equal((text.match(/```json\n\{\n  "quoteId": "\$\{QUOTE_ID\}"\n\}\n```/g) ?? []).length, 1);
  assert.match(text, /Store transfer `data\.id`[\s\S]{0,120}`data\.state`/i);
  assert.ok(text.includes("[Quotes and transfers](/integration/quotes-and-transfers)"));
  assert.doesNotMatch(text, /instruction/i);
  assert.equal(linkCount(text, "/integration/api-reliability"), 1);
});

test("quotes and transfers uses schema-backed exact amounts and current transfer state", () => {
  const text = readPage("integration/quotes-and-transfers");
  assert.match(text, /Exact in[\s\S]{0,220}`in\.amount`[\s\S]{0,220}omit `out\.amount`/i);
  assert.match(text, /Exact out[\s\S]{0,220}`out\.amount`[\s\S]{0,220}omit `in\.amount`/i);
  assert.doesNotMatch(text, /["`]mode["`]/i);
  assert.match(text, /`expiresAt`[\s\S]{0,220}(?:execute|execution)/i);
  assert.match(text, /POST \/v3\/transfers[\s\S]{0,400}"quoteId"/i);
  assert.match(text, /`data\.state`, `data\.stateDetail`, and `data\.openTaskIds`/i);
  assert.match(text, /current `revision`[\s\S]{0,160}current `requirements`/i);
  assert.match(text, /`data\.instructions`[\s\S]{0,220}`reference\.required`[\s\S]{0,160}`reference\.value`/i);
  assert.doesNotMatch(text, /## (?:Cancel|Cancellation)|transfer_not_cancelable/i);
  assert.equal(linkCount(text, "/integration/api-reliability"), 1);
});

test("automated rules covers prerequisites, target choice, current state, update, and archive", () => {
  const text = readPage("integration/rules");
  headingOrder(text, ["Before you start", "Choose the trigger and target", "Create the rule", "Inspect the current rule", "Update or archive the rule", "Next step"]);
  assert.match(text, /not every account or capability supports every rule/i);
  assert.match(text, /`funds_received`/);
  assert.match(text, /`account`[\s\S]{0,220}`destination`/i);
  assert.match(text, /Store `data\.id` as the rule ID and `data\.status`/i);
  assert.match(text, /refetch|read the current rule/i);
  assert.match(text, /archive/i);
  assert.equal(linkCount(text, "/integration/api-reliability"), 1);
});

test("keeps public workflow prose concise, current, and free of retired guidance", () => {
  const bounds = new Map([
    ["integration/common-flows", [80, 300]],
    ["integration/accounts", [350, 900]],
    ["integration/issue-bank-account", [300, 900]],
    ["integration/recipients", [300, 900]],
    ["integration/receive-funds", [350, 900]],
    ["integration/send-funds", [350, 900]],
    ["integration/quotes-and-transfers", [350, 900]],
    ["integration/rules", [300, 900]],
  ]);
  for (const page of PAGES) {
    const text = readPage(page);
    const words = proseWordCount(text);
    const [minimum, maximum] = bounds.get(page);
    assert.ok(words >= minimum, `${page}.mdx is too short for its required workflow (${words})`);
    assert.ok(words <= maximum, `${page}.mdx is too long for a focused guide (${words})`);
    assert.doesNotMatch(
      text,
      /\/integration\/(?:request-safety|onboarding\/(?:tasks-and-submissions|documents|individuals|businesses))\b/,
    );
    assert.doesNotMatch(
      text,
      /\b(?:provider|source precedence|contract audit|migration|docs generation|SDK)\b|openapi-(?:coverage|provenance)\.json/i,
    );
    assert.doesNotMatch(text, /(^|[^A-Za-z0-9])v[12](?=$|[^A-Za-z0-9])/i);
    assert.doesNotMatch(text, /\b[\w.-]+\.json\b/i);
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      if (!match[1].startsWith("/")) continue;
      assert.doesNotMatch(match[1], /\.mdx?(?:#|$)/);
    }
  }
});
