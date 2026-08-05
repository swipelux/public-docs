import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { collectNavigationPages } from "../scripts/lib/docs-validation.mjs";
import { assertPages, readPage } from "./helpers/content.mjs";

const PAGES = [
  "integration/accounts",
  "integration/recipients",
  "integration/quotes-and-transfers",
  "integration/receive-funds",
  "integration/send-funds",
  "integration/rules",
];

const PAGE_OPERATIONS = new Map([
  [
    "integration/accounts",
    [
      ["post", "/v3/customers/{customerId}/accounts"],
      ["get", "/v3/customers/{customerId}/accounts"],
      ["get", "/v3/customers/{customerId}/accounts/{accountId}"],
      ["get", "/v3/customers/{customerId}/accounts/{accountId}/fees"],
      ["put", "/v3/customers/{customerId}/accounts/{accountId}/fees"],
      ["patch", "/v3/customers/{customerId}/accounts/{accountId}"],
      ["delete", "/v3/customers/{customerId}/accounts/{accountId}"],
    ],
  ],
  [
    "integration/recipients",
    [
      ["post", "/v3/customers/{customerId}/recipients"],
      ["get", "/v3/customers/{customerId}/recipients"],
      ["get", "/v3/customers/{customerId}/recipients/{recipientId}"],
      ["patch", "/v3/customers/{customerId}/recipients/{recipientId}"],
      ["delete", "/v3/customers/{customerId}/recipients/{recipientId}"],
      [
        "post",
        "/v3/customers/{customerId}/recipients/{recipientId}/destinations",
      ],
      [
        "get",
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
    "integration/quotes-and-transfers",
    [
      ["post", "/v3/quotes"],
      ["get", "/v3/quotes/{quoteId}"],
      ["post", "/v3/transfers"],
      ["get", "/v3/transfers"],
      ["get", "/v3/transfers/{transferId}"],
      ["get", "/v3/transfers/{transferId}/tasks"],
      ["get", "/v3/transfers/{transferId}/instructions"],
      ["post", "/v3/transfers/{transferId}/cancel"],
    ],
  ],
  [
    "integration/receive-funds",
    [
      ["post", "/v3/quotes"],
      ["post", "/v3/transfers"],
      ["get", "/v3/transfers"],
      ["get", "/v3/transfers/{transferId}"],
      ["get", "/v3/transfers/{transferId}/instructions"],
    ],
  ],
  [
    "integration/send-funds",
    [
      ["post", "/v3/quotes"],
      ["post", "/v3/transfers"],
      ["get", "/v3/transfers/{transferId}"],
      ["get", "/v3/transfers/{transferId}/instructions"],
    ],
  ],
  [
    "integration/rules",
    [
      ["post", "/v3/customers/{customerId}/rules"],
      ["get", "/v3/customers/{customerId}/rules"],
      ["get", "/v3/customers/{customerId}/rules/{ruleId}"],
      ["patch", "/v3/customers/{customerId}/rules/{ruleId}"],
      ["delete", "/v3/customers/{customerId}/rules/{ruleId}"],
    ],
  ],
]);

const WRITE_OPERATIONS = new Map([
  [
    "integration/accounts",
    [
      ["post", "/v3/customers/{customerId}/accounts"],
      ["put", "/v3/customers/{customerId}/accounts/{accountId}/fees"],
      ["patch", "/v3/customers/{customerId}/accounts/{accountId}"],
      ["delete", "/v3/customers/{customerId}/accounts/{accountId}"],
    ],
  ],
  [
    "integration/recipients",
    [
      ["post", "/v3/customers/{customerId}/recipients"],
      ["patch", "/v3/customers/{customerId}/recipients/{recipientId}"],
      ["delete", "/v3/customers/{customerId}/recipients/{recipientId}"],
      [
        "post",
        "/v3/customers/{customerId}/recipients/{recipientId}/destinations",
      ],
      [
        "delete",
        "/v3/customers/{customerId}/recipients/{recipientId}/destinations/{destinationId}",
      ],
    ],
  ],
  [
    "integration/quotes-and-transfers",
    [
      ["post", "/v3/quotes"],
      ["post", "/v3/transfers"],
      ["post", "/v3/transfers/{transferId}/cancel"],
    ],
  ],
  [
    "integration/receive-funds",
    [
      ["post", "/v3/quotes"],
      ["post", "/v3/transfers"],
    ],
  ],
  [
    "integration/send-funds",
    [
      ["post", "/v3/quotes"],
      ["post", "/v3/transfers"],
    ],
  ],
  [
    "integration/rules",
    [
      ["post", "/v3/customers/{customerId}/rules"],
      ["patch", "/v3/customers/{customerId}/rules/{ruleId}"],
      ["delete", "/v3/customers/{customerId}/rules/{ruleId}"],
    ],
  ],
]);

const config = JSON.parse(readFileSync("docs.json", "utf8"));
const coverage = JSON.parse(readFileSync("openapi-coverage.json", "utf8"));
const openapi = JSON.parse(readFileSync("openapi.json", "utf8"));

function pageFile(page) {
  return `${page}.mdx`;
}

function requiredPage(page) {
  assert.ok(existsSync(pageFile(page)), `Missing page: ${pageFile(page)}`);
  return readPage(page);
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

function coveredOperation(method, path) {
  const matches = coverage.operations.filter(
    (candidate) => candidate.method === method && candidate.path === path,
  );
  assert.equal(
    matches.length,
    1,
    `Expected one coverage operation for ${method.toUpperCase()} ${path}`,
  );
  const { operationObject } = openApiOperation(method, path);
  assert.equal(
    operationObject["x-mint"]?.href,
    matches[0].href,
    `${method.toUpperCase()} ${path} coverage href must match x-mint.href`,
  );
  return matches[0];
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

function requestBody(method, path) {
  const { operationObject } = openApiOperation(method, path);
  return resolveOpenApiReference(operationObject.requestBody);
}

function requestBodySchema(method, path) {
  const body = requestBody(method, path);
  assert.ok(body, `Missing request body for ${method.toUpperCase()} ${path}`);
  const schema = body.content?.["application/json"]?.schema;
  assert.ok(
    schema,
    `Missing application/json request schema for ${method.toUpperCase()} ${path}`,
  );
  return resolveOpenApiReference(schema);
}

function responseObject(method, path, status) {
  const { operationObject } = openApiOperation(method, path);
  const response = resolveOpenApiReference(operationObject.responses?.[status]);
  assert.ok(response, `Missing ${status} response for ${method.toUpperCase()} ${path}`);
  return response;
}

function responseSchema(method, path, status = "200") {
  const response = responseObject(method, path, status);
  const schema = response.content?.["application/json"]?.schema;
  assert.ok(
    schema,
    `Missing application/json schema for ${method.toUpperCase()} ${path} ${status}`,
  );
  return resolveOpenApiReference(schema);
}

function responseDataSchema(method, path, status = "200") {
  const envelope = responseSchema(method, path, status);
  assert.ok(
    envelope.required?.includes("data"),
    `${method.toUpperCase()} ${path} ${status} must require data`,
  );
  return resolveOpenApiReference(envelope.properties?.data);
}

function responseHeader(method, path, status, headerName) {
  const response = responseObject(method, path, status);
  const match = Object.entries(response.headers ?? {}).find(
    ([name]) => name.toLowerCase() === headerName.toLowerCase(),
  );
  return match ? resolveOpenApiReference(match[1]) : undefined;
}

function successStatuses(method, path) {
  const { operationObject } = openApiOperation(method, path);
  return Object.keys(operationObject.responses).filter((status) => {
    const numeric = Number(status);
    return Number.isInteger(numeric) && numeric >= 200 && numeric < 300;
  });
}

function documentsReplayHeader(method, path) {
  return successStatuses(method, path).some(
    (status) => responseHeader(method, path, status, "Idempotency-Replayed") !== undefined,
  );
}

function enumValues(schema, seen = new Set()) {
  if (!schema || typeof schema !== "object" || seen.has(schema)) return [];
  seen.add(schema);
  const resolved = resolveOpenApiReference(schema);
  const values = [
    ...(resolved.enum ?? []),
    ...(Object.hasOwn(resolved, "const") ? [resolved.const] : []),
  ];
  for (const key of ["oneOf", "anyOf", "allOf"]) {
    for (const branch of resolved[key] ?? []) {
      values.push(...enumValues(branch, seen));
    }
  }
  return [...new Set(values)];
}

function problemCodes(method, path, status) {
  const response = responseObject(method, path, status);
  const media = response.content?.["application/problem+json"];
  assert.ok(
    media,
    `Missing application/problem+json for ${method.toUpperCase()} ${path} ${status}`,
  );
  const schema = resolveOpenApiReference(media.schema);
  return [
    ...enumValues(schema.properties?.code),
    ...Object.values(media.examples ?? {}).map((example) => example.value?.code),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

function assertExactSet(actual, expected, label) {
  assert.ok(Array.isArray(actual), `${label} must be an array`);
  assert.equal(new Set(actual).size, actual.length, `${label} has duplicates`);
  assert.deepEqual(
    actual.toSorted(),
    expected.toSorted(),
    `${label} must contain exactly the expected values`,
  );
}

function unique(values) {
  return [...new Set(values)];
}

function operationMarkdown(method, path) {
  const { href } = coveredOperation(method, path);
  return `[\`${method.toUpperCase()} ${path}\`](${href})`;
}

function assertRequiredOperationLinks(page, operations) {
  const text = requiredPage(page);
  for (const [method, path] of operations) {
    assert.ok(
      text.includes(operationMarkdown(method, path)),
      `${pageFile(page)} must bind ${method.toUpperCase()} ${path} to its coverage href`,
    );
  }
}

function linkedOperationLabels(text) {
  return [
    ...text.matchAll(
      /\[\`(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS|TRACE) (\/v3\/[^`]+)\`\]\(([^)]+)\)/g,
    ),
  ].map((match) => ({
    end: match.index + match[0].length,
    href: match[3],
    method: match[1].toLowerCase(),
    path: match[2],
    start: match.index,
  }));
}

function assertEveryOperationLabelIsCoverageLinked(label, text) {
  const links = linkedOperationLabels(text);
  const labels = [
    ...text.matchAll(
      /\`(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS|TRACE) (\/v3\/[^`]+)\`/g,
    ),
  ];

  for (const match of labels) {
    assert.ok(
      links.some(
        (link) => match.index >= link.start && match.index + match[0].length <= link.end,
      ),
      `${label} has an unlinked operation label: ${match[0]}`,
    );
  }

  for (const link of links) {
    const expected = coveredOperation(link.method, link.path);
    assert.equal(
      link.href,
      expected.href,
      `${label} links ${link.method.toUpperCase()} ${link.path} to the wrong href`,
    );
  }
}

function proseSemanticUnits(text) {
  const units = [];
  let current = [];
  const flush = () => {
    if (current.length > 0) units.push(current.join("\n").trim());
    current = [];
  };

  for (const rawLine of text
    .replace(/```[^\n]*\n[\s\S]*?```/g, "")
    .split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (/^\s*(?:[-*+]|\d+[.)])\s+/.test(line)) {
      flush();
      current.push(line.trim());
      continue;
    }
    current.push(line.trim());
  }
  flush();
  return units;
}

function assertOperationSafetyAssociationsInText(label, text, operations) {
  const units = proseSemanticUnits(text);

  for (const [method, path] of operations) {
    const markdown = operationMarkdown(method, path);
    const safetyUnits = units.filter(
      (unit) =>
        unit.includes(markdown) && unit.includes("`Idempotency-Key`"),
    );
    assert.equal(
      safetyUnits.length,
      1,
      `${label} must contain exactly one safety semantic unit for ${method.toUpperCase()} ${path}`,
    );
    const [safetyUnit] = safetyUnits;
    assert.deepEqual(
      linkedOperationLabels(safetyUnit).map(({ method: linkedMethod, path: linkedPath }) => [
        linkedMethod,
        linkedPath,
      ]),
      [[method, path]],
      `${label} safety semantic unit for ${method.toUpperCase()} ${path} must contain only that operation link`,
    );
    const replayInput = requestBody(method, path) ? "body" : "request";
    assert.match(
      safetyUnit,
      new RegExp(`same ${replayInput}\\b`, "i"),
      `${label} must replay the same ${replayInput} for ${method.toUpperCase()} ${path}`,
    );

    if (documentsReplayHeader(method, path)) {
      assert.match(
        safetyUnit,
        /`Idempotency-Replayed: true`/,
        `${label} must associate Idempotency-Replayed: true with ${method.toUpperCase()} ${path}`,
      );
    } else {
      assert.match(
        safetyUnit,
        /does not document `Idempotency-Replayed`/i,
        `${label} must not borrow Idempotency-Replayed for ${method.toUpperCase()} ${path}`,
      );
    }
  }
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

function labeledCodeValues(text, label) {
  const prefix = `- **${label}:**`;
  const lines = text.split("\n").filter((line) => line.startsWith(prefix));
  assert.equal(lines.length, 1, `Expected one ${label} vocabulary line`);
  return [...lines[0].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function internalLinks(text) {
  return [
    ...[...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]),
    ...[...text.matchAll(/\bhref=(?:"([^"]+)"|'([^']+)')/g)].map(
      (match) => match[1] ?? match[2],
    ),
  ].filter((href) => href.startsWith("/"));
}

test("publishes all money-movement pages once with valid guarded MDX", () => {
  assertPages(PAGES);

  const navigationPages = collectNavigationPages(config.navigation);
  for (const page of PAGES) {
    assert.equal(
      navigationPages.filter((candidate) => candidate === page).length,
      1,
      `${page} must appear in navigation exactly once`,
    );
    const text = readPage(page);
    assert.doesNotMatch(text, /^\s*import\s/m, `${page} must use built-in MDX only`);
    assert.equal(
      [...text.matchAll(/```(?:bash|sh|shell)\n/g)].length,
      0,
      `${page} must use contract JSON examples instead of shell`,
    );
  }
});

