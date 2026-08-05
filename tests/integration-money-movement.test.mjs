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

function schemaVariants(schema) {
  const resolved = resolveOpenApiReference(schema);
  return (resolved.oneOf ?? resolved.anyOf ?? []).map(resolveOpenApiReference);
}

function assertDescriptionFragments(description, label, fragments) {
  assert.equal(typeof description, "string", `${label} must have a description`);
  for (const fragment of fragments) {
    assert.match(description, fragment, `${label} must document ${fragment}`);
  }
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
    assert.match(
      safetyUnit,
      /requires `Idempotency-Key`/i,
      `${label} must state that Idempotency-Key is required for ${method.toUpperCase()} ${path}`,
    );
    assert.match(
      safetyUnit,
      /after transport uncertainty/i,
      `${label} must limit key reuse to transport uncertainty for ${method.toUpperCase()} ${path}`,
    );
    assert.match(
      safetyUnit,
      /reuse the same key only/i,
      `${label} must limit reuse of the same key for ${method.toUpperCase()} ${path}`,
    );
    const replayInput = requestBody(method, path) ? "body" : "request";
    assert.match(
      safetyUnit,
      new RegExp(`identical ${replayInput}\\b`, "i"),
      `${label} must replay the identical ${replayInput} for ${method.toUpperCase()} ${path}`,
    );

    if (documentsReplayHeader(method, path)) {
      assert.match(
        safetyUnit,
        /on (?:an? )?replay[\s\S]*`Idempotency-Replayed: true`/i,
        `${label} must associate Idempotency-Replayed: true specifically with a replay of ${method.toUpperCase()} ${path}`,
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

function assertSharedFinancialSafetyGuidance(label, text) {
  const units = proseSemanticUnits(text);
  const safetyLink = "[Request safety](/integration/request-safety)";
  const guidance = units.filter((unit) => unit.includes(safetyLink));
  assert.equal(
    guidance.length,
    1,
    `${label} must contain one shared Request safety guidance unit`,
  );
  assert.match(
    guidance[0],
    /(?:each|every|all) (?:write|operation)[\s\S]*requires `Idempotency-Key`/i,
    `${label} must state that each write requires Idempotency-Key`,
  );
  assert.match(
    guidance[0],
    /fresh key[\s\S]*each intended effect/i,
    `${label} must require a fresh key per intended effect`,
  );
}

function assertAccountScopeGuidance(label, text) {
  assert.match(text, /customer-scoped/i, `${label} must describe accounts as customer-scoped`);
  assert.match(text, /`issued` accounts?[\s\S]{0,100}platform-issued/i);
  assert.match(text, /`external` accounts?[\s\S]{0,100}customer-owned/i);
  assert.doesNotMatch(
    text,
    /(?:all customer-scoped accounts? are|accounts? belong to a customer and represent) customer-owned/i,
    `${label} must not say that every customer-scoped account is customer-owned`,
  );
}

function assertAccountReferenceGuidance(label, text, { transferInstructions = false } = {}) {
  const units = proseSemanticUnits(text);
  const accountUnits = units.filter((unit) => unit.includes("`details.referenceRequired`"));
  assert.equal(accountUnits.length, 1, `${label} must have one account-reference unit`);
  const [accountUnit] = accountUnits;
  assert.match(accountUnit, /(?:is|when)[\s\S]{0,80}`true`/i);
  assert.match(accountUnit, /sender must include/i);
  assert.match(accountUnit, /exact `details\.reference`/i);
  assert.match(accountUnit, /funds may remain unmatched/i);
  assert.doesNotMatch(accountUnit, /`reference\.required`/);

  if (transferInstructions) {
    const instructionUnits = units.filter((unit) => unit.includes("`reference.required`"));
    assert.equal(
      instructionUnits.length,
      1,
      `${label} must keep one transfer-instruction reference unit`,
    );
    assert.doesNotMatch(instructionUnits[0], /`details\.referenceRequired`/);
  }
}

function assertAccountFeeGuidance(label, text) {
  assert.match(text, /pay-in fee configuration/i, `${label} must identify pay-in fees`);
  assert.match(
    text,
    /`fixed`[\s\S]{0,160}account currency[\s\S]{0,120}major-unit/i,
    `${label} must define fixed fees in account-currency major units`,
  );
  assert.match(
    text,
    /`?50`? bips[\s\S]{0,80}`?0\.50%`?/i,
    `${label} must explain the 50-bips conversion`,
  );
  assert.doesNotMatch(text, /payout fee configuration/i);
}

function assertQuoteSnapshotGuidance(label, text) {
  const units = proseSemanticUnits(text);
  const quoteUnits = units.filter((unit) => unit.includes("executable snapshot"));
  assert.equal(quoteUnits.length, 1, `${label} must have one executable quote snapshot unit`);
  for (const field of ["`in`", "`out`", "`rate`", "`fees`"]) {
    assert.ok(quoteUnits[0].includes(field), `${label} quote snapshot must include ${field}`);
  }
  assert.match(quoteUnits[0], /together/i);
  assert.match(quoteUnits[0], /do not recompute[\s\S]{0,120}rate`? alone/i);

  const transferUnits = units.filter(
    (unit) => unit.includes("Transfer") && unit.includes("`amounts.settled`"),
  );
  assert.equal(transferUnits.length, 1, `${label} must have one transfer amount semantics unit`);
  const [transferUnit] = transferUnits;
  assert.match(
    transferUnit,
    /`amounts\.in`[\s\S]{0,100}`amounts\.out`[\s\S]{0,140}(?:executed quote|quoted legs)/i,
    `${label} must identify the quote-derived transfer legs`,
  );
  assert.match(
    transferUnit,
    /`fees`[\s\S]{0,100}applied fee snapshot/i,
    `${label} must identify fees as the applied snapshot`,
  );
  assert.match(
    transferUnit,
    /`amounts\.settled`[\s\S]{0,120}(?:actually delivered|amount actually delivered)[\s\S]{0,120}(?:present|appears)[\s\S]{0,80}(?:once|when)[\s\S]{0,80}completed/i,
    `${label} must distinguish the actual settled amount`,
  );
  assert.doesNotMatch(
    transferUnit,
    /`amounts` and `fees` are applied snapshots/i,
    `${label} must not classify amounts.settled as a quote snapshot`,
  );
}

function assertQuoteTransferIdentityGuidance(label, text) {
  assert.match(
    text,
    /`externalId`[\s\S]{0,160}non-unique[\s\S]{0,160}(?:not|does not provide) idempotency/i,
    `${label} must distinguish externalId from idempotency`,
  );
  assert.match(
    text,
    /`quote_already_executed`[\s\S]{0,160}(?:returns|includes)[\s\S]{0,80}existing `transferId`/i,
    `${label} must explain the existing transferId`,
  );
}

function assertRecipientWalletGuidance(label, text) {
  assert.match(
    text,
    /ownership[\s\S]{0,120}declaration only[\s\S]{0,140}(?:not verified|verification is not performed)[\s\S]{0,100}(?:create|creation)/i,
    `${label} must describe wallet ownership as unverified declaration`,
  );
  assert.match(
    text,
    /`self_custodied`[\s\S]{0,120}(?:forbids|must not include|omit) `custodianName`/i,
    `${label} must forbid custodianName for self-custodied wallets`,
  );
  assert.match(
    text,
    /`custodial`[\s\S]{0,120}(?:requires|provide) (?:a )?non-empty `custodianName`/i,
    `${label} must require a non-empty custodianName for custodial wallets`,
  );
  assert.match(
    text,
    /ready bank destinations?[\s\S]{0,140}fiat quote targets?[\s\S]{0,140}other quote checks/i,
    `${label} must limit fiat targets to ready bank destinations`,
  );
  assert.match(
    text,
    /compatible ready wallet destinations?[\s\S]{0,160}stablecoin-move quote targets?[\s\S]{0,160}same network and (?:asset|currency)/i,
    `${label} must limit wallet targets to compatible ready destinations`,
  );
}

function assertRuleMatchingGuidance(label, text) {
  assert.match(
    text,
    /matching occurs?[\s\S]{0,100}account credit[\s\S]{0,100}not[\s\S]{0,80}deposit rail/i,
    `${label} must place matching at account credit`,
  );
  assert.match(
    text,
    /fiat[\s\S]{0,140}issued bank[\s\S]{0,140}settlement wallet/i,
    `${label} must explain issued-bank settlement`,
  );
  assert.match(
    text,
    /stablecoin deposits[\s\S]{0,120}internal transfers[\s\S]{0,80}alike/i,
    `${label} must cover stablecoin deposits and internal transfers`,
  );
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

test("semantic checks reject swapped links and inverted idempotency claims", () => {
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

  const quoteSafety = operationMarkdown("post", "/v3/quotes");
  const cancelSafety = operationMarkdown(
    "post",
    "/v3/transfers/{transferId}/cancel",
  );
  const safeQuoteUnit = `- ${quoteSafety} requires \`Idempotency-Key\`. After transport uncertainty, reuse the same key only with the identical body. On a replay, the documented successful response includes \`Idempotency-Replayed: true\`.`;
  const safeCancelUnit = `- ${cancelSafety} requires \`Idempotency-Key\`. After transport uncertainty, reuse the same key only with the identical request. This operation does not document \`Idempotency-Replayed\`.`;
  const swappedSafety = [
    safeQuoteUnit.replace(
      /On a replay[\s\S]*$/,
      "This operation does not document `Idempotency-Replayed`.",
    ),
    safeCancelUnit.replace(
      /This operation does not document[\s\S]*$/,
      "On a replay, the documented successful response includes `Idempotency-Replayed: true`.",
    ),
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

  const wrongBody = [
    safeQuoteUnit.replace("identical body", "identical request"),
    safeCancelUnit,
  ].join("\n");
  assert.throws(
    () =>
      assertOperationSafetyAssociationsInText("wrong body fixture", wrongBody, [
        ["post", "/v3/quotes"],
        ["post", "/v3/transfers/{transferId}/cancel"],
      ]),
    /identical body/,
  );

  const wrongRequest = [
    safeQuoteUnit,
    safeCancelUnit.replace("identical request", "identical body"),
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
    /identical request/,
  );

  const wrongReplay = [
    safeQuoteUnit.replace("On a replay", "On the initial response"),
    safeCancelUnit,
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

  assert.throws(
    () =>
      assertOperationSafetyAssociationsInText(
        "optional key fixture",
        [safeQuoteUnit.replace("requires", "accepts optional"), safeCancelUnit].join("\n"),
        [
          ["post", "/v3/quotes"],
          ["post", "/v3/transfers/{transferId}/cancel"],
        ],
      ),
    /required/,
  );

  assert.throws(
    () =>
      assertOperationSafetyAssociationsInText(
        "any failure fixture",
        [
          safeQuoteUnit.replace("After transport uncertainty", "After any failure"),
          safeCancelUnit,
        ].join("\n"),
        [
          ["post", "/v3/quotes"],
          ["post", "/v3/transfers/{transferId}/cancel"],
        ],
      ),
    /transport uncertainty/,
  );

  assert.throws(
    () =>
      assertOperationSafetyAssociationsInText(
        "changed body fixture",
        [safeQuoteUnit.replace("identical body", "changed body"), safeCancelUnit].join(
          "\n",
        ),
        [
          ["post", "/v3/quotes"],
          ["post", "/v3/transfers/{transferId}/cancel"],
        ],
      ),
    /identical body/,
  );

  assert.throws(
    () =>
      assertSharedFinancialSafetyGuidance(
        "reused key fixture",
        "Follow [Request safety](/integration/request-safety). Each write requires `Idempotency-Key`. Reuse one key for every intended effect.",
      ),
    /fresh key/,
  );
});

test("polarity checks reject inversions of every critical Task 7 claim", () => {
  const accountScope =
    "Accounts are customer-scoped. `issued` accounts are platform-issued. `external` accounts are customer-owned.";
  assertAccountScopeGuidance("account scope fixture", accountScope);
  assert.throws(
    () =>
      assertAccountScopeGuidance(
        "all customer-owned fixture",
        "All customer-scoped accounts are customer-owned. `issued` accounts are customer-owned. `external` accounts are customer-owned.",
      ),
    /platform-issued|must not say/,
  );

  const accountReference =
    "When `details.referenceRequired` is `true`, the sender must include the exact `details.reference` or funds may remain unmatched.";
  assertAccountReferenceGuidance("account reference fixture", accountReference);
  assert.throws(
    () =>
      assertAccountReferenceGuidance(
        "wrong reference path fixture",
        accountReference.replace("`details.referenceRequired`", "`reference.required`"),
      ),
    /account-reference unit/,
  );
  assert.throws(
    () =>
      assertAccountReferenceGuidance(
        "matched without reference fixture",
        accountReference.replace("funds may remain unmatched", "funds will still be matched"),
      ),
    /may remain unmatched/,
  );

  const accountFees =
    "This is pay-in fee configuration. `fixed` uses the account currency in major-unit form. `50` bips means `0.50%`.";
  assertAccountFeeGuidance("account fee fixture", accountFees);
  assert.throws(
    () =>
      assertAccountFeeGuidance(
        "payout fee fixture",
        accountFees.replace("pay-in", "payout"),
      ),
    /pay-in/,
  );
  assert.throws(
    () =>
      assertAccountFeeGuidance(
        "wrong bips fixture",
        accountFees.replace("`0.50%`", "`50%`"),
    ),
    /50-bips/,
  );
  assert.throws(
    () =>
      assertAccountFeeGuidance(
        "wrong fee currency fixture",
        accountFees.replace("account currency", "fee currency"),
      ),
    /account-currency major units/,
  );
  assert.throws(
    () =>
      assertAccountFeeGuidance(
        "minor-unit fee fixture",
        accountFees.replace("major-unit", "minor-unit"),
      ),
    /account-currency major units/,
  );

  const quoteSnapshots = [
    "The returned Quote's `in`, `out`, `rate`, and `fees` together form the executable snapshot. Do not recompute executable amounts from `rate` alone.",
    "A Transfer's `amounts.in` and `amounts.out` record the executed quote legs, while `fees` is the applied fee snapshot. `amounts.settled` records the amount actually delivered and is present once completed.",
  ].join("\n\n");
  assertQuoteSnapshotGuidance("snapshot fixture", quoteSnapshots);
  assert.throws(
    () =>
      assertQuoteSnapshotGuidance(
        "recomputed quote fixture",
        quoteSnapshots.replace("Do not recompute", "Recompute"),
      ),
    /do not recompute/,
  );
  assert.throws(
    () =>
      assertQuoteSnapshotGuidance(
        "rate-only quote fixture",
        quoteSnapshots.replace("`in`, `out`, `rate`, and `fees`", "`rate` and `fees`"),
    ),
    /must include `in`|must include `out`/,
  );
  assert.throws(
    () =>
      assertQuoteSnapshotGuidance(
        "estimated transfer fixture",
        quoteSnapshots.replace("applied fee snapshot", "live fee estimate"),
      ),
    /applied snapshot/,
  );
  assert.throws(
    () =>
      assertQuoteSnapshotGuidance(
        "settled quote fixture",
        quoteSnapshots.replace("amount actually delivered", "quoted output amount"),
      ),
    /actual settled amount/,
  );
  assert.throws(
    () =>
      assertQuoteSnapshotGuidance(
        "always-settled fixture",
        quoteSnapshots.replace("is present once completed", "is always present"),
      ),
    /actual settled amount/,
  );

  const quoteIdentity = [
    "`externalId` is non-unique and does not provide idempotency.",
    "`quote_already_executed` returns the existing `transferId`.",
  ].join("\n\n");
  assertQuoteTransferIdentityGuidance("quote identity fixture", quoteIdentity);
  assert.throws(
    () =>
      assertQuoteTransferIdentityGuidance(
        "unique external id fixture",
        quoteIdentity.replace("non-unique", "unique"),
      ),
    /externalId/,
  );
  assert.throws(
    () =>
      assertQuoteTransferIdentityGuidance(
        "idempotent external id fixture",
        quoteIdentity.replace("does not provide idempotency", "provides idempotency"),
    ),
    /externalId/,
  );
  assert.throws(
    () =>
      assertQuoteTransferIdentityGuidance(
        "new transfer id fixture",
        quoteIdentity.replace("existing `transferId`", "new `transferId`"),
      ),
    /existing transferId/,
  );

  const recipientWallets = [
    "Wallet ownership is a declaration only; verification is not performed at creation. `self_custodied` must not include `custodianName`. `custodial` requires a non-empty `custodianName`.",
    "Ready bank destinations can be fiat quote targets when other quote checks pass. Compatible ready wallet destinations can be stablecoin-move quote targets when they use the same network and asset.",
  ].join("\n\n");
  assertRecipientWalletGuidance("recipient wallet fixture", recipientWallets);
  assert.throws(
    () =>
      assertRecipientWalletGuidance(
        "verified ownership fixture",
        recipientWallets.replace(
          "a declaration only; verification is not performed at creation",
          "verified at creation",
        ),
      ),
    /unverified declaration/,
  );
  assert.throws(
    () =>
      assertRecipientWalletGuidance(
        "self-custodied custodian fixture",
        recipientWallets.replace("must not include", "must include"),
      ),
    /forbid custodianName/,
  );
  assert.throws(
    () =>
      assertRecipientWalletGuidance(
        "optional custodian fixture",
        recipientWallets.replace("requires a non-empty", "allows an optional"),
      ),
    /require a non-empty/,
  );
  assert.throws(
    () =>
      assertRecipientWalletGuidance(
        "any-status target fixture",
        recipientWallets.replace("Ready bank destinations", "Bank destinations at any current status"),
    ),
    /ready bank destinations/,
  );
  assert.throws(
    () =>
      assertRecipientWalletGuidance(
        "any-status wallet target fixture",
        recipientWallets.replace(
          "Compatible ready wallet destinations",
          "Wallet destinations at any current status",
        ),
      ),
    /compatible ready destinations/,
  );

  const ruleMatching =
    "Matching occurs on the account credit, not on the deposit rail. Fiat settled from an issued bank reaches the settlement wallet. Stablecoin deposits and internal transfers are caught alike.";
  assertRuleMatchingGuidance("rule matching fixture", ruleMatching);
  assert.throws(
    () =>
      assertRuleMatchingGuidance(
        "deposit rail fixture",
        ruleMatching.replace(
          "on the account credit, not on the deposit rail",
          "on the deposit rail, not on the account credit",
        ),
      ),
    /account credit/,
  );
  assert.throws(
    () =>
      assertRuleMatchingGuidance(
        "fiat-only fixture",
        ruleMatching.replace(
          "Stablecoin deposits and internal transfers are caught alike.",
          "Only fiat deposits are caught.",
        ),
      ),
    /stablecoin deposits/,
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
    assertDescriptionFragments(
      variant.properties.settlement.properties.accountId.description,
      `${variant.title} settlement account`,
      [/issued customer wallet account/i, /receives settled funds/i],
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
  assertDescriptionFragments(
    account.properties.statusReason.description,
    "account statusReason",
    [
      /absent on `ready` and `archived`/i,
      /`awaiting_assignment`[\s\S]*pooled account[\s\S]*first payin/i,
      /tolerate unknown future codes/i,
    ],
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
  assertAccountScopeGuidance("integration/accounts.mdx", text);
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

test("derives issued-bank references from account responses and keeps transfer references separate", () => {
  const responseAccounts = [
    [
      "account create response",
      responseDataSchema("post", "/v3/customers/{customerId}/accounts", "201"),
    ],
    [
      "account list item",
      resolveOpenApiReference(
        responseDataSchema("get", "/v3/customers/{customerId}/accounts").items,
      ),
    ],
    [
      "account detail response",
      responseDataSchema("get", "/v3/customers/{customerId}/accounts/{accountId}"),
    ],
  ];

  for (const [label, account] of responseAccounts) {
    assert.ok(account.required.includes("details"), `${label} must require details`);
    const details = account.properties.details;
    assert.equal(details.nullable, true, `${label} details must be nullable`);
    const variants = schemaVariants(details);
    assert.equal(variants.length, 5, `${label} must expose five details variants`);
    const referenceVariants = variants.filter(
      (variant) => variant.properties?.referenceRequired,
    );
    assert.equal(
      referenceVariants.length,
      4,
      `${label} must expose references on all four bank details variants`,
    );
    for (const variant of referenceVariants) {
      assert.equal(variant.properties.reference.type, "string");
      assert.equal(variant.properties.referenceRequired.type, "boolean");
    }
  }

  const account = resolveOpenApiReference(openapi.components.schemas.Account);
  const describedReferenceVariants = schemaVariants(account.properties.details).filter(
    (variant) => variant.properties?.referenceRequired,
  );
  assert.equal(describedReferenceVariants.length, 4);
  for (const variant of describedReferenceVariants) {
    assertDescriptionFragments(
      variant.properties.reference.description,
      "account details.reference",
      [/sender must include/i, /funds to match this issued account/i],
    );
    assertDescriptionFragments(
      variant.properties.referenceRequired.description,
      "account details.referenceRequired",
      [/omitting `reference`/i, /leave inbound funds unmatched/i],
    );
  }

  const instructionData = responseDataSchema(
    "get",
    "/v3/transfers/{transferId}/instructions",
  );
  const bankInstruction = schemaVariants(
    instructionData.properties.instructions,
  ).find((variant) => enumValues(variant.properties.type).includes("bank"));
  assert.ok(bankInstruction, "transfer instructions must include a bank variant");
  const instructionReference = bankInstruction.properties.reference;
  assert.equal(instructionReference.type, "object");
  assertExactSet(
    instructionReference.required,
    ["value", "required"],
    "transfer instruction reference fields",
  );
  assert.equal(instructionReference.properties.value.type, "string");
  assert.equal(instructionReference.properties.required.type, "boolean");

  assertAccountReferenceGuidance(
    "integration/accounts.mdx",
    requiredPage("integration/accounts"),
    { transferInstructions: true },
  );
  assertAccountReferenceGuidance(
    "integration/receive-funds.mdx",
    requiredPage("integration/receive-funds"),
    { transferInstructions: true },
  );
});

test("documents exact account fee read-back and replacement semantics", () => {
  const path = "/v3/customers/{customerId}/accounts/{accountId}/fees";
  const account = resolveOpenApiReference(openapi.components.schemas.Account);
  assert.ok(account.required.includes("fees"));
  const accountFees = account.properties.fees;
  assertDescriptionFragments(accountFees.description, "account fees", [
    /pay-in fee configuration/i,
    /account currency/i,
    /major-unit/i,
  ]);
  assertExactSet(accountFees.required, ["breakdown"], "account fee fields");
  const configuredDeveloper = accountFees.properties.breakdown.properties.developer;
  assert.equal(configuredDeveloper.nullable, true);
  assertDescriptionFragments(
    configuredDeveloper.properties.fixed.description,
    "account fixed fee",
    [/account currency/i, /major-unit decimal string/i],
  );
  assertDescriptionFragments(
    configuredDeveloper.properties.bips.description,
    "account bips fee",
    [/basis points/i, /`?50`? means `?0\.50%`?/i],
  );

  const get = openApiOperation("get", path).operationObject;
  assertDescriptionFragments(
    get.description,
    "account fee read operation",
    [/read-back mirror of the PUT shape/i, /`breakdown\.developer` is `null`/i],
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
  assertDescriptionFragments(
    readDeveloper.properties.fixed.description,
    "account fee read fixed",
    [/account currency/i, /major-unit decimal string/i],
  );
  assertDescriptionFragments(
    readDeveloper.properties.bips.description,
    "account fee read bips",
    [/`?50`? means `?0\.50%`?/i, /below 10000/i],
  );
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
  assertDescriptionFragments(
    put.description,
    "account fee replace operation",
    [/replaces developer fees/i, /major-unit decimal strings/i, /no wildcard|do not carry wildcard/i],
  );
  const request = requestBodySchema("put", path);
  assertExactSet(request.required, ["breakdown"], "account fee request fields");
  assertExactSet(request.properties.breakdown.required, ["developer"], "account fee request breakdown fields");
  const developer = request.properties.breakdown.properties.developer;
  assertExactSet(developer.required, ["fixed", "bips"], "account fee request developer fields");
  assert.equal(developer.properties.fixed.pattern, "^\\d+(?:\\.\\d{1,2})?$");
  assert.equal(developer.properties.bips.minimum, 0);
  assert.equal(developer.properties.bips.maximum, 9999);
  assertDescriptionFragments(
    developer.properties.bips.description,
    "account fee request bips",
    [/basis points/i, /`?50`? means `?0\.50%`?/i],
  );
  for (const properties of [
    request.properties,
    request.properties.breakdown.properties,
    developer.properties,
  ]) {
    assert.equal(properties.currency, undefined);
    assert.equal(properties.wildcard, undefined);
  }
  assertExactSet(problemCodes("put", path, "422"), ["developer_fee_invalid"], "account fee 422 codes");
  assertDescriptionFragments(
    responseObject("put", path, "422").description,
    "account fee 422 response",
    [/positive developer fee/i, /settlement network/i, /developer settlement wallet/i],
  );

  const text = requiredPage("integration/accounts");
  assertAccountFeeGuidance("integration/accounts.mdx", text);
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
  const walletRequest = schemaVariants(destinationSchema).find((variant) =>
    enumValues(variant.properties.type).includes("wallet"),
  );
  assert.ok(walletRequest, "destination create must include a wallet variant");
  assert.ok(walletRequest.required.includes("ownership"));
  assertDescriptionFragments(
    walletRequest.properties.ownership.description,
    "wallet ownership declaration",
    [/declaration only/i, /verification is not performed at create time/i],
  );
  const ownershipVariants = schemaVariants(walletRequest.properties.ownership);
  const selfCustodied = ownershipVariants.find((variant) =>
    enumValues(variant.properties.type).includes("self_custodied"),
  );
  const custodial = ownershipVariants.find((variant) =>
    enumValues(variant.properties.type).includes("custodial"),
  );
  assert.ok(selfCustodied);
  assert.ok(custodial);
  assertExactSet(selfCustodied.required, ["type"], "self-custodied ownership fields");
  assertExactSet(
    selfCustodied.not.required,
    ["custodianName"],
    "self-custodied forbidden fields",
  );
  assertExactSet(
    custodial.required,
    ["type", "custodianName"],
    "custodial ownership fields",
  );
  assert.equal(custodial.properties.custodianName.type, "string");
  assert.equal(custodial.properties.custodianName.minLength, 1);

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
    assertDescriptionFragments(variant.properties.status.description, `${variant.title} status`, [
      /`ready` means lifecycle checks passed/i,
      /ready bank destinations can be fiat quote targets/i,
      /ready wallet destinations can be stablecoin-move targets/i,
      /same network and asset/i,
    ]);
    const statusReason = variant.properties.statusReason;
    assertDescriptionFragments(
      statusReason.description,
      `${variant.title} statusReason`,
      [/present exactly when status is action_required/i, /omitted otherwise/i],
    );
    const reason = resolveOpenApiReference(statusReason.allOf[0]);
    assertExactSet(reason.required, ["code", "message", "actor", "retryable"], `${variant.title} statusReason fields`);
  }

  assertExactSet(problemCodes("post", destinationPath, "422"), ["recipient_address_required"], "destination create 422 codes");

  const text = requiredPage("integration/recipients");
  assertRecipientWalletGuidance("integration/recipients.mdx", text);
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
  assertDescriptionFragments(
    quoteRequest.description,
    "quote request",
    [
      /exactly one of `in\.amount` or `out\.amount`/i,
      /same-network, same-currency/i,
      /cross-chain bridging and asset swaps are not supported/i,
    ],
  );
  assert.ok(!quoteRequest.required.includes("externalId"));
  assertDescriptionFragments(
    quoteRequest.properties.externalId.description,
    "quote externalId",
    [/merchant-supplied opaque reference/i, /not required to be unique/i],
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
  assertDescriptionFragments(
    quoteFees.description,
    "quote fee override",
    [
      /optional quote-level developer fee override/i,
      /overrides account fees for this quote only/i,
      /`stablecoin_transfers` wallet move[\s\S]*zero fees only/i,
      /`422 amount_not_deliverable`/i,
    ],
  );
  assertExactSet(quoteFees.required, ["breakdown"], "quote fee override fields");
  assertExactSet(quoteFees.properties.breakdown.required, ["developer"], "quote fee override breakdown fields");
  const quoteFeeDeveloper = quoteFees.properties.breakdown.properties.developer;
  assertExactSet(quoteFeeDeveloper.required, ["fixed", "bips"], "quote fee override developer fields");
  assert.equal(quoteFeeDeveloper.properties.fixed.pattern, "^\\d+(\\.\\d{1,2})?$");
  assert.equal(quoteFeeDeveloper.properties.bips.minimum, 0);
  assert.equal(quoteFeeDeveloper.properties.bips.maximum, 9999);

  const quoteResponse = responseDataSchema("post", quotePath, "201");
  for (const field of ["in", "out", "rate", "fees"]) {
    assert.ok(quoteResponse.required.includes(field), `quote response must require ${field}`);
  }
  const quoteFeeLine = quoteResponse.properties.fees.items;
  assertExactSet(quoteFeeLine.required, ["beneficiary", "amount", "currency"], "quote fee-line fields");
  assertExactSet(enumValues(quoteFeeLine.properties.beneficiary), ["developer", "service"], "quote fee beneficiaries");
  assertExactSet(quoteFeeLine.properties.rule.required, ["fixed", "bips"], "quote fee rule fields");

  const transferRequest = requestBodySchema("post", transferPath);
  assertExactSet(transferRequest.required, ["quoteId"], "transfer request required fields");
  assert.ok(!transferRequest.required.includes("externalId"));
  assertDescriptionFragments(
    transferRequest.properties.externalId.description,
    "transfer externalId",
    [/correlation reference/i, /not required to be unique/i, /independent of the quote's externalId/i],
  );
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
  assert.ok(transferResponse.required.includes("amounts"));
  assertExactSet(enumValues(transferResponse.properties.state), enumValues(transfer.properties.state), "transfer create response states");
  assert.ok(transferResponse.required.includes("fees"));
  assertExactSet(
    transferResponse.properties.amounts.required,
    ["in", "out"],
    "transfer applied amount fields",
  );
  assert.ok(!transferResponse.properties.amounts.required.includes("settled"));
  assertDescriptionFragments(
    transferResponse.properties.amounts.properties.settled.description,
    "transfer settled amount",
    [/actually delivered amount/i, /present once completed/i],
  );
  assertDescriptionFragments(
    transferResponse.properties.fees.description,
    "transfer fees",
    [/applied fee snapshot/i, /same shape as the quote fee lines/i],
  );
  assert.deepEqual(transferResponse.properties.fees.items, quoteFeeLine);

  const transferConflictMedia = responseObject("post", transferPath, "409").content[
    "application/problem+json"
  ];
  const transferConflict = resolveOpenApiReference(transferConflictMedia.schema);
  assert.equal(transferConflict.properties.transferId.type, "string");
  assertDescriptionFragments(
    transferConflict.properties.transferId.description,
    "quote_already_executed transferId",
    [/existing transfer/i, /consumed the quote/i, /present on `quote_already_executed`/i],
  );
  const quoteAlreadyExecuted = Object.values(transferConflictMedia.examples).find(
    (example) => example.value?.code === "quote_already_executed",
  );
  assert.ok(quoteAlreadyExecuted, "transfer 409 examples must include quote_already_executed");
  assert.match(quoteAlreadyExecuted.value.transferId, /^tr_[a-zA-Z0-9]+$/);

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
  assertQuoteSnapshotGuidance("integration/quotes-and-transfers.mdx", text);
  assertQuoteTransferIdentityGuidance("integration/quotes-and-transfers.mdx", text);
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
  assertDescriptionFragments(
    transfer.properties.openTaskIds.description,
    "transfer openTaskIds",
    [/transfer-scoped tasks/i, /`action_required` or `in_review`/i, /empty when nothing is open/i],
  );
  assertDescriptionFragments(
    transfer.properties.state.description,
    "transfer state",
    [
      /`processing` covers funds received through settlement/i,
      /`action_required`[\s\S]*open transfer tasks/i,
      /`canceled`[\s\S]*unfunded deposit window expires/i,
      /closed enum/i,
    ],
  );
  assert.ok(transfer.required.includes("stateDetail"));
  assert.equal(transfer.properties.stateDetail.nullable, true);
  assertDescriptionFragments(
    transfer.properties.stateDetail.description,
    "transfer stateDetail",
    [/nullable on happy-path states/i, /required for action_required/i, /non-terminal blocking\/failure states/i],
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
  assertDescriptionFragments(
    instructionOperation.description,
    "transfer instruction operation",
    [
      /typed deposit instructions/i,
      /payout-side transfers[\s\S]*have no instructions/i,
      /404[\s\S]*`transfer_has_no_instructions`/i,
    ],
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
  assertDescriptionFragments(
    cancel.description,
    "transfer cancellation operation",
    [/`409 transfer_not_cancelable`/i, /no current transfer state is cancelable/i],
  );
  assert.deepEqual(successStatuses("post", cancelPath), []);
  assertDescriptionFragments(
    responseObject("post", cancelPath, "409").description,
    "transfer cancellation response",
    [/not cancelable/i, /`transfer_not_cancelable`/i],
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
  assertDescriptionFragments(
    bank.properties.reference.properties.required.description,
    "transfer instruction reference.required",
    [/deposit must carry this reference to be matched/i, /pooled accounts match deposits by reference/i, /named virtual accounts match by account number/i],
  );
  assertDescriptionFragments(
    bank.properties.localAmount.description,
    "transfer instruction localAmount",
    [/local settlement currency/i, /rail settles in a currency different/i, /quoted in amount/i],
  );

  for (const page of [
    "integration/quotes-and-transfers",
    "integration/receive-funds",
  ]) {
    const text = requiredPage(page);
    assert.match(
      text,
      /`reference\.required`[\s\S]{0,140}(?:true|`true`)[\s\S]{0,180}exact (?:returned )?(?:`reference\.value`|reference)[\s\S]{0,160}(?:accompany|included with) the deposit/i,
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
  assertDescriptionFragments(
    transfer.properties.instructions.description,
    "transfer instructions",
    [/deposit instructions/i, /null for payout-side transfers/i, /funded from the source account/i],
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
  assertDescriptionFragments(
    quoteRequest.properties.in.properties.accountId.description,
    "quote source account",
    [
      /stablecoin-funded quotes/i,
      /active issued custodial account/i,
      /owned by the request customer/i,
      /scoped default issued account is used when omitted/i,
      /ignored for fiat-funded quotes/i,
    ],
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
  const rulesTag = openapi.tags.find((tag) => tag.name === "rules");
  assert.ok(rulesTag, "OpenAPI must define the rules tag");
  assertDescriptionFragments(rulesTag.description, "rules tag", [
    /match at the account credit, not at the deposit rail/i,
    /fiat deposits settle into the issued bank account's settlement wallet account/i,
    /stablecoin deposits/i,
    /internal transfers alike/i,
  ]);
  const create = openApiOperation("post", createPath).operationObject;
  const schema = requestBodySchema("post", createPath);
  assertExactSet(schema.required, ["trigger", "action"], "rule request fields");
  assertExactSet(schema.properties.trigger.required, ["type", "accountId"], "rule trigger fields");
  assertExactSet(enumValues(schema.properties.trigger.properties.type), ["funds_received"], "rule trigger types");
  assertDescriptionFragments(
    schema.properties.trigger.properties.accountId.description,
    "rule trigger account",
    [/custodial wallet account/i, /watched by this rule/i],
  );
  assertExactSet(schema.properties.action.required, ["type", "target"], "rule action fields");
  assertExactSet(enumValues(schema.properties.action.properties.type), ["transfer"], "rule action types");
  assertExactSet(
    enumValues(schema.properties.action.properties.target.properties.type),
    ["account", "destination"],
    "rule target types",
  );
  assertDescriptionFragments(
    schema.properties.action.properties.target.description,
    "rule target",
    [
      /`account` for another custodial wallet account/i,
      /`destination` for a recipient destination/i,
      /non-custodial wallet destinations/i,
    ],
  );

  const rule = responseDataSchema("post", createPath, "201");
  assertExactSet(enumValues(rule.properties.status), ["active", "paused", "archived"], "rule statuses");
  const update = requestBodySchema("patch", detailPath);
  assertExactSet(enumValues(update.properties.status), ["active", "paused"], "rule update statuses");
  assertDescriptionFragments(
    openApiOperation("delete", detailPath).operationObject.description,
    "rule archive operation",
    [/archiving is terminal/i, /frees the trigger account/i, /archived rule stays readable/i],
  );
  assert.match(create.responses["409"].description, /`rule_already_exists`/);
  assert.match(openApiOperation("patch", detailPath).operationObject.description, /`rule_archived`/);

  const text = requiredPage("integration/rules");
  assertRuleMatchingGuidance("integration/rules.mdx", text);
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
      assertDescriptionFragments(
        parameter.description,
        `${method.toUpperCase()} ${path} idempotency parameter`,
        [/required for effectful v3 requests/i, /reuse the same key/i],
      );

      if (documentsReplayHeader(method, path)) {
        for (const status of successStatuses(method, path)) {
          const header = responseHeader(method, path, status, "Idempotency-Replayed");
          assert.ok(header, `${method.toUpperCase()} ${path} ${status} must document replay header`);
          assertExactSet(enumValues(header.schema), ["true"], `${method.toUpperCase()} ${path} replay header values`);
          assertDescriptionFragments(
            header.description,
            `${method.toUpperCase()} ${path} ${status} replay header`,
            [/present with value `true`/i, /when an idempotent request is replayed/i],
          );
        }
      } else {
        assert.deepEqual(
          [method, path],
          ["post", "/v3/transfers/{transferId}/cancel"],
          `unexpected write operation without Idempotency-Replayed: ${method.toUpperCase()} ${path}`,
        );
      }
    }
    const text = requiredPage(page);
    assertSharedFinancialSafetyGuidance(pageFile(page), text);
    assertOperationSafetyAssociationsInText(pageFile(page), text, operations);
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
