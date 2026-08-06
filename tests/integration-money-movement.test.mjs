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

const CORRECTED_PAGES = [
  "integration/accounts",
  "integration/issue-bank-account",
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
      ["get", "/v3/customers/{customerId}/accounts/{accountId}"],
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
      ["get", "/v3/customers/{customerId}/rules"],
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
  STABLECOIN_CAPABILITY_ID: "stablecoin_transfers",
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
    capabilityId: "${STABLECOIN_CAPABILITY_ID}",
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
    ...(resolved.items ? expandSchemas(resolved.items, seen) : []),
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

function sectionText(text, heading) {
  const start = text.indexOf(`## ${heading}`);
  assert.ok(start >= 0, `Missing section ${heading}`);
  const next = text.indexOf("\n## ", start + heading.length + 3);
  return text.slice(start, next >= 0 ? next : undefined);
}

function matchPosition(text, pattern, message) {
  const match = text.match(pattern);
  assert.ok(match, message);
  return match.index;
}

function assertAccountOwnershipSemantics(text) {
  assert.match(text, /customer-scoped|scoped to (?:one|a) customer/i);
  assert.match(text, /`issued` resources[\s\S]{0,100}platform-issued[\s\S]{0,100}custodial/i);
  assert.match(text, /`external` resources[\s\S]{0,100}(?:record|represent)[\s\S]{0,100}customer-owned endpoints/i);
  assert.doesNotMatch(
    text,
    /(?:all|every) accounts? (?:are|is) customer-owned|Use accounts for endpoints the customer owns|customer-owned wallet and bank accounts/i,
  );
}

function assertResponseDerivedQuoteCapabilityIds(pages, read = readPage) {
  let quoteExampleCount = 0;
  for (const page of pages) {
    for (const body of jsonBlocks(read(page))) {
      if (!Object.hasOwn(body, "capabilityId")) continue;
      quoteExampleCount += 1;
      assert.equal(typeof body.capabilityId, "string", `${page}.mdx capabilityId must be a string`);
      assert.match(
        body.capabilityId,
        /^\$\{[A-Z0-9_]*CAPABILITY_ID\}$/,
        `${page}.mdx quote capabilityId must come from a capability response`,
      );
    }
  }
  assert.ok(quoteExampleCount > 0, "Expected public quote request examples");
}

function assertAwaitingAssignmentFlow(text) {
  const branch = matchPosition(
    text,
    /If the latest account read returns `statusReason\.code` (?:as|equal to) `awaiting_assignment`/i,
    "The pooled assignment branch must depend on the latest statusReason.code",
  );
  const firstPayIn = matchPosition(text, /first pay-in/i, "The assignment branch must create the first pay-in");
  const sameResources = matchPosition(
    text,
    /same customer, capability, and settlement wallet/i,
    "The first pay-in must reuse the bank account's customer, capability, and settlement wallet",
  );
  const receiveFunds = text.indexOf("[Receive funds](/integration/receive-funds)", branch);
  const refetch = matchPosition(
    text,
    /then refetch the bank account/i,
    "The assignment branch must refetch the bank account",
  );
  const present = matchPosition(
    text,
    /before presenting reusable details/i,
    "The assignment branch must refetch before presenting reusable details",
  );
  assert.ok(receiveFunds >= 0, "The assignment branch must link Receive funds");
  const positions = [branch, firstPayIn, sameResources, receiveFunds, refetch, present];
  assert.deepEqual(positions, positions.toSorted((left, right) => left - right));
  assert.doesNotMatch(text, /all issued (?:bank )?accounts? (?:require|must|need)[^.]*first pay-in/i);
  assert.doesNotMatch(text, /poll indefinitely|keep polling|poll until/i);
}

function assertQuoteCompatibility(text) {
  const compatibility = sectionText(text, "Check resource compatibility");
  assert.match(
    compatibility,
    /current capability is `ready`[\s\S]{0,120}belongs to the customer[\s\S]{0,100}(?:flow|movement)/i,
  );
  assert.match(
    compatibility,
    /source is an active `issued` custodial account[\s\S]{0,120}status is `ready`[\s\S]{0,120}input currency/i,
  );
  assert.match(
    compatibility,
    /stablecoin[\s\S]{0,120}source and destination[\s\S]{0,100}same currency and network/i,
  );
  assert.match(
    compatibility,
    /fiat payout destination[\s\S]{0,120}(?:current and )?`ready`[\s\S]{0,120}output currency and method/i,
  );
}

function assertExactOutFundingGate(text) {
  const stablecoinScope = matchPosition(
    text,
    /After a stablecoin-funded exact-out quote returns/i,
    "The source-account balance gate must apply only to stablecoin-funded exact-out quotes",
  );
  const exactOutGateSentences = text.match(
    /[^.!?\n]*\bexact-out quotes?\b[^.!?\n]*(?:source-account balance gate|source account|available balance)[^.!?\n]*[.!?]?/gi,
  ) ?? [];
  for (const sentence of exactOutGateSentences) {
    const universalScope =
      /\b(?:all|every|any|each)\s+exact-out quotes?\b/i.test(sentence) ||
      /\bexact-out quotes?\b[^.!?\n]{0,80}\balways\b/i.test(sentence);
    const negatedUniversalScope =
      /\b(?:not|never)\s+(?:all|every|any|each)\s+exact-out quotes?\b/i.test(sentence) ||
      /\bexact-out quotes?\b[^.!?\n]{0,80}\b(?:do not|don't|never)\s+always\b/i.test(
        sentence,
      );
    assert.ok(
      !universalScope || negatedUniversalScope,
      "The source-account balance gate must not apply to every exact-out quote",
    );
  }
  const fiatGateSentences = text.match(
    /[^.!?\n]*\bfiat-funded exact-out quotes?\b[^.!?\n]*(?:source-account balance gate|source account|available balance)[^.!?\n]*[.!?]?/gi,
  ) ?? [];
  assert.ok(fiatGateSentences.length >= 1, "The guide must explain the fiat-funded exemption");
  for (const sentence of fiatGateSentences) {
    const scopedExemption =
      /\b(?:do not|don't|never)\s+(?:use|apply|require|need|check)\b/i.test(sentence) ||
      /\b(?:are|is)\s+not\s+(?:subject to|required to use|gated by)\b/i.test(sentence) ||
      /\b(?:are|is)\s+exempt\b/i.test(sentence);
    assert.ok(
      scopedExemption,
      "Fiat-funded exact-out guidance must not require a source-account balance gate",
    );
  }
  const accountRead = text.indexOf(
    operationMarkdown("get", "/v3/customers/{customerId}/accounts/{accountId}"),
    stablecoinScope,
  );
  const availableBalance = matchPosition(
    text,
    /current source account[\s\S]{0,140}`balances\[\]\.available`/i,
    "Exact-out guidance must read the current available source balance",
  );
  const comparison = matchPosition(
    text,
    /compare[\s\S]{0,140}`data\.in\.amount`/i,
    "Exact-out guidance must compare balance with returned data.in.amount",
  );
  const insufficient = matchPosition(
    text,
    /If (?:that|the available) balance is insufficient[\s\S]{0,160}(?:fund|change|choose another) (?:the )?source/i,
    "Exact-out guidance must handle an insufficient source balance",
  );
  const requote = matchPosition(
    text,
    /after (?:the )?resources? change[\s\S]{0,120}(?:create|get) a new quote/i,
    "Exact-out guidance must require a new quote after resources change",
  );
  const fiatExemption = matchPosition(
    text,
    /Fiat-funded exact-out quotes do not use this source-account balance gate[\s\S]{0,120}`in\.accountId`[\s\S]{0,80}ignored for fiat funding/i,
    "Fiat-funded exact-out quotes must be exempt because in.accountId is ignored",
  );
  const execute = text.indexOf("## Execute before expiry");
  assert.ok(accountRead >= 0, "Exact-out guidance must link the current account read");
  assert.ok(execute >= 0, "Missing transfer execution section");
  const positions = [
    stablecoinScope,
    accountRead,
    availableBalance,
    comparison,
    insufficient,
    requote,
    fiatExemption,
    execute,
  ];
  assert.deepEqual(positions, positions.toSorted((left, right) => left - right));
}

function assertRuleReplacementSemantics(text) {
  const list = text.indexOf(operationMarkdown("get", "/v3/customers/{customerId}/rules"));
  const create = text.indexOf("## Create the rule");
  assert.ok(list >= 0 && list < create, "List current rules before rule creation");
  assert.doesNotMatch(text, /capabilit/i);
  assert.match(
    text,
    /pause[\s\S]{0,100}temporarily suspends[\s\S]{0,100}same rule[\s\S]{0,100}remains non-archived/i,
  );
  assert.match(
    text,
    /replace a rule on the same trigger[\s\S]{0,140}archive the existing rule first[\s\S]{0,140}create the replacement/i,
  );
  assert.doesNotMatch(
    text,
    /(?:pause|paused|pausing)[^.\n]{0,120}before[^.\n]{0,100}(?:create|creating)[^.\n]{0,60}replacement/i,
  );
}

test("publishes the complete money-movement guide set in navigation order", () => {
  assertPages(PAGES);
  const integration = config.navigation.tabs.find((tab) => tab.tab === "Integration Docs");
  const group = integration?.groups.find((candidate) => candidate.group === "Build money flows");
  assert.deepEqual(group?.pages, PAGES);

  const common = readPage("integration/common-flows");
  assert.match(common, /^title: "Common flows"$/m);
  const issue = readPage("integration/issue-bank-account");
  assert.match(issue, /^title: "Issue a bank account"$/m);
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

test("uses response-derived capability IDs in public quote request examples", () => {
  assertResponseDerivedQuoteCapabilityIds(CORRECTED_PAGES);
});

test("quote capability validation rejects a literal capability ID", () => {
  const page = "integration/quotes-and-transfers";
  const text = readPage(page);
  const mutated = text.replace(
    /"capabilityId": "\$\{[A-Z0-9_]*CAPABILITY_ID\}"/,
    '"capabilityId": "stablecoin_transfers"',
  );
  assert.notEqual(mutated, text, "Response-derived capability fixture must exist");
  assert.throws(
    () =>
      assertResponseDerivedQuoteCapabilityIds(CORRECTED_PAGES, (candidate) =>
        candidate === page ? mutated : readPage(candidate),
      ),
    /must come from a capability response/,
  );
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
    "data.statusReason.code",
    "data.statusReason.message",
    "data.statusReason.retryable",
    "data.details",
    "data.settlement.accountId",
  ]);
  assertResponseFields("get", "/v3/customers/{customerId}/accounts/{accountId}", "200", [
    "data.balances.currency",
    "data.balances.available",
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
  assertResponseFields("post", "/v3/quotes", "201", [
    "data.id",
    "data.status",
    "data.expiresAt",
    "data.in.amount",
  ]);
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

test("anchors account ownership and pooled assignment in OpenAPI", () => {
  const createAccount = openApiOperation("post", "/v3/customers/{customerId}/accounts");
  assert.match(
    createAccount.description,
    /`origin: "issued"` for platform-issued[\s\S]*`origin: "external"` for customer-owned/i,
  );
  const issuedBankExample = createAccount.responses?.["201"]?.content?.["application/json"]
    ?.examples?.issuedAch?.description;
  assert.match(
    issuedBankExample,
    /pooled ACH[\s\S]*`awaiting_assignment`[\s\S]*first payin/i,
  );
});

test("derives rule uniqueness, update, and archive behavior from OpenAPI", () => {
  const create = openApiOperation("post", "/v3/customers/{customerId}/rules");
  const update = openApiOperation("patch", "/v3/customers/{customerId}/rules/{ruleId}");
  const archive = openApiOperation("delete", "/v3/customers/{customerId}/rules/{ruleId}");
  assert.match(create.description, /At most one non-archived rule may watch a given trigger account/i);

  const updateRequest = resolveReference(update.requestBody);
  const updateSchema = resolveReference(updateRequest.content?.["application/json"]?.schema);
  const updateStatus = resolveReference(updateSchema.properties?.status);
  assert.deepEqual(updateStatus.enum, ["active", "paused"]);
  assert.match(updateStatus.description, /Archiving is terminal[\s\S]*DELETE/i);
  assert.match(archive.description, /terminal[\s\S]*frees the trigger account for a new rule/i);

  const listSchema = resolveReference(
    responseSchema("get", "/v3/customers/{customerId}/rules", "200"),
  );
  const ruleItems = resolveReference(resolveReference(listSchema.properties?.data).items);
  assert.deepEqual(ruleItems.properties?.status?.enum, ["active", "paused", "archived"]);
  assert.ok(ruleItems.required?.includes("archivedAt"));
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
  assertAccountOwnershipSemantics(text);
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

test("account ownership validation rejects the all-customer-owned polarity", () => {
  const text = readPage("integration/accounts");
  const mutated = `${text}\nEvery account is customer-owned.\n`;
  assert.throws(() => assertAccountOwnershipSemantics(mutated));
});

test("issued bank account follows settlement, provisioning, and safe presentation order", () => {
  const text = readPage("integration/issue-bank-account");
  assertAwaitingAssignmentFlow(text);
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

test("pooled assignment validation rejects a universal or indefinite-polling branch", () => {
  const text = readPage("integration/issue-bank-account");
  const universal = `${text}\nAll issued bank accounts require this first pay-in branch.\n`;
  assert.throws(() => assertAwaitingAssignmentFlow(universal));

  const polling = `${text}\nKeep polling indefinitely.\n`;
  assert.throws(() => assertAwaitingAssignmentFlow(polling));
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

test("quotes define the contract-critical resource compatibility predicates", () => {
  assertQuoteCompatibility(readPage("integration/quotes-and-transfers"));
});

test("stablecoin-funded exact-out quotes gate execution on the current available source balance", () => {
  assertExactOutFundingGate(readPage("integration/quotes-and-transfers"));
});

test("quote compatibility validation rejects generic resource guidance", () => {
  const text = readPage("integration/quotes-and-transfers");
  const heading = "## Check resource compatibility";
  const mutated = text.includes(heading)
    ? text.replace(
        sectionText(text, "Check resource compatibility"),
        `${heading}\n\nUse compatible resources.\n`,
      )
    : `${text}\n${heading}\n\nUse compatible resources.\n`;
  assert.throws(() => assertQuoteCompatibility(mutated));
});

test("exact-out execution validation rejects a missing balance check", () => {
  const text = readPage("integration/quotes-and-transfers");
  const withoutGate = text.replace(
    /After (?:a stablecoin-funded|an|every) exact-out quote returns[\s\S]*?(?=\n## Execute before expiry)/i,
    "Execute an exact-out quote directly from its returned amount.\n",
  );
  const mutated = withoutGate === text
    ? `${text}\nAfter an exact-out quote returns, execute it without another source read.\n`
    : withoutGate;
  assert.throws(() => assertExactOutFundingGate(mutated));
});

test("exact-out funding validation rejects universal and fiat balance gates", () => {
  const text = readPage("integration/quotes-and-transfers");
  for (const claim of [
    "After every exact-out quote returns, use the source-account balance gate.",
    "All exact-out quotes, including fiat-funded quotes, must use the source-account balance gate.",
    "Exact-out quotes always use the source-account balance gate.",
    "Each exact-out quote must use the source-account balance gate.",
    "Fiat-funded exact-out quotes must use the source-account balance gate before execution.",
    "Fiat-funded exact-out quotes must not skip the source-account balance gate.",
    "Fiat-funded exact-out quotes must use the source-account balance gate; this is not optional.",
  ]) {
    assert.throws(
      () => assertExactOutFundingGate(`${text}\n${claim}\n`),
      { name: "AssertionError" },
      `Expected universal exact-out claim to fail: ${claim}`,
    );
  }
  assert.doesNotThrow(() =>
    assertExactOutFundingGate(
      `${text}\nNot all exact-out quotes use the source-account balance gate.\n`,
    ),
  );
});

test("automated rules covers prerequisites, target choice, current state, update, and archive", () => {
  const text = readPage("integration/rules");
  assertRuleReplacementSemantics(text);
  headingOrder(text, ["Before you start", "Choose the trigger and target", "Create the rule", "Inspect the current rule", "Update or archive the rule", "Next step"]);
  assert.match(text, /current[\s\S]{0,120}(?:trigger|target)[\s\S]{0,160}eligible/i);
  assert.match(text, /`funds_received`/);
  assert.match(text, /`account`[\s\S]{0,220}`destination`/i);
  assert.match(text, /Store `data\.id` as the rule ID and `data\.status`/i);
  assert.match(text, /refetch|read the current rule/i);
  assert.match(text, /archive/i);
  assert.equal(linkCount(text, "/integration/api-reliability"), 1);
});

test("rule prerequisites use current eligible resources without a capability gate", () => {
  const text = readPage("integration/rules");
  assert.match(text, /current[\s\S]{0,120}(?:trigger|target)[\s\S]{0,160}eligible/i);
  assert.doesNotMatch(text, /capabilit/i);
});

test("rule lifecycle keeps pause non-archived and archives before replacement", () => {
  const text = readPage("integration/rules");
  assert.match(
    text,
    /pause[\s\S]{0,100}temporarily suspends[\s\S]{0,100}same rule[\s\S]{0,100}remains non-archived/i,
  );
  assert.match(
    text,
    /replace a rule on the same trigger[\s\S]{0,140}archive the existing rule first[\s\S]{0,140}create the replacement/i,
  );
});

test("rule replacement validation rejects pause-before-replacement guidance", () => {
  const text = readPage("integration/rules");
  const mutated = `${text}\nPause the existing rule before creating the replacement.\n`;
  assert.throws(() => assertRuleReplacementSemantics(mutated));
});

test("keeps public workflow prose concise, current, and free of retired guidance", () => {
  const maximums = new Map([
    ["integration/common-flows", 300],
    ["integration/accounts", 900],
    ["integration/issue-bank-account", 900],
    ["integration/recipients", 900],
    ["integration/receive-funds", 900],
    ["integration/send-funds", 900],
    ["integration/quotes-and-transfers", 900],
    ["integration/rules", 900],
  ]);
  for (const page of PAGES) {
    const text = readPage(page);
    const words = proseWordCount(text);
    const maximum = maximums.get(page);
    assert.ok(words <= maximum, `${page}.mdx is too long for a focused guide (${words})`);
    assert.match(text, /^## Next step$/m, `${page}.mdx must end with a next developer action`);
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