test("semantic checks reject swapped links and idempotency associations", () => {
  const accountCreate = coveredOperation(
    "post",
    "/v3/customers/{customerId}/accounts",
  );
  const transferCreate = coveredOperation("post", "/v3/transfers");
  assert.notEqual(accountCreate.href, transferCreate.href);

  assert.throws(
    () =>
      assertEveryOperationLabelIsCoverageLinked(
        "swapped link fixture",
        `[\`POST /v3/customers/{customerId}/accounts\`](${transferCreate.href})`,
      ),
    /wrong href/,
  );

  const swappedSafety = [
    `${operationMarkdown("post", "/v3/quotes")} requires \`Idempotency-Key\`; replay the same body. This operation does not document \`Idempotency-Replayed\`.`,
    `${operationMarkdown("post", "/v3/transfers/{transferId}/cancel")} requires \`Idempotency-Key\`; replay the same request. A replay returns \`Idempotency-Replayed: true\`.`,
  ].join("\n\n");
  assert.throws(
    () =>
      assertOperationSafetyAssociationsInText("swapped safety fixture", swappedSafety, [
        ["post", "/v3/quotes"],
        ["post", "/v3/transfers/{transferId}/cancel"],
      ]),
    /Idempotency-Replayed/,
  );

  assert.deepEqual(proseSemanticUnits("- first safety item\n- second safety item"), [
    "- first safety item",
    "- second safety item",
  ]);

  const quoteSafety = operationMarkdown("post", "/v3/quotes");
  const cancelSafety = operationMarkdown(
    "post",
    "/v3/transfers/{transferId}/cancel",
  );
  const wrongBody = [
    `- ${quoteSafety} requires \`Idempotency-Key\`; replay the same request. A replay returns \`Idempotency-Replayed: true\`.`,
    `- ${cancelSafety} requires \`Idempotency-Key\`; replay the same request. This operation does not document \`Idempotency-Replayed\`.`,
  ].join("\n");
  assert.throws(
    () =>
      assertOperationSafetyAssociationsInText("wrong body fixture", wrongBody, [
        ["post", "/v3/quotes"],
        ["post", "/v3/transfers/{transferId}/cancel"],
      ]),
    /same body/,
  );

  const wrongRequest = [
    `- ${quoteSafety} requires \`Idempotency-Key\`; replay the same body. A replay returns \`Idempotency-Replayed: true\`.`,
    `- ${cancelSafety} requires \`Idempotency-Key\`; replay the same body. This operation does not document \`Idempotency-Replayed\`.`,
  ].join("\n");
  assert.throws(
    () =>
      assertOperationSafetyAssociationsInText(
        "wrong request fixture",
        wrongRequest,
        [
          ["post", "/v3/quotes"],
          ["post", "/v3/transfers/{transferId}/cancel"],
        ],
      ),
    /same request/,
  );

  const wrongReplay = [
    `- ${quoteSafety} requires \`Idempotency-Key\`; replay the same body. This operation does not document \`Idempotency-Replayed\`.`,
    `- ${cancelSafety} requires \`Idempotency-Key\`; replay the same request. A replay returns \`Idempotency-Replayed: true\`.`,
  ].join("\n");
  assert.throws(
    () =>
      assertOperationSafetyAssociationsInText(
        "wrong replay fixture",
        wrongReplay,
        [
          ["post", "/v3/quotes"],
          ["post", "/v3/transfers/{transferId}/cancel"],
        ],
      ),
    /Idempotency-Replayed/,
  );
});

