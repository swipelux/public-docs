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

function headingSections(text) {
  const headings = [...text.matchAll(/^## (.+)$/gm)];
  return headings.map((match, index) => ({
    heading: match[1],
    text: text.slice(match.index, headings[index + 1]?.index ?? text.length),
  }));
}

function sectionTextMatching(text, pattern, label) {
  const section = headingSections(text).find(({ heading }) => pattern.test(heading));
  assert.ok(section, `Missing semantic section: ${label}`);
  return section.text;
}

function assertSemanticSectionsInOrder(text, requirements) {
  const headings = h2Headings(text);
  let previousIndex = -1;

  for (const [label, pattern] of requirements) {
    const index = headings.findIndex(
      (heading, candidateIndex) =>
        candidateIndex > previousIndex && pattern.test(heading),
    );
    assert.notEqual(index, -1, `Missing or misplaced semantic section: ${label}`);
    previousIndex = index;
  }
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

function assertNoUnsupportedWebhookGuarantees(label, text) {
  const unsupportedClaims = [
    [
      /\b(?:HMAC|WEBHOOK_SECRET|webhook secret|signing secret|signature header|webhooks? (?:are|is) signed|signed webhooks?|(?:verify|validate)[^.]{0,40}(?:webhook )?signature|authenticate[^.]{0,40}webhook requests?|X-[A-Za-z0-9-]*Signature)\b/i,
      "webhook signing or secret behavior",
    ],
    [
      /\b(?:retry every|(?:retry|retries)[^.]{0,60}\b(?:after|at|in)\s+\d+(?:\s+(?:seconds?|minutes?|hours?))?|fixed (?:retry|backoff)|retry cadence|exponential backoff|backoff schedule)\b/i,
      "fixed webhook retry timing",
    ],
    [
      /\b(?:(?:events?|deliver(?:y|ies)) (?:are |is )?(?:always |strictly )?(?:ordered|delivered in order)|delivery ordering (?:is )?guaranteed|(?:preserves?|guarantees?)[^.]{0,40}event ordering)\b/i,
      "webhook delivery ordering",
    ],
    [
      /(?:\b(?:webhooks?|events?|deliver(?:y|ies|ed|ing))\b[^.!?\n]{0,100}\b(?:exactly[ -]once|at[ -]least[ -]once|once and only once)\b|\b(?:exactly[ -]once|at[ -]least[ -]once|once and only once)\b[^.!?\n]{0,100}\b(?:webhooks?|events?|deliver(?:y|ies|ed|ing))\b)/i,
      "webhook delivery cardinality",
    ],
  ];

  for (const [pattern, claim] of unsupportedClaims) {
    assert.doesNotMatch(text, pattern, `${label} invents ${claim}`);
  }
}

function assertPublishedReconciliationCheckpoint(label, source) {
  const captures = [
    ...source.matchAll(
      /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*new Date\(\)\.toISOString\(\)\s*;/g,
    ),
  ];
  assert.equal(captures.length, 1, `${label} must capture one run timestamp`);

  const capture = captures[0];
  const timestampIdentifier = captures[0][1];
  const checkpointWrites = [
    ...source.matchAll(
      /\b(?:(await)\s+)?([A-Za-z_$][\w$]*checkpoint[A-Za-z_$\w]*)\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/gi,
    ),
  ];
  assert.equal(
    checkpointWrites.length,
    1,
    `${label} must contain exactly one checkpoint write`,
  );
  const checkpointWrite = checkpointWrites[0];
  assert.equal(checkpointWrite[1]?.toLowerCase(), "await", `${label} must await the checkpoint write`);
  assert.equal(
    checkpointWrite[3],
    timestampIdentifier,
    `${label} must save the captured timestamp`,
  );

  const applyLoop = source.match(
    /\bfor\s*\(\s*const\s+[A-Za-z_$][\w$]*\s+of\s+[A-Za-z_$][\w$]*\.values\(\)\s*\)\s*\{/,
  );
  assert.ok(applyLoop, `${label} must apply the deduplicated resources`);
  const applyLoopStart = applyLoop.index;
  const openingBrace = applyLoopStart + applyLoop[0].lastIndexOf("{");
  let depth = 0;
  let applyLoopEnd = -1;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) {
      applyLoopEnd = index;
      break;
    }
  }
  assert.ok(applyLoopEnd >= 0, `${label} must close the resource apply loop`);

  const currentStateWrites = [...source.matchAll(/\bapplyCurrentState\s*\(/g)];
  assert.ok(currentStateWrites.length >= 1, `${label} must apply current state`);
  for (const write of currentStateWrites) {
    assert.ok(
      write.index < checkpointWrite.index,
      `${label} must not apply current state after the checkpoint`,
    );
  }
  for (const request of source.matchAll(/\bfetch\s*\(/g)) {
    assert.ok(
      request.index < checkpointWrite.index,
      `${label} must not make API requests after the checkpoint`,
    );
  }

  const steps = [
    ["capture the timestamp", capture.index],
    ["make the first request", source.indexOf("await fetch(")],
    ["advance the cursor", source.indexOf("cursor = nextCursor;")],
    ["finish pagination", source.indexOf("} while (hasMore);")],
    ["start applying current state", applyLoopStart],
    ["apply current state", currentStateWrites[0].index],
    ["finish applying current state", applyLoopEnd],
    ["save the checkpoint", checkpointWrite.index],
  ];
  for (const [step, index] of steps) {
    assert.ok(index >= 0, `${label} must ${step}`);
  }
  const positions = steps.map(([, index]) => index);
  assert.deepEqual(positions, positions.toSorted((left, right) => left - right));
}

function assertRuleOperationResponsibilities(label, text) {
  assert.match(text, /include rules?[^.]{0,120}periodic reconciliation/i);
  assert.match(
    text,
    /(?:directly\s+)?(?:refetch|read)[^.]{0,100}(?:current\s+)?rule[^.]{0,120}before[^.]{0,120}(?:operator action|operator[^.]{0,60}(?:changes?|acts?))|before[^.]{0,120}(?:operator action|operator[^.]{0,60}(?:changes?|acts?))[^.]{0,120}(?:directly\s+)?(?:refetch|read)[^.]{0,100}(?:current\s+)?rule/i,
    `${label} must directly refetch the current rule before operator changes`,
  );
  assert.doesNotMatch(
    text,
    /(?:^|[.!?]\s+)(?!(?:do not|don't|never)\b)[^.!?\n]{0,100}\breconciliation\b[^.!?\n]{0,100}\bbefore every operator action\b/im,
    `${label} must not require reconciliation before every operator action`,
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
  assertSemanticSectionsInOrder(text, [
    ["endpoint registration", /(?:register|create).*(?:endpoint|webhook)/i],
    ["event processing", /(?:process|handle).*(?:event|delivery)/i],
    ["current-resource refetch", /(?:refetch|read).*(?:current )?(?:state|resource)/i],
    ["delivery replay", /replay.*(?:delivery|event)|(?:delivery|event).*replay/i],
    ["missed-change recovery", /recover.*(?:missed|changes)|reconcil/i],
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

  const register = sectionTextMatching(
    text,
    /(?:register|create).*(?:endpoint|webhook)/i,
    "endpoint registration",
  );
  assert.match(register, /data\.id[\s\S]{0,120}WEBHOOK_ID/i);
  assert.match(register, /data\.status[\s\S]{0,120}WEBHOOK_STATUS/i);
  assert.equal(
    (text.match(/\]\(\/integration\/api-reliability\)/g) ?? []).length,
    1,
    "Webhooks should link API reliability once for configuration writes",
  );

  const process = sectionTextMatching(
    text,
    /(?:process|handle).*(?:event|delivery)/i,
    "event processing",
  );
  const subscriptionNames = enumValues(
    requestBodySchema("post", "/v3/webhooks").properties.events.items,
  );
  const publishedPayloadNames = Object.keys(openapi.webhooks ?? {});
  const namesWithoutPayloadPages = subscriptionNames.filter(
    (name) => !publishedPayloadNames.includes(name),
  );
  assertExactSet(
    namesWithoutPayloadPages,
    ["api.deprecation", "transfer.created"],
    "subscribable webhook names without published payload contracts",
  );
  assert.doesNotMatch(process, /contract-backed payload pages?|endpoint allowlist/i);
  assert.match(process, /`api\.deprecation`/);
  assert.match(process, /`transfer\.created`/);
  assert.match(
    process,
    /payloads?[\s\S]{0,180}(?:are |is )?not documented/i,
  );
  assert.match(
    process,
    /do not infer[^.]{0,100}(?:their )?(?:fields?|properties)[\s\S]{0,160}contact Swipelux[\s\S]{0,120}before subscribing/i,
  );
  assert.match(
    process,
    /for (?:each|a) documented event[^.]{0,140}(?:use|open|see)[^.]{0,100}(?:event(?:'s)?|corresponding)[^.]{0,80}API Reference page/i,
  );
  assert.doesNotMatch(process, /defines every supported payload/i);
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

  const refetch = sectionTextMatching(
    text,
    /(?:refetch|read).*(?:current )?(?:state|resource)/i,
    "current-resource refetch",
  );
  assert.match(refetch, /`resource\.type`[\s\S]{0,100}`resource\.id`/i);
  assert.match(refetch, /authenticated[\s\S]{0,120}current state/i);
  assert.ok(refetch.includes(operationMarkdown("get", "/v3/transfers/{transferId}")));
  const transferRead = examples.filter(
    ({ method, path }) =>
      method === "get" && path === "/v3/transfers/{transferId}",
  );
  assert.equal(transferRead.length, 1);
  assertCurlMatchesOpenApi(transferRead[0], "transfer refetch");

  const replay = sectionTextMatching(
    text,
    /replay.*(?:delivery|event)|(?:delivery|event).*replay/i,
    "delivery replay",
  );
  assert.ok(replay.includes(operationMarkdown("get", "/v3/webhooks/portal")));
  assert.match(replay, /delivery logs[\s\S]{0,100}retries[\s\S]{0,100}manual replay/i);
  assert.match(replay, /returned `url`[\s\S]{0,120}(?:store|open|use)/i);
  assert.deepEqual(responseSchema("get", "/v3/webhooks/portal").required, ["url"]);

  const recover = sectionTextMatching(
    text,
    /recover.*(?:missed|changes)|reconcil/i,
    "missed-change recovery",
  );
  assert.match(recover, /\]\(\/integration\/sync-and-reconciliation\)/);
  assert.ok(wordCount(text) <= 900, "Webhooks must stay at or below 900 words");
});

test("webhook copy rejects unsupported delivery guarantees", () => {
  const integrationPages = [
    ...new Set(
      collectNavigationPages(config.navigation).filter((page) =>
        page.startsWith("integration/"),
      ),
    ),
  ];
  for (const page of integrationPages) {
    assertNoUnsupportedWebhookGuarantees(pageFile(page), requiredPage(page));
  }

  for (const badClaim of [
    "Verify the HMAC with your webhook secret.",
    "Webhooks are signed with a signature header.",
    "Set WEBHOOK_SECRET and use it to authenticate webhook requests.",
    "Retry after 30 seconds.",
    "Swipelux retries failed deliveries in 30 seconds.",
    "Failed deliveries use exponential backoff.",
    "Deliveries are strictly ordered.",
    "Swipelux preserves event ordering.",
    "Delivery is exactly-once.",
    "Delivery is at-least-once.",
    "Each event is delivered once and only once.",
  ]) {
    assert.throws(
      () => assertNoUnsupportedWebhookGuarantees("mutation fixture", badClaim),
      { name: "AssertionError" },
      `Expected unsupported webhook claim to fail: ${badClaim}`,
    );
  }

  assert.doesNotThrow(() =>
    assertNoUnsupportedWebhookGuarantees(
      "unrelated frequency fixture",
      "Run the command at least once before continuing.",
    ),
  );
});

test("API reliability explains one idempotent write and one Problem response", () => {
  const text = requiredPage("integration/api-reliability");
  assertSemanticSectionsInOrder(text, [
    ["idempotent writes", /idempoten/i],
    ["uncertain-response recovery", /uncertain|retry.*response/i],
    ["error handling", /^Handle errors$/],
    ["correlation logging", /correlation/i],
    ["next developer action", /^Next(?: step|: .+)?$/i],
  ]);
  assert.ok(
    h2Headings(text).includes("Handle errors"),
    "API reliability must retain the ## Handle errors anchor",
  );

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

  const idempotency = sectionTextMatching(
    text,
    /idempoten/i,
    "idempotent writes",
  );
  assert.match(idempotency, /one (?:key|`Idempotency-Key`)[\s\S]{0,100}intended effect/i);
  const uncertain = sectionTextMatching(
    text,
    /uncertain|retry.*response/i,
    "uncertain-response recovery",
  );
  assert.match(uncertain, /same key[\s\S]{0,100}identical (?:request and )?body/i);
  assert.match(
    uncertain,
    /intended effect[\s\S]{0,80}(?:changes|different)[\s\S]{0,80}new key/i,
  );

  const problem = openapi.paths["/v3/customers"].post.responses["409"].content[
    "application/problem+json"
  ].examples.requestInProgress.value;
  const errors = sectionTextMatching(text, /^Handle errors$/, "error handling");
  assert.ok(hasDeepEqual(jsonBlocks(errors), problem), "Use the exact OpenAPI Problem example");
  assert.match(errors, /`retryable`[\s\S]{0,140}unchanged retry[\s\S]{0,120}may succeed/i);
  assert.match(errors, /does not make every error retryable|not every error is retryable/i);

  const correlation = sectionTextMatching(
    text,
    /correlation/i,
    "correlation logging",
  );
  assert.match(correlation, /`correlationId`/);
  assert.match(correlation, /local request[\s\S]{0,120}customer[\s\S]{0,120}resource/i);

  const next = sectionTextMatching(
    text,
    /^Next(?: step|: .+)?$/i,
    "next developer action",
  );
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
  assertPublishedReconciliationCheckpoint("reconciliation example", javascript[0]);
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
  assert.match(
    text,
    /first run[\s\S]{0,160}deliberate[\s\S]{0,120}RFC 3339 timestamp/i,
  );
  assert.match(
    text,
    /at or before[\s\S]{0,120}earliest data[\s\S]{0,120}backfill/i,
  );
  assert.match(
    text,
    /do not initialize[\s\S]{0,140}(?:end-of-run|current) timestamp[\s\S]{0,140}skip/i,
  );
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

test("published reconciliation example rejects unsafe checkpoint mutations", () => {
  const text = requiredPage("integration/sync-and-reconciliation");
  const [source] = [...text.matchAll(/```(?:js|javascript)\n([\s\S]*?)```/g)].map(
    (match) => match[1],
  );
  const wrongTimestamp = source.replace(
    "await saveCheckpoint(runStartedAt);",
    "await saveCheckpoint(updatedAfter);",
  );
  const checkpointBeforeApply = source
    .replace("  await saveCheckpoint(runStartedAt);\n", "")
    .replace(
      "  for (const resource of resourcesById.values()) {",
      "  await saveCheckpoint(runStartedAt);\n\n  for (const resource of resourcesById.values()) {",
    );
  const additionalCheckpoint = source.replace(
    "  await saveCheckpoint(runStartedAt);",
    "  await saveCheckpoint(runStartedAt);\n  await saveCheckpoint(updatedAfter);",
  );
  const additionalUpdateCheckpoint = source.replace(
    "  await saveCheckpoint(runStartedAt);",
    "  await saveCheckpoint(runStartedAt);\n  await updateCheckpoint(runStartedAt);",
  );
  const postCheckpointApply = source.replace(
    "  await saveCheckpoint(runStartedAt);",
    "  await saveCheckpoint(runStartedAt);\n  await applyCurrentState(\"late\", {});",
  );
  const postCheckpointFetch = source.replace(
    "  await saveCheckpoint(runStartedAt);",
    "  await saveCheckpoint(runStartedAt);\n  await fetch(\"https://platform.swipelux.com/v3/customers\");",
  );
  const checkpointInsideApplyLoop = source
    .replace("\n  await saveCheckpoint(runStartedAt);", "")
    .replace(
      "    await applyCurrentState(resource.id, resource);",
      "    await applyCurrentState(resource.id, resource);\n    await saveCheckpoint(runStartedAt);",
    );
  const unawaitedCheckpoint = source.replace(
    "  await saveCheckpoint(runStartedAt);",
    "  saveCheckpoint(runStartedAt);",
  );
  const postCheckpointLogging = source.replace(
    "await saveCheckpoint(runStartedAt);",
    'await saveCheckpoint(runStartedAt);\n  console.info("Reconciliation complete");',
  );
  const renamedCheckpoint = source.replaceAll("saveCheckpoint", "persistCheckpoint");
  const updatedCheckpoint = source.replaceAll("saveCheckpoint", "updateCheckpoint");

  for (const [label, mutation] of [
    ["wrong timestamp", wrongTimestamp],
    ["checkpoint before apply", checkpointBeforeApply],
    ["additional checkpoint", additionalCheckpoint],
    ["additional update checkpoint", additionalUpdateCheckpoint],
    ["state apply after checkpoint", postCheckpointApply],
    ["request after checkpoint", postCheckpointFetch],
    ["checkpoint inside apply loop", checkpointInsideApplyLoop],
    ["unawaited checkpoint", unawaitedCheckpoint],
  ]) {
    assert.notEqual(mutation, source, `${label} fixture must change the example`);
    assert.throws(
      () => assertPublishedReconciliationCheckpoint(label, mutation),
      { name: "AssertionError" },
    );
  }
  assert.doesNotThrow(() =>
    assertPublishedReconciliationCheckpoint(
      "post-checkpoint logging",
      postCheckpointLogging,
    ),
  );
  assert.doesNotThrow(() =>
    assertPublishedReconciliationCheckpoint("renamed checkpoint helper", renamedCheckpoint),
  );
  assert.doesNotThrow(() =>
    assertPublishedReconciliationCheckpoint("updated checkpoint helper", updatedCheckpoint),
  );
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
  const smokeTest = one(
    /(?:plan and run|run)[\s\S]{0,80}low-risk production smoke test[\s\S]{0,120}before broad writes/i,
    "Missing developer-controlled production smoke test",
  );
  for (const field of [
    /customer/i,
    /capability/i,
    /expected readback/i,
    /owner/i,
    /stop condition/i,
  ]) {
    assert.match(smokeTest, field);
  }
  assert.match(text, /description: "[^"]*plan[^"]*production smoke test[^"]*"/i);
  assert.match(
    text,
    /run the (?:planned )?smoke test[\s\S]{0,120}verify (?:the )?expected readback[\s\S]{0,180}after it succeeds[\s\S]{0,100}expand production writes/i,
  );
  assert.doesNotMatch(text, /\bagree\b|\bagreed\b|with Swipelux/i);

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
  assert.match(
    text,
    /expand(?:ing)? production (?:writes|traffic)[\s\S]{0,140}while[\s\S]{0,120}recovery paths?[\s\S]{0,80}(?:remain|stay) enabled/i,
  );
  assert.doesNotMatch(
    text,
    /expand(?:ing)? production (?:writes|traffic)[\s\S]{0,100}through[\s\S]{0,100}recovery paths?/i,
    "Production writes expand while recovery remains enabled, not through recovery paths",
  );
  assert.doesNotMatch(text, /\b\d+ generated webhook|event-to-read|event matrix/i);
  assert.ok(wordCount(text) <= 800, "Production readiness must stay at or below 800 words");
});

test("rules use periodic reconciliation and a direct refetch before operator actions", () => {
  const text = requiredPage("integration/rules");
  assertRuleOperationResponsibilities("Rules", text);

  assert.throws(
    () =>
      assertRuleOperationResponsibilities(
        "unsafe rules mutation",
        "Include rules in periodic reconciliation. Directly refetch the current rule before an operator acts on it. Run reconciliation before every operator action.",
      ),
    { name: "AssertionError" },
  );
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