test("links every operation label to its exact coverage and x-mint href", () => {
  for (const [page, operations] of PAGE_OPERATIONS) {
    assertRequiredOperationLinks(page, operations);
    assertEveryOperationLabelIsCoverageLinked(pageFile(page), requiredPage(page));
  }
});

test("documents exact account unions, settlement, states, examples, and lifecycle", () => {
  const path = "/v3/customers/{customerId}/accounts";
  const create = openApiOperation("post", path).operationObject;
  assert.equal(requestBody("post", path).required, true);
  const schema = requestBodySchema("post", path);
  assertExactSet(
    schema.oneOf.map((variant) => variant.title),
    [
      "Issued wallet account",
      "External wallet account",
      "Issued ACH account",
      "Issued wire account",
      "Issued SEPA account",
      "Issued SWIFT account",
      "Issued UAEFTS account",
      "Issued Faster Payments account",
      "Issued SEPA Instant account",
      "Issued IPP account",
      "External ACH/wire account",
      "External SEPA account",
      "External SWIFT account",
    ],
    "account create variants",
  );
  assertExactSet(
    unique(schema.oneOf.flatMap((variant) => enumValues(variant.properties.origin))),
    ["issued", "external"],
    "account origins",
  );
  assertExactSet(
    unique(schema.oneOf.flatMap((variant) => enumValues(variant.properties.type))),
    ["wallet", "bank"],
    "account types",
  );

  const issuedBanks = schema.oneOf.filter(
    (variant) =>
      enumValues(variant.properties.origin).includes("issued") &&
      enumValues(variant.properties.type).includes("bank"),
  );
  assert.equal(issuedBanks.length, 8);
  for (const variant of issuedBanks) {
    assert.ok(variant.required.includes("settlement"), `${variant.title} requires settlement`);
    assertExactSet(
      variant.properties.settlement.required,
      ["accountId"],
      `${variant.title} settlement required fields`,
    );
    assert.equal(
      variant.properties.settlement.properties.accountId.description,
      "Issued customer wallet account that receives settled funds.",
    );
  }

  const account = resolveOpenApiReference(openapi.components.schemas.Account);
  assertExactSet(enumValues(account.properties.type), ["wallet", "bank"], "account type response");
  assertExactSet(enumValues(account.properties.origin), ["issued", "external"], "account origin response");
  assertExactSet(
    enumValues(account.properties.status),
    [
      "provisioning",
      "in_review",
      "ready",
      "action_required",
      "suspended",
      "rejected",
      "archived",
    ],
    "account status response",
  );
  assert.equal(
    account.properties.statusReason.description,
    "Why the account is `provisioning`, `in_review`, `action_required`, `suspended`, or `rejected`; absent on `ready` and `archived` accounts. Current account reason codes are `account_holder_name_mismatch`, `awaiting_assignment`, `provider_provisioning`, `provisioning_failed`, `temporarily_unsupported`, and `verification_pending`; `awaiting_assignment` means a pooled account receives concrete details when its first payin is created. Clients must tolerate unknown future codes.",
  );
  assertExactSet(
    account.properties.statusReason.required,
    ["code", "message", "actor", "retryable"],
    "account statusReason fields",
  );
  assertExactSet(
    enumValues(account.properties.statusReason.properties.actor),
    ["customer", "developer", "provider", "network", "swipelux"],
    "account statusReason actors",
  );

  const responseAccount = responseDataSchema("post", path, "201");
  assertExactSet(enumValues(responseAccount.properties.status), enumValues(account.properties.status), "account create response status");

  const text = requiredPage("integration/accounts");
  assertExactSet(
    labeledCodeValues(text, "Account types"),
    ["wallet", "bank"],
    "published account types",
  );
  assertExactSet(
    labeledCodeValues(text, "Account origins"),
    ["issued", "external"],
    "published account origins",
  );
  assertExactSet(
    labeledCodeValues(text, "Account statuses"),
    enumValues(account.properties.status),
    "published account statuses",
  );
  assertExactSet(
    labeledCodeValues(text, "Account statusReason codes"),
    [
      "account_holder_name_mismatch",
      "awaiting_assignment",
      "provider_provisioning",
      "provisioning_failed",
      "temporarily_unsupported",
      "verification_pending",
    ],
    "published account statusReason codes",
  );
  assert.match(
    text,
    /issued bank accounts?[\s\S]{0,160}`settlement\.accountId`[\s\S]{0,160}issued customer wallet account[\s\S]{0,120}receives settled funds/i,
  );
  assert.match(text, /no universal account payload/i);
  assert.match(text, /current account[\s\S]{0,160}GET \/v3\/customers/i);
  assert.match(text, /`status=archived`[\s\S]{0,160}in-flight transfers?[\s\S]{0,160}terminal state/i);
  assert.match(
    text,
    /`awaiting_assignment`[\s\S]{0,180}pooled issued bank[\s\S]{0,180}(?:unavailable|receives? concrete details)[\s\S]{0,180}first pay-?in/i,
  );

  const examples = create.requestBody.content["application/json"].examples;
  const blocks = jsonBlocks(text);
  for (const key of ["issuedWallet", "issuedAch", "externalWallet", "externalAch"]) {
    assert.ok(hasDeepEqual(blocks, examples[key].value), `accounts must include ${key} contract example`);
  }
});

test("documents exact account fee read-back and replacement semantics", () => {
  const path = "/v3/customers/{customerId}/accounts/{accountId}/fees";
  const get = openApiOperation("get", path).operationObject;
  assert.equal(
    get.description,
    "Read the developer fees configured for one customer account. This is the read-back mirror of the PUT shape; `breakdown.developer` is `null` when no rule is configured.",
  );
  const readBack = responseDataSchema("get", path);
  assertExactSet(readBack.required, ["accountId", "breakdown"], "account fee read-back fields");
  assertExactSet(readBack.properties.breakdown.required, ["developer"], "account fee read-back breakdown fields");
  const readDeveloper = readBack.properties.breakdown.properties.developer;
  assert.equal(readDeveloper.nullable, true);
  assertExactSet(readDeveloper.required, ["fixed", "bips"], "account fee read-back developer fields");
  assert.equal(readDeveloper.properties.fixed.pattern, "^\\d+(?:\\.\\d{1,2})?$");
  assert.equal(readDeveloper.properties.bips.minimum, 0);
  assert.equal(readDeveloper.properties.bips.maximum, 9999);
  assert.deepEqual(
    get.responses["200"].content["application/json"].examples.unconfigured.value,
    {
      data: {
        accountId: "acc_3eG7xN2pQ4rT8mA1sL6dVc",
        breakdown: { developer: null },
      },
    },
  );

  const put = openApiOperation("put", path).operationObject;
  assert.equal(requestBody("put", path).required, true);
  assert.equal(
    put.description,
    "Replaces developer fees for one customer account. Fixed fees are major-unit decimal strings; request bodies do not carry wildcard or fee-level currency rules.",
  );
  const request = requestBodySchema("put", path);
  assertExactSet(request.required, ["breakdown"], "account fee request fields");
  assertExactSet(request.properties.breakdown.required, ["developer"], "account fee request breakdown fields");
  const developer = request.properties.breakdown.properties.developer;
  assertExactSet(developer.required, ["fixed", "bips"], "account fee request developer fields");
  assert.equal(developer.properties.fixed.pattern, "^\\d+(?:\\.\\d{1,2})?$");
  assert.equal(developer.properties.bips.minimum, 0);
  assert.equal(developer.properties.bips.maximum, 9999);
  for (const properties of [
    request.properties,
    request.properties.breakdown.properties,
    developer.properties,
  ]) {
    assert.equal(properties.currency, undefined);
    assert.equal(properties.wildcard, undefined);
  }
  assertExactSet(problemCodes("put", path, "422"), ["developer_fee_invalid"], "account fee 422 codes");
  assert.equal(
    responseObject("put", path, "422").description,
    "A positive developer fee requires an account backed by a settlement network and an available developer settlement wallet on that network.",
  );

  const text = requiredPage("integration/accounts");
  assert.match(text, /read-back mirror[\s\S]{0,120}`breakdown\.developer`[\s\S]{0,100}`null`[\s\S]{0,100}no rule/i);
  assert.match(text, /required shape[\s\S]{0,160}`breakdown\.developer\.fixed`[\s\S]{0,160}`breakdown\.developer\.bips`/i);
  assert.match(text, /major-unit decimal string[\s\S]{0,120}at most 2 decimal places/i);
  assert.match(text, /`bips`[\s\S]{0,100}(?:0\.\.9999|0 through 9999)/i);
  assert.match(text, /no wildcard[\s\S]{0,120}fee-level currency/i);
  assert.match(text, /positive developer fee[\s\S]{0,180}settlement network[\s\S]{0,180}developer settlement wallet/i);
  assert.match(text, /`422 developer_fee_invalid`/);
  assert.ok(
    hasDeepEqual(
      jsonBlocks(text),
      put.requestBody.content["application/json"].examples.developer.value,
    ),
    "accounts must include the contract account-fee request example",
  );
});

test("documents exact recipient and destination unions and terminal archive behavior", () => {
  const recipientPath = "/v3/customers/{customerId}/recipients";
  const destinationPath =
    "/v3/customers/{customerId}/recipients/{recipientId}/destinations";
  const recipientCreate = openApiOperation("post", recipientPath).operationObject;
  const recipientSchema = requestBodySchema("post", recipientPath);
  assertExactSet(
    recipientSchema.oneOf.map((variant) => variant.title),
    ["Individual recipient", "Business recipient"],
    "recipient create variants",
  );
  assertExactSet(
    recipientSchema.oneOf.flatMap((variant) => enumValues(variant.properties.type)),
    ["individual", "business"],
    "recipient types",
  );
  const individual = recipientSchema.oneOf.find((variant) => variant.title === "Individual recipient");
  const business = recipientSchema.oneOf.find((variant) => variant.title === "Business recipient");
  assertExactSet(individual.required, ["type", "relationship", "firstName", "lastName"], "individual recipient fields");
  assertExactSet(business.required, ["type", "relationship", "companyName"], "business recipient fields");

  const destinationCreate = openApiOperation("post", destinationPath).operationObject;
  const destinationSchema = requestBodySchema("post", destinationPath);
  assertExactSet(
    destinationSchema.oneOf.flatMap((variant) => enumValues(variant.properties.type)),
    ["sepa", "swift", "ach", "wire", "spei", "pse", "transfers_3_0", "wallet"],
    "recipient destination types",
  );

  const recipient = resolveOpenApiReference(openapi.components.schemas.Recipient);
  assertExactSet(
    unique(recipient.oneOf.flatMap((variant) => enumValues(variant.properties.status))),
    ["active", "rejected", "archived"],
    "recipient statuses",
  );
  const destination = resolveOpenApiReference(openapi.components.schemas.Destination);
  assertExactSet(
    unique(destination.oneOf.flatMap((variant) => enumValues(variant.properties.status))),
    ["in_review", "ready", "action_required", "archived"],
    "destination statuses",
  );
  for (const variant of destination.oneOf) {
    const statusReason = variant.properties.statusReason;
    assert.equal(
      statusReason.description,
      "Why this destination requires action. Present exactly when status is action_required; omitted otherwise.",
    );
    const reason = resolveOpenApiReference(statusReason.allOf[0]);
    assertExactSet(reason.required, ["code", "message", "actor", "retryable"], `${variant.title} statusReason fields`);
  }

  assertExactSet(problemCodes("post", destinationPath, "422"), ["recipient_address_required"], "destination create 422 codes");

  const text = requiredPage("integration/recipients");
  assertExactSet(labeledCodeValues(text, "Recipient types"), ["individual", "business"], "published recipient types");
  assertExactSet(labeledCodeValues(text, "Recipient statuses"), ["active", "rejected", "archived"], "published recipient statuses");
  assertExactSet(
    labeledCodeValues(text, "Destination types"),
    ["sepa", "swift", "ach", "wire", "spei", "pse", "transfers_3_0", "wallet"],
    "published destination types",
  );
  assertExactSet(
    labeledCodeValues(text, "Destination statuses"),
    ["in_review", "ready", "action_required", "archived"],
    "published destination statuses",
  );
  assert.match(text, /first-party[\s\S]{0,120}customer accounts?[\s\S]{0,180}third-party[\s\S]{0,120}recipient destinations?/i);
  assert.match(text, /no universal recipient or destination payload/i);
  assert.match(text, /archive is terminal[\s\S]{0,120}reject later updates/i);
  assert.match(text, /`updatedAfter`[\s\S]{0,180}archived transitions/i);
  assert.match(text, /`recipient_address_required`/);

  const blocks = jsonBlocks(text);
  for (const example of [
    recipientCreate.requestBody.content["application/json"].examples.individual.value,
    recipientCreate.requestBody.content["application/json"].examples.business.value,
    destinationCreate.requestBody.content["application/json"].examples.ach.value,
    destinationCreate.requestBody.content["application/json"].examples.wallet.value,
  ]) {
    assert.ok(hasDeepEqual(blocks, example), "recipients must use contract request examples");
  }
});

test("derives quote pricing, execution, expiry, enums, and problem codes from schemas", () => {
  const quotePath = "/v3/quotes";
  const transferPath = "/v3/transfers";
  const quoteCreate = openApiOperation("post", quotePath).operationObject;
  const transferCreate = openApiOperation("post", transferPath).operationObject;
  const quoteRequest = requestBodySchema("post", quotePath);
  assert.equal(requestBody("post", quotePath).required, true);
  assertExactSet(
    quoteRequest.required,
    ["customerId", "capabilityId", "in", "destinationId", "out"],
    "quote request required fields",
  );
  assert.equal(
    quoteRequest.description,
    "Provide exactly one of `in.amount` or `out.amount`. Stablecoin moves are same-network, same-currency transfers; cross-chain bridging and asset swaps are not supported.",
  );

  const quote = resolveOpenApiReference(openapi.components.schemas.Quote);
  assertExactSet(enumValues(quote.properties.mode), ["exact_in", "exact_out"], "quote modes");
  assertExactSet(
    enumValues(quote.properties.direction),
    ["fiat_to_stablecoin", "stablecoin_to_fiat", "stablecoin_move"],
    "quote directions",
  );
  assertExactSet(enumValues(quote.properties.status), ["active", "executed", "expired", "failed"], "quote statuses");
  assert.ok(quote.required.includes("expiresAt"));

  const quoteFees = quoteRequest.properties.fees;
  assert.ok(!quoteRequest.required.includes("fees"));
  assert.equal(
    quoteFees.description,
    "Optional quote-level developer fee override. Overrides account fees for this quote only. A `stablecoin_transfers` wallet move currently accepts zero fees only: any non-zero platform or developer fee is rejected with `422 amount_not_deliverable` until direct crypto fee settlement is supported.",
  );
  assertExactSet(quoteFees.required, ["breakdown"], "quote fee override fields");
  assertExactSet(quoteFees.properties.breakdown.required, ["developer"], "quote fee override breakdown fields");
  const quoteFeeDeveloper = quoteFees.properties.breakdown.properties.developer;
  assertExactSet(quoteFeeDeveloper.required, ["fixed", "bips"], "quote fee override developer fields");
  assert.equal(quoteFeeDeveloper.properties.fixed.pattern, "^\\d+(\\.\\d{1,2})?$");
  assert.equal(quoteFeeDeveloper.properties.bips.minimum, 0);
  assert.equal(quoteFeeDeveloper.properties.bips.maximum, 9999);

  const quoteResponse = responseDataSchema("post", quotePath, "201");
  for (const field of ["rate", "fees"]) {
    assert.ok(quoteResponse.required.includes(field), `quote response must require ${field}`);
  }
  const quoteFeeLine = quoteResponse.properties.fees.items;
  assertExactSet(quoteFeeLine.required, ["beneficiary", "amount", "currency"], "quote fee-line fields");
  assertExactSet(enumValues(quoteFeeLine.properties.beneficiary), ["developer", "service"], "quote fee beneficiaries");
  assertExactSet(quoteFeeLine.properties.rule.required, ["fixed", "bips"], "quote fee rule fields");

  const transferRequest = requestBodySchema("post", transferPath);
  assertExactSet(transferRequest.required, ["quoteId"], "transfer request required fields");
  const transfer = resolveOpenApiReference(openapi.components.schemas.Transfer);
  assertExactSet(
    enumValues(transfer.properties.state),
    ["awaiting_funds", "processing", "action_required", "completed", "failed", "canceled"],
    "transfer states",
  );
  assertExactSet(
    enumValues(transfer.properties.direction),
    ["fiat_to_stablecoin", "stablecoin_to_fiat", "stablecoin_move"],
    "transfer directions",
  );
  const transferResponse = responseDataSchema("post", transferPath, "201");
  assertExactSet(enumValues(transferResponse.properties.state), enumValues(transfer.properties.state), "transfer create response states");
  assert.ok(transferResponse.required.includes("fees"));
  assert.equal(
    transferResponse.properties.fees.description,
    "Applied fee snapshot, using the same shape as the quote fee lines.",
  );
  assert.deepEqual(transferResponse.properties.fees.items, quoteFeeLine);

  assertExactSet(
    problemCodes("post", quotePath, "422"),
    [
      "account_method_not_supported",
      "amount_not_deliverable",
      "developer_fee_invalid",
      "quote_direction_invalid",
      "recipient_destination_invalid",
    ],
    "quote create 422 codes",
  );
  assertExactSet(problemCodes("post", quotePath, "503"), ["rail_temporarily_unavailable"], "quote create 503 codes");
  assertExactSet(
    problemCodes("post", transferPath, "409"),
    [
      "account_unavailable",
      "account_not_ready",
      "capability_not_ready",
      "idempotency_conflict",
      "insufficient_balance",
      "quote_already_executed",
      "quote_destination_missing",
      "quote_expired",
      "rail_not_ready",
    ],
    "transfer create 409 codes",
  );

  const text = requiredPage("integration/quotes-and-transfers");
  assertExactSet(labeledCodeValues(text, "Quote modes"), ["exact_in", "exact_out"], "published quote modes");
  assertExactSet(labeledCodeValues(text, "Quote statuses"), ["active", "executed", "expired", "failed"], "published quote statuses");
  assertExactSet(
    labeledCodeValues(text, "Transfer directions"),
    ["fiat_to_stablecoin", "stablecoin_to_fiat", "stablecoin_move"],
    "published transfer directions",
  );
  assertExactSet(
    labeledCodeValues(text, "Transfer states"),
    enumValues(transfer.properties.state),
    "published transfer states",
  );
  assertExactSet(
    labeledCodeValues(text, "Quote 422 codes"),
    problemCodes("post", quotePath, "422"),
    "published quote 422 codes",
  );
  assertExactSet(
    labeledCodeValues(text, "Transfer 409 codes"),
    problemCodes("post", transferPath, "409"),
    "published transfer 409 codes",
  );
  assert.match(text, /prices? the movement[\s\S]{0,180}executes? the selected quote[\s\S]{0,160}without intentionally re-pricing/i);
  assert.match(text, /before `expiresAt`[\s\S]{0,180}checks still pass/i);
  assert.match(text, /does not define a fixed quote lifetime/i);
  assert.match(text, /no universal quote payload/i);
  assert.match(text, /current quote[\s\S]{0,160}current transfer/i);
  assert.match(text, /optional quote-level[\s\S]{0,100}(?:`fees`|developer fee override)[\s\S]{0,180}overrides account fees[\s\S]{0,120}quote only/i);
  assert.ok(text.includes("[account fees](/integration/accounts#configure-account-developer-fees)"));
  assert.match(text, /`stablecoin_transfers`[\s\S]{0,180}zero fees only[\s\S]{0,180}non-zero[\s\S]{0,140}`422 amount_not_deliverable`/i);
  assert.match(text, /returned Quote[\s\S]{0,100}`rate`[\s\S]{0,120}(?:`fees`|fee lines)[\s\S]{0,160}executable price snapshot/i);
  assert.match(text, /Transfer[\s\S]{0,100}`fees`[\s\S]{0,140}applied snapshot[\s\S]{0,140}quote fee-line shape/i);

  const blocks = jsonBlocks(text);
  assert.ok(
    hasDeepEqual(
      blocks,
      quoteCreate.requestBody.content["application/json"].examples.stablecoinMove.value,
    ),
    "quotes and transfers must include the contract stablecoinMove quote example",
  );
  assert.ok(
    hasDeepEqual(
      blocks,
      transferCreate.requestBody.content["application/json"].examples.quoted.value,
    ),
    "quotes and transfers must include the contract quoted transfer example",
  );
});

test("uses transfer-scoped task details and exact StatusReason vocabularies", () => {
  const transfer = responseDataSchema("get", "/v3/transfers/{transferId}");
  assert.ok(transfer.required.includes("openTaskIds"));
  assert.equal(
    transfer.properties.openTaskIds.description,
    "Ids of transfer-scoped tasks with status `action_required` or `in_review`, ordered by creation time and id. Empty when nothing is open.",
  );
  assert.equal(
    transfer.properties.state.description,
    "Public transfer state. `processing` covers funds received through settlement. `action_required` is projected when an otherwise in-flight transfer has open transfer tasks. `canceled` is projected when an unfunded deposit window expires. Closed enum — exhaustive; additions would be a breaking change.",
  );
  assert.ok(transfer.required.includes("stateDetail"));
  assert.equal(transfer.properties.stateDetail.nullable, true);
  assert.equal(
    transfer.properties.stateDetail.description,
    "Structured reason for the current state. Nullable on happy-path states; required for action_required and other non-terminal blocking/failure states.",
  );

  const statusReason = transfer.properties.stateDetail;
  assertExactSet(statusReason.required, ["code", "message", "actor", "retryable"], "transfer StatusReason fields");
  assertExactSet(
    enumValues(statusReason.properties.actor),
    ["customer", "developer", "provider", "network", "swipelux"],
    "transfer StatusReason actors",
  );

  const taskPage = responseSchema("get", "/v3/transfers/{transferId}/tasks");
  assertExactSet(taskPage.required, ["data", "nextCursor", "hasMore"], "transfer task page fields");
  assert.equal(taskPage.properties.data.type, "array");
  const task = resolveOpenApiReference(taskPage.properties.data.items);
  for (const field of ["revision", "requirements", "status", "scope", "subject"]) {
    assert.ok(task.required.includes(field), `transfer task details must require ${field}`);
  }
  assertExactSet(
    enumValues(task.properties.status),
    ["action_required", "in_review", "satisfied", "rejected", "canceled"],
    "transfer task statuses",
  );

  const examples = openApiOperation(
    "get",
    "/v3/transfers/{transferId}",
  ).operationObject.responses["200"].content["application/json"].examples;
  assert.deepEqual(examples.failed.value.data.stateDetail, {
    code: "network_rejected",
    message:
      "The payment network rejected this transfer. Create a new quote to retry, or contact support with the transfer id.",
    actor: "network",
    retryable: false,
  });
  assert.deepEqual(examples.canceled.value.data.stateDetail, {
    code: "deposit_window_expired",
    message:
      "The funding window expired before funds were received. Create a new quote and transfer to retry.",
    actor: "customer",
    retryable: false,
  });

  const text = requiredPage("integration/quotes-and-transfers");
  assertExactSet(
    labeledCodeValues(text, "Task statuses"),
    enumValues(task.properties.status),
    "published transfer task statuses",
  );
  assertExactSet(
    labeledCodeValues(text, "StatusReason fields"),
    ["code", "message", "actor", "retryable"],
    "published StatusReason fields",
  );
  assertExactSet(
    labeledCodeValues(text, "StatusReason actors"),
    enumValues(statusReason.properties.actor),
    "published StatusReason actors",
  );
  assert.match(text, /`action_required`[\s\S]{0,180}open transfer tasks/i);
  assert.match(text, /`openTaskIds`[\s\S]{0,180}GET \/v3\/transfers\/\{transferId\}\/tasks/i);
  assert.match(text, /current task details[\s\S]{0,180}`revision`[\s\S]{0,180}`requirements`/i);
  assert.match(text, /no universal task submission payload/i);
  assert.match(text, /examples?[\s\S]{0,100}`network_rejected`[\s\S]{0,160}`deposit_window_expired`[\s\S]{0,180}not an exhaustive/i);
  assert.match(text, /`processing`[\s\S]{0,140}funds received through settlement/i);
  assert.match(text, /`canceled`[\s\S]{0,140}unfunded deposit window[\s\S]{0,100}expires/i);
  assert.match(text, /`stateDetail`[\s\S]{0,160}nullable on happy-path states[\s\S]{0,180}required for `action_required`[\s\S]{0,180}non-terminal blocking(?:\/| or )failure states/i);
});

test("keeps funding instructions conditional and cancellation contract-limited", () => {
  const instructions = resolveOpenApiReference(
    openapi.components.schemas.TransferInstructions,
  );
  assertExactSet(
    instructions.oneOf.flatMap((variant) => enumValues(variant.properties.type)),
    ["bank", "code", "redirect"],
    "transfer instruction types",
  );
  const bank = instructions.oneOf.find((variant) => variant.title === "Bank instructions");
  assertExactSet(
    enumValues(bank.properties.method),
    [
      "ach",
      "wire",
      "rtp",
      "sepa",
      "swift",
      "spei",
      "transfers_3_0",
      "uaefts",
      "faster_payments",
    ],
    "bank instruction methods",
  );

  const instructionPath = "/v3/transfers/{transferId}/instructions";
  const instructionOperation = openApiOperation("get", instructionPath).operationObject;
  assert.equal(
    instructionOperation.description,
    "Returns the typed deposit instructions for a v3 transfer created from a quote. Payout-side transfers are funded from the source account and have no instructions: this endpoint returns a 404 problem with code `transfer_has_no_instructions` for them.",
  );
  assert.match(
    responseObject("get", instructionPath, "404").description,
    /`transfer_has_no_instructions`/,
  );
  const instructionData = responseDataSchema("get", instructionPath);
  assertExactSet(
    instructionData.required,
    ["transferId", "instructions"],
    "instruction response data fields",
  );
  assertExactSet(
    instructionData.properties.instructions.anyOf.flatMap((variant) =>
      enumValues(variant.properties.type),
    ),
    ["bank", "code", "redirect"],
    "instruction response types",
  );

  const cancelPath = "/v3/transfers/{transferId}/cancel";
  const cancel = openApiOperation("post", cancelPath).operationObject;
  assert.equal(
    cancel.description,
    "Returns `409 transfer_not_cancelable`; no current transfer state is cancelable through this operation.",
  );
  assert.deepEqual(successStatuses("post", cancelPath), []);
  assert.equal(
    responseObject("post", cancelPath, "409").description,
    "Transfer is not cancelable (`transfer_not_cancelable`).",
  );

  const text = requiredPage("integration/quotes-and-transfers");
  assert.match(text, /applicable inbound transfers?[\s\S]{0,180}(?:`bank`|bank)[\s\S]{0,120}`code`[\s\S]{0,120}`redirect`/i);
  assert.match(text, /payout-side transfers?[\s\S]{0,180}`transfer_has_no_instructions`/i);
  assert.match(text, /no current transfer state is cancelable/i);
  assert.match(text, /`transfer_not_cancelable`/);
});

test("derives deposit reference and local-amount guidance from instruction responses", () => {
  const instructionData = responseDataSchema(
    "get",
    "/v3/transfers/{transferId}/instructions",
  );
  const variants = instructionData.properties.instructions.anyOf;
  const bank = variants.find((variant) => enumValues(variant.properties.type).includes("bank"));
  assert.ok(bank);
  assert.equal(
    bank.properties.reference.properties.required.description,
    "Whether the deposit must carry this reference to be matched. Pooled accounts match deposits by reference; named virtual accounts match by account number.",
  );
  assert.equal(
    bank.properties.localAmount.description,
    "Amount in the local settlement currency when the rail settles in a currency different from the quoted in amount.",
  );

  for (const page of [
    "integration/quotes-and-transfers",
    "integration/receive-funds",
  ]) {
    const text = requiredPage(page);
    assert.match(
      text,
      /`reference\.required`[\s\S]{0,140}(?:true|`true`)[\s\S]{0,180}exact (?:returned )?reference[\s\S]{0,160}(?:accompany|included with) the deposit/i,
      `${page} must explain required deposit references`,
    );
    assert.match(
      text,
      /pooled accounts?[\s\S]{0,100}match[\s\S]{0,80}reference[\s\S]{0,160}named virtual accounts?[\s\S]{0,100}account number/i,
      `${page} must distinguish pooled and named matching`,
    );
    assert.match(
      text,
      /`localAmount`[\s\S]{0,140}local settlement currency[\s\S]{0,180}rail currency[\s\S]{0,180}quoted input/i,
      `${page} must explain localAmount`,
    );
  }
});

test("documents receiving funds through compatible inbound and settlement paths", () => {
  const quoteCreate = openApiOperation("post", "/v3/quotes").operationObject;
  const transfer = resolveOpenApiReference(openapi.components.schemas.Transfer);
  assertExactSet(enumValues(transfer.properties.origin), ["quoted", "inbound_deposit"], "transfer origins");
  assert.equal(
    transfer.properties.instructions.description,
    "Deposit instructions. Null for payout-side transfers, which are funded from the source account.",
  );

  const text = requiredPage("integration/receive-funds");
  assert.match(text, /`fiat_to_stablecoin`/);
  assert.match(text, /source[\s\S]{0,80}`external`[\s\S]{0,180}destination[\s\S]{0,100}customer account/i);
  assert.match(text, /issued bank account[\s\S]{0,180}settlement wallet account/i);
  assert.match(text, /`origin`[\s\S]{0,100}`inbound_deposit`/i);
  assert.match(text, /current transfer[\s\S]{0,180}`state`/i);
  assert.match(text, /funding instructions[\s\S]{0,180}only when[\s\S]{0,120}applicable/i);
  assert.match(text, /no universal inbound payload/i);
  assert.ok(
    hasDeepEqual(
      jsonBlocks(text),
      quoteCreate.requestBody.content["application/json"].examples.fiatToStablecoin.value,
    ),
    "receive funds must include the contract fiatToStablecoin quote example",
  );
});

test("documents first-party accounts and third-party payout destinations with compatibility checks", () => {
  const quoteCreate = openApiOperation("post", "/v3/quotes").operationObject;
  const quoteRequest = requestBodySchema("post", "/v3/quotes");
  assert.equal(
    quoteRequest.properties.in.properties.accountId.description,
    "Source account for stablecoin-funded quotes. It must be an active issued custodial account owned by the request customer in the authenticated merchant and developer space and support `in.currency`. The scoped default issued account is used when omitted; ignored for fiat-funded quotes.",
  );
  assert.equal(
    quoteRequest.properties.destinationId.pattern,
    "^(?:acc|dst)_[a-zA-Z0-9]+$",
  );
  assert.match(quoteRequest.properties.destinationId.description, /same network and currency/i);
  assert.match(quoteRequest.properties.destinationId.description, /raw inline addresses are not accepted/i);

  const text = requiredPage("integration/send-funds");
  assert.match(text, /source[\s\S]{0,160}active issued custodial account/i);
  assert.match(text, /first-party[\s\S]{0,120}`acc_`[\s\S]{0,120}customer account/i);
  assert.match(text, /third-party[\s\S]{0,120}`dst_`[\s\S]{0,120}recipient destination/i);
  assert.match(text, /`stablecoin_to_fiat`[\s\S]{0,180}(?:external bank account|bank destination)/i);
  assert.match(text, /`stablecoin_move`[\s\S]{0,180}same network and currency/i);
  assert.match(text, /raw inline addresses are not accepted/i);
  assert.match(text, /current transfer[\s\S]{0,160}(?:state|tasks)/i);
  assert.match(text, /no universal payout payload/i);
  assert.match(text, /payout-side transfers?[\s\S]{0,160}(?:have no|do not have) funding instructions/i);
  assert.match(text, /GET \/v3\/transfers\/\{transferId\}\/instructions[\s\S]{0,160}`transfer_has_no_instructions`/i);
  assert.ok(
    hasDeepEqual(
      jsonBlocks(text),
      quoteCreate.requestBody.content["application/json"].examples
        .stablecoinToFiatDestination.value,
    ),
    "send funds must include the contract third-party payout quote example",
  );
});

test("documents the exact custodial-wallet sweep rule shape and lifecycle", () => {
  const createPath = "/v3/customers/{customerId}/rules";
  const detailPath = "/v3/customers/{customerId}/rules/{ruleId}";
  const create = openApiOperation("post", createPath).operationObject;
  const schema = requestBodySchema("post", createPath);
  assertExactSet(schema.required, ["trigger", "action"], "rule request fields");
  assertExactSet(schema.properties.trigger.required, ["type", "accountId"], "rule trigger fields");
  assertExactSet(enumValues(schema.properties.trigger.properties.type), ["funds_received"], "rule trigger types");
  assert.equal(
    schema.properties.trigger.properties.accountId.description,
    "Custodial wallet account watched by this rule.",
  );
  assertExactSet(schema.properties.action.required, ["type", "target"], "rule action fields");
  assertExactSet(enumValues(schema.properties.action.properties.type), ["transfer"], "rule action types");
  assertExactSet(
    enumValues(schema.properties.action.properties.target.properties.type),
    ["account", "destination"],
    "rule target types",
  );
  assert.equal(
    schema.properties.action.properties.target.description,
    "Where the received funds go: `account` for another custodial wallet account, or `destination` for a recipient destination (including non-custodial wallet destinations).",
  );

  const rule = responseDataSchema("post", createPath, "201");
  assertExactSet(enumValues(rule.properties.status), ["active", "paused", "archived"], "rule statuses");
  const update = requestBodySchema("patch", detailPath);
  assertExactSet(enumValues(update.properties.status), ["active", "paused"], "rule update statuses");
  assert.equal(
    openApiOperation("delete", detailPath).operationObject.description,
    "Archiving is terminal and frees the trigger account for a new rule. The archived rule stays readable.",
  );
  assert.match(create.responses["409"].description, /`rule_already_exists`/);
  assert.match(openApiOperation("patch", detailPath).operationObject.description, /`rule_archived`/);

  const text = requiredPage("integration/rules");
  assertExactSet(labeledCodeValues(text, "Rule statuses"), ["active", "paused", "archived"], "published rule statuses");
  assert.match(text, /exact trigger[\s\S]{0,100}`funds_received`[\s\S]{0,140}custodial wallet account/i);
  assert.match(text, /fiat deposits[\s\S]{0,180}issued bank account[\s\S]{0,180}settlement wallet account/i);
  assert.match(text, /target[\s\S]{0,120}`account`[\s\S]{0,120}custodial wallet account[\s\S]{0,160}`destination`[\s\S]{0,120}recipient destination/i);
  assert.match(text, /one non-archived rule[\s\S]{0,140}trigger account/i);
  assert.match(text, /`rule_already_exists`[\s\S]{0,160}`conflictingRuleId`/i);
  assert.match(text, /archiv(?:e|ing) is terminal[\s\S]{0,160}frees the trigger account[\s\S]{0,160}stays readable/i);

  const blocks = jsonBlocks(text);
  for (const key of ["sweep", "consolidation"]) {
    assert.ok(hasDeepEqual(blocks, create.requestBody.content["application/json"].examples[key].value), `rules must include ${key} contract example`);
  }
});

test("keeps idempotency and replay behavior operation-specific", () => {
  for (const [page, operations] of WRITE_OPERATIONS) {
    for (const [method, path] of operations) {
      const parameter = idempotencyParameter(method, path);
      assert.ok(parameter, `${method.toUpperCase()} ${path} must declare Idempotency-Key`);
      assert.equal(parameter.required, true);
      assert.equal(parameter.schema.minLength, 1);
      assert.equal(parameter.schema.maxLength, 255);

      if (documentsReplayHeader(method, path)) {
        for (const status of successStatuses(method, path)) {
          const header = responseHeader(method, path, status, "Idempotency-Replayed");
          assert.ok(header, `${method.toUpperCase()} ${path} ${status} must document replay header`);
          assertExactSet(enumValues(header.schema), ["true"], `${method.toUpperCase()} ${path} replay header values`);
        }
      } else {
        assert.deepEqual(
          [method, path],
          ["post", "/v3/transfers/{transferId}/cancel"],
          `unexpected write operation without Idempotency-Replayed: ${method.toUpperCase()} ${path}`,
        );
      }
    }
    assertOperationSafetyAssociationsInText(pageFile(page), requiredPage(page), operations);
  }

  for (const operations of PAGE_OPERATIONS.values()) {
    for (const [method, path] of operations.filter(([method]) => method === "get")) {
      assert.equal(
        idempotencyParameter(method, path),
        undefined,
        `${method.toUpperCase()} ${path} must not borrow Idempotency-Key`,
      );
    }
  }
});

test("keeps credentials backend-only and rejects legacy or fabricated guidance", () => {
  for (const page of PAGES) {
    const text = requiredPage(page);
    assert.match(text, /backend/i, `${page} must state the backend boundary`);
    assert.match(text, /`X-API-Key`/, `${page} must name X-API-Key`);
    assert.match(text, /do not expose[\s\S]{0,100}(?:browser|client)/i, `${page} must forbid client exposure`);
    assert.doesNotMatch(text, /\bBearer\b|serviceToken|uploadToken|client credentials/i);
    assert.doesNotMatch(text, /\bKYC\b|\bKYB\b|walletId|beneficiaryId|bankAccountId|\/wallets\b/i);
    assert.doesNotMatch(text, /https?:\/\/(?:api|wallet|sandbox|docs)\.swipelux\.com/i);
    assert.doesNotMatch(text, /\bsk\.(?:live|sbx)\.[A-Za-z0-9_-]{8,}\b/i);
    assert.doesNotMatch(
      text,
      /guaranteed|always completes?|completes? within|settles? within|instant(?:ly)? completes?|FIFO|strict ordering/i,
    );
    assert.doesNotMatch(
      text,
      /(?:fee|limit)s? (?:is|are|of) (?:US\$|\$|€|£)?\d|\d+(?:\.\d+)?% (?:fee|limit)/i,
    );
    assert.doesNotMatch(text, /raw inline (?:wallet )?addresses? (?:are|is) accepted/i);
  }
});

test("uses root-relative extensionless internal links", () => {
  for (const page of PAGES) {
    const text = requiredPage(page);
    for (const href of internalLinks(text)) {
      assert.match(href, /^\//, `${page} internal link must be root-relative: ${href}`);
      assert.doesNotMatch(href, /\.mdx?(?:$|[#?])/, `${page} internal link must omit file extensions: ${href}`);
    }
  }
});
