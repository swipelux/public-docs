import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { collectNavigationPages } from "../scripts/lib/docs-validation.mjs";
import {
  assertFrontmatter,
  assertNoBannedText,
  readPage,
} from "./helpers/content.mjs";

const PAGES = [
  "integration/webhooks",
  "integration/sandbox",
  "integration/production-readiness",
];

const WEBHOOK_OPERATIONS = [
  ["post", "/v3/webhooks"],
  ["get", "/v3/webhooks"],
  ["patch", "/v3/webhooks/{webhookId}"],
  ["delete", "/v3/webhooks/{webhookId}"],
  ["get", "/v3/webhooks/portal"],
];

const WEBHOOK_WRITE_OPERATIONS = [
  ["post", "/v3/webhooks"],
  ["patch", "/v3/webhooks/{webhookId}"],
  ["delete", "/v3/webhooks/{webhookId}"],
];

const EXPECTED_WEBHOOK_EVENTS = [
  "account.created",
  "account.details_changed",
  "account.status_changed",
  "application.status_changed",
  "capability.created",
  "capability.status_changed",
  "customer.archived",
  "customer.created",
  "customer.updated",
  "destination.status_changed",
  "recipient.status_changed",
  "transfer.state_changed",
];

const EXPECTED_UNCOVERED_WEBHOOK_ALLOWLIST_VALUES = [
  "api.deprecation",
  "transfer.created",
];

const EXPECTED_WEBHOOK_ALLOWLIST_VALUES = [
  ...EXPECTED_WEBHOOK_EVENTS,
  ...EXPECTED_UNCOVERED_WEBHOOK_ALLOWLIST_VALUES,
];

const WEBHOOK_RECONCILIATION_MATRIX = [
  {
    event: "customer.created",
    operations: [["get", "/v3/customers/{customerId}"]],
    parents: [],
  },
  {
    event: "customer.updated",
    operations: [["get", "/v3/customers/{customerId}"]],
    parents: [],
  },
  {
    event: "customer.archived",
    operations: [["get", "/v3/customers"]],
    parents: [],
  },
  {
    event: "capability.created",
    operations: [
      ["get", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
      ["get", "/v3/customers/{customerId}/capabilities"],
    ],
    parents: ["customerId"],
  },
  {
    event: "capability.status_changed",
    operations: [
      ["get", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
      ["get", "/v3/customers/{customerId}/capabilities"],
    ],
    parents: ["customerId"],
  },
  {
    event: "application.status_changed",
    operations: [
      [
        "get",
        "/v3/customers/{customerId}/capabilities/{capabilityId}/applications",
      ],
    ],
    parents: ["customerId", "capabilityId"],
  },
  {
    event: "recipient.status_changed",
    operations: [
      ["get", "/v3/customers/{customerId}/recipients/{recipientId}"],
      ["get", "/v3/customers/{customerId}/recipients"],
    ],
    parents: ["customerId"],
  },
  {
    event: "destination.status_changed",
    operations: [
      [
        "get",
        "/v3/customers/{customerId}/recipients/{recipientId}/destinations/{destinationId}",
      ],
      [
        "get",
        "/v3/customers/{customerId}/recipients/{recipientId}/destinations",
      ],
    ],
    parents: ["customerId", "recipientId"],
  },
  {
    event: "account.created",
    operations: [
      ["get", "/v3/customers/{customerId}/accounts/{accountId}"],
      ["get", "/v3/customers/{customerId}/accounts"],
    ],
    parents: ["customerId"],
  },
  {
    event: "account.status_changed",
    operations: [
      ["get", "/v3/customers/{customerId}/accounts/{accountId}"],
      ["get", "/v3/customers/{customerId}/accounts"],
    ],
    parents: ["customerId"],
  },
  {
    event: "account.details_changed",
    operations: [
      ["get", "/v3/customers/{customerId}/accounts/{accountId}"],
      ["get", "/v3/customers/{customerId}/accounts"],
    ],
    parents: ["customerId"],
  },
  {
    event: "transfer.state_changed",
    operations: [["get", "/v3/transfers/{transferId}"]],
    parents: [],
  },
];

const WEBHOOK_RECONCILIATION_OPERATIONS = [
  ...new Map(
    WEBHOOK_RECONCILIATION_MATRIX.flatMap(({ operations }) => operations).map(
      (operation) => [JSON.stringify(operation), operation],
    ),
  ).values(),
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

const PRODUCTION_OPERATION_LINKS = [
  ["get", "/v3/customers"],
  ["get", "/v3/customers/{customerId}/capabilities/supported"],
  ["get", "/v3/customers/{customerId}/tasks/{taskId}"],
  ["get", "/v3/transfers"],
  ["get", "/v3/transfers/{transferId}/instructions"],
  ["get", "/v3/webhooks"],
];

const EXPECTED_RECOVERY_OPERATIONS = [
  ["get", "/v3/capabilities"],
  ["get", "/v3/customers"],
  ["get", "/v3/customers/{customerId}/accounts"],
  ["get", "/v3/customers/{customerId}/capabilities"],
  [
    "get",
    "/v3/customers/{customerId}/capabilities/{capabilityId}/applications",
  ],
  ["get", "/v3/customers/{customerId}/documents"],
  ["get", "/v3/customers/{customerId}/recipients"],
  [
    "get",
    "/v3/customers/{customerId}/recipients/{recipientId}/destinations",
  ],
  ["get", "/v3/customers/{customerId}/related-parties"],
  ["get", "/v3/customers/{customerId}/rules"],
  ["get", "/v3/customers/{customerId}/tasks"],
  ["get", "/v3/customers/{customerId}/tasks/{taskId}/history"],
  ["get", "/v3/customers/{customerId}/tasks/{taskId}/submissions"],
  ["get", "/v3/tasks"],
  ["get", "/v3/transfers"],
  ["get", "/v3/transfers/{transferId}/tasks"],
];

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

function pageFile(page) {
  return `${page}.mdx`;
}

function requiredPage(page) {
  assert.ok(existsSync(pageFile(page)), `Missing page: ${pageFile(page)}`);
  const text = readPage(page);
  assertFrontmatter(page, text);
  assertNoBannedText(page, text);
  return text;
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

function coveredWebhook(name) {
  const matches = coverage.webhooks.filter((candidate) => candidate.name === name);
  assert.equal(matches.length, 1, `Expected one coverage webhook for ${name}`);
  assert.ok(openapi.webhooks?.[name]?.post, `Missing OpenAPI webhook ${name}`);
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

function webhookAllowlistSchema(method, path) {
  const schema = requestBodySchema(method, path);
  const events = resolveOpenApiReference(schema.properties?.events);
  assert.ok(events, `Missing events allowlist for ${method.toUpperCase()} ${path}`);
  const items = resolveOpenApiReference(events.items);
  assert.ok(items, `Missing events items schema for ${method.toUpperCase()} ${path}`);
  return items;
}

function pathParameterNames(method, path) {
  return operationParameters(method, path)
    .filter((parameter) => parameter.in === "path")
    .map((parameter) => parameter.name);
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
    (status) =>
      responseHeader(method, path, status, "Idempotency-Replayed") !== undefined,
  );
}

function enumValues(schema, seen = new Set()) {
  if (!schema || typeof schema !== "object") return [];
  const resolved = resolveOpenApiReference(schema);
  if (seen.has(resolved)) return [];
  seen.add(resolved);

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

function assertExactSet(actual, expected, label) {
  assert.ok(Array.isArray(actual), `${label} must be an array`);
  assert.equal(new Set(actual).size, actual.length, `${label} has duplicates`);
  assert.deepEqual(
    actual.toSorted(),
    expected.toSorted(),
    `${label} must contain exactly the expected values`,
  );
}

function operationMarkdown(method, path) {
  const { href } = coveredOperation(method, path);
  return `[\`${method.toUpperCase()} ${path}\`](${href})`;
}

function webhookMarkdown(name) {
  const { href } = coveredWebhook(name);
  return `[\`${name}\`](${href})`;
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
      /\[`(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS|TRACE) (\/v3\/[^`]+)`\]\(([^)]+)\)/g,
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
      /`(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS|TRACE) (\/v3\/[^`]+)`/g,
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

function linkedWebhookLabels(text) {
  return [
    ...text.matchAll(/\[`([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)`\]\(([^)]+)\)/g),
  ].map((match) => ({
    end: match.index + match[0].length,
    href: match[2],
    name: match[1],
    start: match.index,
  }));
}

function assertEveryCoveredWebhookLabelIsCoverageLinked(label, text) {
  const knownNames = new Set(coverage.webhooks.map(({ name }) => name));
  const links = linkedWebhookLabels(text).filter(({ name }) => knownNames.has(name));
  const labels = [
    ...text.matchAll(/`([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)`/g),
  ].filter((match) => knownNames.has(match[1]));

  for (const match of labels) {
    assert.ok(
      links.some(
        ({ name, start, end }) =>
          name === match[1] && match.index >= start && match.index + match[0].length <= end,
      ),
      `${label} has an unlinked webhook label: ${match[0]}`,
    );
  }

  for (const { name, href } of links) {
    assert.equal(href, coveredWebhook(name).href, `${label} links ${name} to the wrong href`);
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

function claimSegments(text) {
  const codeUnits = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].flatMap(
    (match) => match[1].split("\n").map((line) => line.trim()).filter(Boolean),
  );
  return [...proseSemanticUnits(text), ...codeUnits].flatMap((unit) =>
    unit
      .split(
        /(?<=[.!?;])\s+|,\s+(?=(?:but|however|yet)\b)|\s+(?=(?:but|however|yet)\b)|\s+and\s+(?=(?:the\s+)?(?:[A-Za-z][A-Za-z-]*\s+){0,4}(?:(?:are|is)\s+(?!not\b)|(?:use|uses|include|includes|carry|carries|have|has|arrive|arrives|deliver|delivers|retry|retries)\b))|\n+/i,
      )
      .map((segment) => segment.trim())
      .filter(Boolean),
  );
}

function sectionText(text, heading) {
  const marker = `## ${heading}`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `Missing section ${marker}`);
  const next = text.indexOf("\n## ", start + marker.length);
  return text.slice(start, next === -1 ? text.length : next);
}

function assertOperationSafetyAssociationsInText(label, text, operations) {
  const units = proseSemanticUnits(text);

  for (const [method, path] of operations) {
    const markdown = operationMarkdown(method, path);
    const safetyUnits = units.filter(
      (unit) => unit.includes(markdown) && unit.includes("`Idempotency-Key`"),
    );
    assert.equal(
      safetyUnits.length,
      1,
      `${label} must contain exactly one safety unit for ${method.toUpperCase()} ${path}`,
    );
    const [unit] = safetyUnits;
    assert.deepEqual(
      linkedOperationLabels(unit).map(({ method: linkedMethod, path: linkedPath }) => [
        linkedMethod,
        linkedPath,
      ]),
      [[method, path]],
      `${label} safety unit for ${method.toUpperCase()} ${path} must contain only that operation`,
    );
    assert.match(unit, /requires `Idempotency-Key`/i);
    assert.match(unit, /after transport uncertainty/i);
    assert.match(unit, /reuse the same key only/i);
    assert.match(unit, new RegExp(`identical ${requestBody(method, path) ? "body" : "request"}\\b`, "i"));

    if (documentsReplayHeader(method, path)) {
      assert.match(unit, /on (?:an? )?replay[\s\S]*`Idempotency-Replayed: true`/i);
    } else {
      assert.match(unit, /does not document `Idempotency-Replayed`/i);
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

function webhookRequestSchema(name) {
  const operationObject = openapi.webhooks?.[name]?.post;
  assert.ok(operationObject, `Missing webhook operation ${name}`);
  const body = resolveOpenApiReference(operationObject.requestBody);
  const schema = body?.content?.["application/json"]?.schema;
  assert.ok(schema, `Missing webhook request schema ${name}`);
  return resolveOpenApiReference(schema);
}

function webhookExample(name) {
  const operationObject = openapi.webhooks?.[name]?.post;
  const body = resolveOpenApiReference(operationObject?.requestBody);
  const media = body?.content?.["application/json"];
  assert.ok(media, `Missing webhook media type ${name}`);
  const example = media.example ?? Object.values(media.examples ?? {})[0]?.value;
  assert.ok(example, `Missing webhook example ${name}`);
  return example;
}

function updatedAfterRecoveryOperations() {
  return Object.entries(openapi.paths).flatMap(([path, pathItem]) =>
    HTTP_METHODS.flatMap((method) => {
      const operationObject = pathItem[method];
      if (!operationObject) return [];
      const parameters = [
        ...(pathItem.parameters ?? []),
        ...(operationObject.parameters ?? []),
      ].map(resolveOpenApiReference);
      const updatedAfter = parameters.find(
        (parameter) =>
          parameter.name === "updatedAfter" &&
          parameter.in === "query" &&
          /missed webhooks/i.test(parameter.description ?? ""),
      );
      return updatedAfter ? [[method, path]] : [];
    }),
  );
}

function labeledCodeValues(text, label) {
  const prefix = `- **${label}:**`;
  const lines = text.split("\n").filter((line) => line.startsWith(prefix));
  assert.equal(lines.length, 1, `Expected one ${label} vocabulary line`);
  return [...lines[0].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function operationSemanticUnit(text, method, path) {
  const markdown = operationMarkdown(method, path);
  const units = proseSemanticUnits(text).filter((unit) => unit.includes(markdown));
  assert.equal(
    units.length,
    1,
    `Expected exactly one semantic unit for ${method.toUpperCase()} ${path}`,
  );
  return units[0];
}

function webhookMatrixRow(section, name) {
  const markdown = webhookMarkdown(name);
  const rows = section
    .split("\n")
    .filter((line) => line.startsWith("|") && line.includes(markdown));
  assert.equal(rows.length, 1, `Expected one reconciliation row for ${name}`);
  return rows[0];
}

function assertEventProcessingSemantics(label, text) {
  const section = sectionText(text, "Process events safely");
  assert.match(
    section,
    /(?:workflow|guidance)[\s\S]{0,100}(?:applies|is scoped)[\s\S]{0,100}(?:only )?to[\s\S]{0,80}12 generated (?:event|payload) contracts/i,
    `${label} must scope envelope processing to the 12 generated contracts`,
  );
  assert.match(
    section,
    /`api\.deprecation`[\s\S]{0,120}`transfer\.created`[\s\S]{0,160}(?:no|without)[\s\S]{0,100}(?:generated|public) payload (?:contract|schema)[\s\S]{0,160}do not[\s\S]{0,100}(?:envelope|workflow|process)/i,
    `${label} must exclude schema-less allowlist values from canonical processing`,
  );
  assert.match(
    section,
    /partial or redacted[\s\S]{0,100}(?:locator|advisory projection)/i,
    `${label} must classify event data conservatively`,
  );
  assert.match(section, /not (?:the |an? )?(?:authority|authoritative current resource)/i);

  const steps = [...section.matchAll(/^\d+\.\s+(.+)$/gm)].map((match) => match[1]);
  const pendingIndex = steps.findIndex(
    (step) =>
      /durable inbox/i.test(step) &&
      /pending/i.test(step) &&
      /(?:event )?`id`|event id/i.test(step),
  );
  const completedIndex = steps.findIndex(
    (step) => /only completed/i.test(step) && /(?:no-op|no op)/i.test(step),
  );
  const resumeIndex = steps.findIndex(
    (step) =>
      /stale/i.test(step) &&
      /failed/i.test(step) &&
      /incomplete/i.test(step) &&
      /resum/i.test(step),
  );
  const reconcileIndex = steps.findIndex((step) => /refetch|reconcil/i.test(step));
  const atomicIndex = steps.findIndex(
    (step) =>
      /local effects?/i.test(step) &&
      /completed/i.test(step) &&
      /atomic|same (?:database )?transaction/i.test(step),
  );
  const outboxIndex = steps.findIndex(
    (step) =>
      /external effects?/i.test(step) &&
      /durable/i.test(step) &&
      /outbox|retry record/i.test(step) &&
      /idempotent downstream/i.test(step),
  );

  assert.notEqual(pendingIndex, -1, `${label} must persist a pending inbox record by event id`);
  assert.notEqual(completedIndex, -1, `${label} must make only completed records no-ops`);
  assert.notEqual(resumeIndex, -1, `${label} must resume stale, failed, or incomplete records`);
  assert.notEqual(reconcileIndex, -1, `${label} must reconcile authenticated current state`);
  assert.notEqual(atomicIndex, -1, `${label} must atomically commit local effects and completion`);
  assert.notEqual(outboxIndex, -1, `${label} must use a durable outbox for external effects`);
  assert.ok(pendingIndex < reconcileIndex, `${label} must persist pending before reconciliation`);
  assert.ok(reconcileIndex < atomicIndex, `${label} must reconcile before local effects`);
  assert.ok(reconcileIndex < outboxIndex, `${label} must reconcile before external effects`);

  assert.match(
    section,
    /crash[\s\S]{0,120}(?:after|between)[\s\S]{0,100}(?:insert|persist|pending)[\s\S]{0,120}before processing[\s\S]{0,120}resum/i,
    `${label} must resume after an insertion-before-processing crash`,
  );
  for (const unit of proseSemanticUnits(section)) {
    if (
      /(?:stop|return|ignore|skip|no-op|no op)/i.test(unit) &&
      /(?:event )?`?id`?/i.test(unit) &&
      /(?:already )?exists?/i.test(unit)
    ) {
      assert.match(
        unit,
        /completed/i,
        `${label} must not stop merely because an event id exists`,
      );
    }
  }

  assert.match(
    section,
    /cannot be resolved[\s\S]{0,160}retain[\s\S]{0,80}inbox[\s\S]{0,120}recovery/i,
  );
  assert.match(
    section,
    /do not perform[\s\S]{0,100}destructive downstream actions?[\s\S]{0,120}projection alone/i,
  );
}

function assertPortalScope(label, text) {
  const section = sectionText(text, "Use the delivery portal");
  assert.ok(section.includes(operationMarkdown("get", "/v3/webhooks/portal")));
  assert.match(section, /only for (?:documented )?delivery logs, retries, and manual replay/i);
  assert.doesNotMatch(
    section,
    /(?:configure|rotate|retrieve|manage)[\s\S]{0,80}(?:signature|signing|HMAC|verification secret)/i,
    `${label} must not expand the portal into undocumented security management`,
  );
}

function assertWebhookContractBoundary(label, text) {
  const section = sectionText(text, "Contract boundary");
  const risks = [
    {
      label: "HMAC, signing, signature headers, or secrets",
      negative:
        /(?:public contract|contract)[^.]{0,100}(?:does not|doesn't|cannot)[^.]{0,80}(?:define|document|guarantee)[^.]{0,160}(?:HMAC|sign(?:ed|ing)|signatures?|secrets?)|(?:HMAC|sign(?:ed|ing)|signatures?|secrets?)[^.]{0,160}(?:not|never)[^.]{0,80}(?:defined|documented|guaranteed)[^.]{0,100}(?:public contract|contract)/i,
      pattern:
        /\bHMAC\b|\bsign(?:ed|ing)\b|\bsignatures?\b|(?:signing|verification|webhook) secrets?/i,
    },
    {
      label: "retry counts, timing, or backoff",
      negative:
        /(?:public contract|contract)[^.]{0,100}(?:does not|doesn't|cannot)[^.]{0,80}(?:define|document|guarantee)[^.]{0,160}(?:retry (?:counts?|schedules?|timings?)|backoff)|(?:retry (?:counts?|schedules?|timings?)|backoff)[^.]{0,160}(?:not|never)[^.]{0,80}(?:defined|documented|guaranteed)[^.]{0,100}(?:public contract|contract)/i,
      pattern:
        /\b(?:retry|retries)\s+(?:counts?|schedules?|timings?|intervals?|delays?)\b|\b(?:retry|retries)\b[\s\S]{0,30}\b(?:every|after|times?|seconds?|minutes?|hours?|milliseconds?|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b|\bbackoff\b/i,
    },
    {
      label: "at-least-once or exactly-once delivery",
      negative:
        /(?:public contract|contract)[^.]{0,100}(?:does not|doesn't|cannot)[^.]{0,80}(?:define|document|guarantee)[^.]{0,160}(?:at[- ]least[- ]once|exactly[- ]once)|(?:at[- ]least[- ]once|exactly[- ]once)[^.]{0,160}(?:not|never)[^.]{0,80}(?:defined|documented|guaranteed)[^.]{0,100}(?:public contract|contract)/i,
      pattern: /at[- ]least[- ]once|exactly[- ]once/i,
    },
    {
      label: "ordering guarantees",
      negative:
        /(?:public contract|contract)[^.]{0,100}(?:does not|doesn't|cannot)[^.]{0,80}(?:define|document|guarantee)[^.]{0,160}(?:ordering|ordered)|(?:ordering|ordered)[^.]{0,160}(?:not|never)[^.]{0,80}(?:defined|documented|guaranteed)[^.]{0,100}(?:public contract|contract)/i,
      pattern:
        /ordering(?: guarantees?)?|(?:events?|webhooks?)[\s\S]{0,40}(?:ordered|in order)|(?:ordered|in order)[\s\S]{0,40}(?:delivery|events?|webhooks?)|guaranteed order/i,
    },
  ];

  for (const { label: riskLabel, negative, pattern } of risks) {
    const boundarySegments = claimSegments(section).filter((segment) => pattern.test(segment));
    assert.ok(boundarySegments.length > 0, `${label} must mention the ${riskLabel} boundary`);
    for (const segment of boundarySegments) {
      assert.match(
        segment,
        negative,
        `${label} states ${riskLabel} without a same-segment public-contract boundary`,
      );
    }
    const segments = claimSegments(text).filter((segment) => pattern.test(segment));
    for (const segment of segments) {
      assert.match(
        segment,
        negative,
        `${label} states ${riskLabel} without a same-segment public-contract boundary`,
      );
    }
  }
}

function assertWebhookReconciliationMatrix(label, text) {
  const section = sectionText(text, "Reconcile current state by event");
  assertExactSet(
    [...new Set(linkedWebhookLabels(section).map(({ name }) => name))],
    EXPECTED_WEBHOOK_EVENTS,
    `${label} reconciliation events`,
  );

  for (const { event, operations, parents } of WEBHOOK_RECONCILIATION_MATRIX) {
    const row = webhookMatrixRow(section, event);
    assert.deepEqual(
      linkedOperationLabels(row)
        .map(({ method, path }) => JSON.stringify([method, path]))
        .toSorted(),
      operations.map(JSON.stringify).toSorted(),
      `${event} must link exactly its contract-derived reconciliation operations`,
    );
    for (const parent of parents) {
      assert.match(
        row,
        new RegExp(`stored[\\s\\S]{0,80}\`${parent}\``, "i"),
        `${event} must require stored ${parent}`,
      );
    }
  }

  const created = webhookMatrixRow(section, "customer.created");
  const updated = webhookMatrixRow(section, "customer.updated");
  const archived = webhookMatrixRow(section, "customer.archived");
  const application = webhookMatrixRow(section, "application.status_changed");
  const transfer = webhookMatrixRow(section, "transfer.state_changed");
  assert.match(created, /`resource\.id`[\s\S]{0,80}`customerId`/i);
  assert.match(updated, /`resource\.id`[\s\S]{0,80}`customerId`/i);
  assert.match(archived, /terminal/i);
  assert.match(archived, /detail[\s\S]{0,80}`404`/i);
  assert.match(archived, /`updatedAfter`/i);
  assert.match(application, /no direct[\s\S]{0,100}application[\s\S]{0,100}(?:detail|current read)/i);
  assert.match(transfer, /`resource\.id`[\s\S]{0,80}`transferId`/i);
}

function assertProductionCutoverSemantics(label, text) {
  const section = sectionText(text, "Launch checklist");
  const items = checklistItems(section);
  const requireItem = (pattern, message) => {
    const matches = items.filter((item) => pattern.test(item));
    assert.equal(matches.length, 1, message);
    return matches[0];
  };

  const cutover = requireItem(/environment cutover/i, `${label} needs one cutover check`);
  assert.match(cutover, /same (?:host|base URL)/i);
  assert.match(cutover, /different API key[\s\S]{0,100}only selects[\s\S]{0,80}(?:target|production) environment/i);
  assert.match(
    cutover,
    /public contract[\s\S]{0,120}does not document[\s\S]{0,120}(?:copy|migrat)[\s\S]{0,120}sandbox resource ids[\s\S]{0,120}customers[\s\S]{0,120}webhooks?[\s\S]{0,120}configuration[\s\S]{0,120}production/i,
  );

  requireItem(/production inventory/i, `${label} needs a production inventory check`);
  requireItem(
    /(?:create|verify)[\s\S]{0,120}production[\s\S]{0,120}(?:configuration|resources?)/i,
    `${label} must create or verify production configuration and resources`,
  );
  requireItem(/environment-specific IDs/i, `${label} must keep environment-specific IDs`);
  const smoke = requireItem(/read-only[\s\S]{0,80}smoke test/i, `${label} needs read-only smoke tests`);
  assert.match(smoke, /before enabling production writes/i);

  for (const unit of proseSemanticUnits(text)) {
    assert.doesNotMatch(
      unit,
      /(?:key swap|API key)[\s\S]{0,80}automatically (?:copies|migrates|moves)|automatically (?:copies|migrates|moves)[\s\S]{0,80}sandbox/i,
      `${label} must not claim automatic sandbox migration`,
    );
    assert.doesNotMatch(
      unit,
      /reuse (?:the )?sandbox[\s\S]{0,60}(?:resource )?IDs?[\s\S]{0,60}(?:in|for) production/i,
      `${label} must not tell readers to reuse sandbox IDs`,
    );
  }
}

function assertEnvironmentSemantics(label, text) {
  assert.match(text, /same (?:API )?(?:host|base URL)[\s\S]{0,120}`https:\/\/platform\.swipelux\.com`/i);
  assert.match(text, /API key selects the environment|environment is selected by the API key/i);
  assert.match(text, /no real funds move/i);
  assert.doesNotMatch(text, /sandbox\.swipelux\.com|api\.swipelux\.com/i);
  assert.doesNotMatch(text, /same as production|identical to production|production equivalent/i);
  assert.doesNotMatch(text, /automatically (?:runs?|advances?|progresses?|sequences?|transitions?)/i);
  assert.match(text, /do not assume[\s\S]{0,120}(?:automatic|production)/i, `${label} must state the sandbox boundary`);
}

function assertSandboxSafetyBoundary(label, text) {
  assert.match(
    text,
    /none of (?:these|the) six[\s\S]{0,100}declare `Idempotency-Key`/i,
    `${label} must derive sandbox idempotency from each operation`,
  );
  assert.match(
    text,
    /none of (?:their|the six|these)[\s\S]{0,100}document `Idempotency-Replayed`/i,
    `${label} must derive sandbox replay behavior from each operation`,
  );
  assert.doesNotMatch(text, /sandbox[\s\S]{0,120}(?:requires?|send|use)[\s\S]{0,80}`Idempotency-Key`/i);
}

function checklistItems(text) {
  return [...text.matchAll(/^- \[ \] (.+)$/gm)].map((match) => match[1]);
}

function assertLaunchChecklistSemantics(label, text) {
  const section = sectionText(text, "Launch checklist");
  const items = checklistItems(section);
  assert.ok(items.length >= 8, `${label} must provide at least eight actionable checks`);

  const requireItem = (pattern, message) => {
    const matches = items.filter((item) => pattern.test(item));
    assert.equal(matches.length, 1, message);
    return matches[0];
  };

  requireItem(/server-side|backend/i, `${label} needs one server-side key check`);
  requireItem(/fresh[\s\S]*`Idempotency-Key`/i, `${label} needs one fresh-key check`);
  const replay = requireItem(/transport uncertainty/i, `${label} needs one uncertainty replay check`);
  assert.match(replay, /identical (?:body|request)/i);
  assert.match(replay, /only/i);
  requireItem(/poll[\s\S]*`updatedAfter`/i, `${label} needs one polling recovery check`);
  const webhook = requireItem(
    /12 generated webhook (?:contracts|payload contracts)[\s\S]*(?:durable inbox|pending)/i,
    `${label} needs one crash-safe webhook inbox check`,
  );
  assert.match(webhook, /`api\.deprecation`[\s\S]{0,120}`transfer\.created`/i);
  assert.match(webhook, /(?:no|without)[\s\S]{0,100}(?:generated|public) payload (?:contract|schema)/i);
  assert.match(
    webhook,
    /(?:workflow )?(?:does not|do not)[\s\S]{0,40}apply[\s\S]{0,120}`api\.deprecation`[\s\S]{0,120}`transfer\.created`/i,
    `${label} must exclude schema-less allowlist values from canonical processing`,
  );
  assert.match(webhook, /only completed[\s\S]{0,80}(?:no-op|no op)/i);
  assert.match(webhook, /stale[\s\S]{0,80}failed[\s\S]{0,80}incomplete[\s\S]{0,80}resum/i);
  assert.match(webhook, /refetch|reconcil/i);
  const effects = requireItem(
    /local effects?[\s\S]*(?:atomic|same transaction)/i,
    `${label} needs one webhook effects check`,
  );
  assert.match(effects, /completed/i);
  assert.match(effects, /external effects?[\s\S]{0,120}(?:outbox|retry record)/i);
  assert.match(effects, /idempotent downstream/i);
  requireItem(/legal|compliance/i, `${label} needs one legal approval check`);
  requireItem(/redirect[\s\S]*callback|callback[\s\S]*redirect/i, `${label} needs one redirect/callback check`);
  const cutover = requireItem(/environment cutover/i, `${label} needs one environment cutover check`);
  assert.match(cutover, /API key/i);
  assert.match(cutover, /same (?:host|base URL)/i);
  requireItem(/smoke test/i, `${label} needs one post-cutover smoke-test check`);

  assert.doesNotMatch(
    section,
    /every (?:write|POST|effectful request)[\s\S]{0,80}(?:requires?|use)[\s\S]{0,60}`Idempotency-Key`/i,
  );
  assert.match(section, /operation declares `Idempotency-Key`/i);
  assert.match(section, /`Idempotency-Replayed`[\s\S]{0,100}only[\s\S]{0,100}(?:operation|response)[\s\S]{0,80}documents?/i);
}

function internalLinks(text) {
  return [
    ...[...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]),
    ...[...text.matchAll(/\bhref=(?:"([^"]+)"|'([^']+)')/g)].map(
      (match) => match[1] ?? match[2],
    ),
  ].filter((href) => href.startsWith("/"));
}

function assertCodeFenceLanguages(label, text) {
  let open = false;
  for (const line of text.split("\n")) {
    if (!line.startsWith("```")) continue;
    if (!open) {
      assert.match(line, /^```[A-Za-z0-9_-]+\s*$/, `${label} has an untagged code fence`);
    } else {
      assert.equal(line, "```", `${label} has a malformed closing code fence`);
    }
    open = !open;
  }
  assert.equal(open, false, `${label} has an unclosed code fence`);
}

for (const page of PAGES) {
  test(`${pageFile(page)} exists with valid frontmatter and published text`, () => {
    requiredPage(page);
  });
}

test("Task 8 pages appear in navigation exactly once", () => {
  const navigationPages = collectNavigationPages(config.navigation);
  for (const page of PAGES) {
    assert.equal(
      navigationPages.filter((candidate) => candidate === page).length,
      1,
      `${page} must appear in navigation exactly once`,
    );
  }
});

test("OpenAPI and coverage expose the exact Task 8 webhook, event, recovery, and sandbox sets", () => {
  const actualWebhookOperations = coverage.operations
    .filter(({ path }) => path.startsWith("/v3/webhooks"))
    .map(({ method, path }) => [method, path]);
  assert.deepEqual(
    actualWebhookOperations.map(JSON.stringify).toSorted(),
    WEBHOOK_OPERATIONS.map(JSON.stringify).toSorted(),
  );

  assertExactSet(
    coverage.webhooks.map(({ name }) => name),
    EXPECTED_WEBHOOK_EVENTS,
    "covered webhook events",
  );
  assertExactSet(Object.keys(openapi.webhooks ?? {}), EXPECTED_WEBHOOK_EVENTS, "OpenAPI webhooks");

  const recovery = updatedAfterRecoveryOperations();
  assert.deepEqual(
    recovery.map(JSON.stringify).toSorted(),
    EXPECTED_RECOVERY_OPERATIONS.map(JSON.stringify).toSorted(),
  );

  const actualSandbox = Object.entries(openapi.paths).flatMap(([path, pathItem]) =>
    HTTP_METHODS.filter((method) => path.startsWith("/v3/sandbox/") && pathItem[method]).map(
      (method) => [method, path],
    ),
  );
  assert.deepEqual(
    actualSandbox.map(JSON.stringify).toSorted(),
    SANDBOX_OPERATIONS.map(JSON.stringify).toSorted(),
  );
});

test("derives every event reconciliation operation and nested parent scope from coverage", () => {
  for (const { event, operations, parents } of WEBHOOK_RECONCILIATION_MATRIX) {
    assert.ok(EXPECTED_WEBHOOK_EVENTS.includes(event), `Unknown matrix event ${event}`);
    for (const [method, path] of operations) {
      coveredOperation(method, path);
      const actualParents = pathParameterNames(method, path);
      for (const parent of parents) {
        assert.ok(
          actualParents.includes(parent),
          `${method.toUpperCase()} ${path} must require ${parent}`,
        );
      }
    }
  }

  const customer404 = responseObject("get", "/v3/customers/{customerId}", "404");
  assert.match(customer404.description, /archived/i);
  const customerUpdatedAfter = operationParameters("get", "/v3/customers").find(
    (parameter) => parameter.in === "query" && parameter.name === "updatedAfter",
  );
  assert.match(customerUpdatedAfter.description, /missed webhooks/i);
  assert.equal(
    openapi.paths[
      "/v3/customers/{customerId}/capabilities/{capabilityId}/applications/{applicationId}"
    ],
    undefined,
    "the contract must not be treated as if it exposes a direct application current read",
  );
});

test("links every required operation and every operation label to its exact generated href", () => {
  assertRequiredOperationLinks(
    "integration/webhooks",
    [
      ...WEBHOOK_OPERATIONS,
      ...EXPECTED_RECOVERY_OPERATIONS,
      ...WEBHOOK_RECONCILIATION_OPERATIONS,
    ],
  );
  assertRequiredOperationLinks("integration/sandbox", SANDBOX_OPERATIONS);
  assertRequiredOperationLinks("integration/production-readiness", PRODUCTION_OPERATION_LINKS);

  for (const page of PAGES) {
    assertEveryOperationLabelIsCoverageLinked(pageFile(page), requiredPage(page));
  }
});

test("semantic operation-link checks reject a swapped generated href", () => {
  const create = coveredOperation("post", "/v3/webhooks");
  const list = coveredOperation("get", "/v3/webhooks");
  assert.notEqual(create.href, list.href);
  assert.throws(
    () =>
      assertEveryOperationLabelIsCoverageLinked(
        "swapped fixture",
        `[\`POST /v3/webhooks\`](${list.href})`,
      ),
    /wrong href/,
  );
  assert.doesNotThrow(() =>
    assertEveryOperationLabelIsCoverageLinked(
      "correct fixture",
      `[\`POST /v3/webhooks\`](${create.href})`,
    ),
  );
});

test("documents all 12 generated webhook events and both current open allowlists", () => {
  const text = requiredPage("integration/webhooks");
  const eventSection = sectionText(text, "Generated event contracts");

  for (const name of EXPECTED_WEBHOOK_EVENTS) {
    assert.ok(eventSection.includes(webhookMarkdown(name)), `${name} must use its generated href`);
  }
  assertExactSet(
    [...new Set(linkedWebhookLabels(eventSection).map(({ name }) => name))],
    EXPECTED_WEBHOOK_EVENTS,
    "webhook event links",
  );
  assertEveryCoveredWebhookLabelIsCoverageLinked(pageFile("integration/webhooks"), text);

  const createAllowlistSchema = webhookAllowlistSchema("post", "/v3/webhooks");
  const updateAllowlistSchema = webhookAllowlistSchema(
    "patch",
    "/v3/webhooks/{webhookId}",
  );
  const createAllowlist = enumValues(createAllowlistSchema);
  const updateAllowlist = enumValues(updateAllowlistSchema);
  assertExactSet(
    createAllowlist,
    EXPECTED_WEBHOOK_ALLOWLIST_VALUES,
    "POST webhook allowlist",
  );
  assertExactSet(
    updateAllowlist,
    EXPECTED_WEBHOOK_ALLOWLIST_VALUES,
    "PATCH webhook allowlist",
  );
  assert.deepEqual(
    createAllowlist.toSorted(),
    updateAllowlist.toSorted(),
    "POST and PATCH webhook allowlists must not drift",
  );
  assert.match(createAllowlistSchema.description, /open enum/i);
  assert.match(updateAllowlistSchema.description, /open enum/i);
  assert.match(createAllowlistSchema.description, /values are added over time/i);
  assert.match(updateAllowlistSchema.description, /values are added over time/i);

  const uncovered = createAllowlist.filter(
    (name) => !coverage.webhooks.some((webhook) => webhook.name === name),
  );
  assertExactSet(uncovered, EXPECTED_UNCOVERED_WEBHOOK_ALLOWLIST_VALUES, "uncovered allowlist values");
  assert.match(eventSection, /both[\s\S]{0,80}(?:create|`POST`)[\s\S]{0,120}(?:update|`PATCH`)/i);
  assert.match(eventSection, /current[\s\S]{0,80}open[- ]enum/i);
  assert.match(text, /`api\.deprecation`[\s\S]{0,160}`transfer\.created`/i);
  assert.match(text, /generated event reference[\s\S]{0,120}no webhook payload (?:page|contract)/i);
  assert.match(text, /do not infer[\s\S]{0,100}payload/i);
});

test("semantic webhook-link checks reject a swapped event href", () => {
  const created = coveredWebhook("customer.created");
  const updated = coveredWebhook("customer.updated");
  assert.notEqual(created.href, updated.href);
  assert.throws(
    () =>
      assertEveryCoveredWebhookLabelIsCoverageLinked(
        "swapped event fixture",
        `[\`customer.created\`](${updated.href})`,
      ),
    /wrong href/,
  );
  assert.doesNotThrow(() =>
    assertEveryCoveredWebhookLabelIsCoverageLinked(
      "correct event fixture",
      `[\`customer.created\`](${created.href})`,
    ),
  );
});

test("documents the canonical webhook envelope exactly from every event schema", () => {
  const text = requiredPage("integration/webhooks");
  const previousEvents = [];

  for (const name of EXPECTED_WEBHOOK_EVENTS) {
    const schema = webhookRequestSchema(name);
    assertExactSet(
      schema.required,
      ["id", "type", "createdAt", "attempt", "resource", "data"],
      `${name} envelope fields`,
    );
    assert.equal(schema.additionalProperties, false);
    assert.match(schema.properties.id.description, /stable webhook event id for deduplication/i);
    assert.deepEqual(enumValues(schema.properties.type), [name]);
    assert.equal(schema.properties.createdAt.format, "date-time");
    assert.deepEqual(enumValues(schema.properties.attempt), [1]);
    assert.match(schema.properties.attempt.description, /always 1[\s\S]*unchanged by delivery retries/i);

    const resource = resolveOpenApiReference(schema.properties.resource);
    assertExactSet(resource.required, ["type", "id"], `${name} resource locator`);
    assert.equal(resource.additionalProperties, false);

    const data = resolveOpenApiReference(schema.properties.data);
    assert.ok(data.required.includes("object"), `${name} data must require object`);
    if (data.required.includes("previous")) previousEvents.push(name);
  }

  assertExactSet(
    previousEvents,
    [
      "account.details_changed",
      "account.status_changed",
      "application.status_changed",
      "capability.status_changed",
      "destination.status_changed",
      "recipient.status_changed",
      "transfer.state_changed",
    ],
    "events requiring data.previous",
  );

  const envelopeSection = sectionText(text, "Canonical envelope");
  assert.match(envelopeSection, /`id`[\s\S]{0,80}`type`[\s\S]{0,80}`createdAt`[\s\S]{0,80}`attempt`[\s\S]{0,80}`resource`[\s\S]{0,80}`data`/i);
  assert.match(envelopeSection, /`attempt`[\s\S]{0,120}always `1`[\s\S]{0,160}unchanged by delivery retries/i);
  assert.match(envelopeSection, /`resource\.type`[\s\S]{0,100}`resource\.id`/i);
  assert.ok(
    hasDeepEqual(jsonBlocks(envelopeSection), webhookExample("transfer.state_changed")),
    "webhooks must include the exact transfer.state_changed contract example",
  );
  for (const name of previousEvents) {
    assert.ok(envelopeSection.includes(webhookMarkdown(name)), `${name} must be listed for data.previous`);
  }
});

test("requires a crash-safe durable inbox and resumable side-effect workflow", () => {
  assertEventProcessingSemantics(
    pageFile("integration/webhooks"),
    requiredPage("integration/webhooks"),
  );
});

test("maps all 12 event contracts to current reads, archive recovery, and parent scopes", () => {
  assertWebhookReconciliationMatrix(
    pageFile("integration/webhooks"),
    requiredPage("integration/webhooks"),
  );
});

test("limits the webhook portal to the documented delivery operations", () => {
  const { operationObject } = openApiOperation("get", "/v3/webhooks/portal");
  assert.equal(
    operationObject.description,
    "Returns a webhook management portal URL for delivery logs, retries, and manual replay.",
  );
  const schema = responseSchema("get", "/v3/webhooks/portal");
  assertExactSet(schema.required, ["url"], "portal response fields");
  assertPortalScope(pageFile("integration/webhooks"), requiredPage("integration/webhooks"));
});

test("documents recovery through exactly the list operations that declare updatedAfter for missed webhooks", () => {
  const text = requiredPage("integration/webhooks");
  const section = sectionText(text, "Recover missed changes");
  const expected = updatedAfterRecoveryOperations();

  assert.deepEqual(
    linkedOperationLabels(section)
      .map(({ method, path }) => JSON.stringify([method, path]))
      .toSorted(),
    expected.map(JSON.stringify).toSorted(),
    "recovery section must link exactly the updatedAfter recovery operations",
  );
  assert.match(section, /`updatedAfter`[\s\S]{0,120}inclusive[\s\S]{0,120}RFC 3339/i);
  assert.match(section, /overlap window/i);
  assert.match(section, /follow every cursor page/i);
  assert.match(section, /deduplicate[\s\S]{0,80}resource id/i);
  assert.match(section, /advance the checkpoint only after/i);
});

test("keeps webhook configuration idempotency operation-specific and replay-aware", () => {
  const text = requiredPage("integration/webhooks");

  for (const [method, path] of WEBHOOK_WRITE_OPERATIONS) {
    const parameter = idempotencyParameter(method, path);
    assert.ok(parameter, `${method.toUpperCase()} ${path} declares Idempotency-Key`);
    assert.equal(parameter.required, true);
    assert.equal(documentsReplayHeader(method, path), true);
  }
  for (const [method, path] of WEBHOOK_OPERATIONS.filter(([method]) => method === "get")) {
    assert.equal(idempotencyParameter(method, path), undefined);
    assert.equal(documentsReplayHeader(method, path), false);
  }

  assertOperationSafetyAssociationsInText(
    pageFile("integration/webhooks"),
    text,
    WEBHOOK_WRITE_OPERATIONS,
  );
  assert.doesNotMatch(text, /every (?:webhook )?(?:operation|request)[\s\S]{0,80}(?:requires?|uses?)[\s\S]{0,80}`Idempotency-Key`/i);
});

test("states the negative webhook security and delivery contract without inventing guarantees", () => {
  assertWebhookContractBoundary(
    pageFile("integration/webhooks"),
    requiredPage("integration/webhooks"),
  );
});

test("documents all six sandbox helpers with exact request fields and response meanings", () => {
  const text = requiredPage("integration/sandbox");

  const topup = requestBodySchema("post", "/v3/sandbox/accounts/{accountId}/topup");
  assertExactSet(topup.required, ["amount", "currency"], "top-up fields");
  const topupResponse = responseDataSchema(
    "post",
    "/v3/sandbox/accounts/{accountId}/topup",
  );
  assert.deepEqual(enumValues(topupResponse.properties.type), ["wallet_to_wallet"]);
  assert.deepEqual(enumValues(topupResponse.properties.state), ["completed"]);
  let unit = operationSemanticUnit(text, "post", "/v3/sandbox/accounts/{accountId}/topup");
  assert.match(unit, /requires `amount` and `currency`/i);
  assert.match(unit, /`data\.type`[\s\S]{0,80}`wallet_to_wallet`/i);
  assert.match(unit, /`data\.state`[\s\S]{0,80}`completed`/i);

  const transferPath = "/v3/sandbox/transfers/{transferId}/state";
  const transfer = requestBodySchema("post", transferPath);
  assertExactSet(transfer.required, ["state"], "transfer-state fields");
  assertExactSet(enumValues(transfer.properties.state), ["completed", "failed"], "transfer-state enum");
  assertExactSet(transfer.properties.stateDetail.required, ["code"], "stateDetail fields");
  assert.match(transfer.properties.stateDetail.description, /only when forcing a payin transfer to `failed`/i);
  assert.match(transfer.properties.stateDetail.description, /ignored for completed states and payout transfers/i);
  unit = operationSemanticUnit(text, "post", transferPath);
  assert.match(unit, /requires `state`/i);
  assert.match(unit, /optional `stateDetail`/i);
  assert.match(unit, /`stateDetail`[\s\S]{0,120}requires `code`/i);
  assert.match(unit, /payin[\s\S]{0,80}`failed`/i);
  assert.match(unit, /ignored[\s\S]{0,100}completed[\s\S]{0,100}payout/i);
  assert.match(unit, /returns[\s\S]{0,80}(?:current|updated) transfer/i);

  const createTask = requestBodySchema("post", "/v3/sandbox/tasks");
  assertExactSet(createTask.required, ["scope", "items"], "sandbox task fields");
  assert.equal(createTask.properties.items.minItems, 1);
  assertExactSet(
    createTask.properties.items.items.required,
    ["type", "request"],
    "sandbox task item fields",
  );
  unit = operationSemanticUnit(text, "post", "/v3/sandbox/tasks");
  assert.match(unit, /requires `scope` and at least one `items` entry/i);
  assert.match(unit, /each item requires `type` and `request`/i);
  assert.match(unit, /customer scope[\s\S]{0,120}`type`[\s\S]{0,80}`customerId`/i);
  assert.match(unit, /capability scope[\s\S]{0,120}`type`[\s\S]{0,80}`customerId`[\s\S]{0,80}`capabilityId`/i);
  assert.match(unit, /transfer scope[\s\S]{0,120}`type`[\s\S]{0,80}`customerId`[\s\S]{0,80}`transferId`/i);
  assert.match(unit, /`subject`[\s\S]{0,120}requires `type`, `name`, and `relatedPartyId`/i);
  assert.match(unit, /`deadline`[\s\S]{0,120}requires `type` and `outcome`/i);
  assert.match(unit, /returns[\s\S]{0,80}(?:created|current) task/i);

  const review = requestBodySchema("post", "/v3/sandbox/tasks/{taskId}/review");
  assertExactSet(review.required, ["outcome"], "sandbox review fields");
  assertExactSet(review.properties.items.items.required, ["key", "verdict"], "review item fields");
  assertExactSet(
    review.properties.items.items.properties.rejection.required,
    ["code", "message"],
    "review rejection fields",
  );
  unit = operationSemanticUnit(text, "post", "/v3/sandbox/tasks/{taskId}/review");
  assert.match(unit, /requires `outcome`/i);
  assert.match(unit, /`items`[\s\S]{0,120}`key`[\s\S]{0,80}`verdict`/i);
  assert.match(unit, /`rejection`[\s\S]{0,100}`code`[\s\S]{0,80}`message`/i);
  assert.match(unit, /returns[\s\S]{0,80}(?:reviewed|current) task/i);

  const verificationPath = "/v3/sandbox/customers/{customerId}/verification";
  const verification = requestBodySchema("post", verificationPath);
  assertExactSet(verification.required, ["status"], "verification fields");
  const verificationResponse = responseDataSchema("post", verificationPath);
  assertExactSet(
    verificationResponse.required,
    ["customerId", "customerType", "status", "previousStatus", "reason"],
    "verification response fields",
  );
  unit = operationSemanticUnit(text, "post", verificationPath);
  assert.match(unit, /requires `status`/i);
  assert.match(unit, /optional `reason`/i);
  assert.match(unit, /`customerId`[\s\S]{0,100}`customerType`[\s\S]{0,100}`status`[\s\S]{0,100}`previousStatus`[\s\S]{0,100}`reason`/i);

  const capabilityPath =
    "/v3/sandbox/customers/{customerId}/capabilities/{capabilityId}/status";
  const capability = requestBodySchema("post", capabilityPath);
  assertExactSet(capability.required, ["status"], "capability-status fields");
  unit = operationSemanticUnit(text, "post", capabilityPath);
  assert.match(unit, /requires `status`/i);
  assert.match(unit, /returns[\s\S]{0,80}(?:current|updated) capability/i);
});

test("derives every sandbox request enum exactly from OpenAPI", () => {
  const text = requiredPage("integration/sandbox");
  const createTask = requestBodySchema("post", "/v3/sandbox/tasks");
  const scopeValues = createTask.properties.scope.anyOf.flatMap((variant) =>
    enumValues(resolveOpenApiReference(variant).properties.type),
  );

  assertExactSet(labeledCodeValues(text, "Transfer target states"), ["completed", "failed"], "transfer target states");
  assertExactSet(labeledCodeValues(text, "Task scope types"), scopeValues, "task scope types");
  assertExactSet(
    labeledCodeValues(text, "Task categories"),
    enumValues(createTask.properties.category),
    "task categories",
  );
  assertExactSet(
    labeledCodeValues(text, "Task subject types"),
    enumValues(createTask.properties.subject.properties.type),
    "task subject types",
  );
  assertExactSet(
    labeledCodeValues(text, "Task item types"),
    enumValues(createTask.properties.items.items.properties.type),
    "task item types",
  );
  assertExactSet(
    labeledCodeValues(text, "Deadline types"),
    enumValues(createTask.properties.deadline.properties.type),
    "deadline types",
  );
  assertExactSet(
    labeledCodeValues(text, "Deadline outcomes"),
    enumValues(createTask.properties.deadline.properties.outcome),
    "deadline outcomes",
  );

  const review = requestBodySchema("post", "/v3/sandbox/tasks/{taskId}/review");
  assertExactSet(
    labeledCodeValues(text, "Review outcomes"),
    enumValues(review.properties.outcome),
    "review outcomes",
  );
  assertExactSet(
    labeledCodeValues(text, "Review item verdicts"),
    enumValues(review.properties.items.items.properties.verdict),
    "review item verdicts",
  );

  const verification = requestBodySchema(
    "post",
    "/v3/sandbox/customers/{customerId}/verification",
  );
  assertExactSet(
    labeledCodeValues(text, "Verification decisions"),
    enumValues(verification.properties.status),
    "verification decisions",
  );

  const capability = requestBodySchema(
    "post",
    "/v3/sandbox/customers/{customerId}/capabilities/{capabilityId}/status",
  );
  assertExactSet(
    labeledCodeValues(text, "Capability target statuses"),
    enumValues(capability.properties.status),
    "capability target statuses",
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
  const { operationObject } = openApiOperation(
    "post",
    "/v3/sandbox/accounts/{accountId}/topup",
  );
  assert.match(operationObject.description, /No real funds move/);
  assertEnvironmentSemantics(pageFile("integration/sandbox"), requiredPage("integration/sandbox"));
});

test("provides the complete production launch checklist with contract-scoped links", () => {
  const text = requiredPage("integration/production-readiness");
  assertLaunchChecklistSemantics(pageFile("integration/production-readiness"), text);
  assertProductionCutoverSemantics(pageFile("integration/production-readiness"), text);

  for (const href of [
    "/integration/authentication",
    "/integration/request-safety",
    "/integration/pagination-and-sync",
    "/integration/webhooks",
    "/integration/sandbox",
    "/integration/errors",
    "/integration/onboarding/tasks-and-submissions",
    "/integration/receive-funds",
  ]) {
    assert.ok(text.includes(`](${href})`), `Missing ${href}`);
  }

  assert.match(text, /legal[\s\S]{0,120}approval[\s\S]{0,160}before production/i);
  assert.match(text, /availability[\s\S]{0,120}eligibility/i);
  assert.match(text, /post-cutover/i);
  assert.match(text, /read-only/i);
  assert.doesNotMatch(text, /SLA|service[- ]level|uptime guarantee|RTO|RPO/i);
  assert.doesNotMatch(text, /webhook[\s\S]{0,120}(?:signed|signature verification|HMAC secret)/i);
});

test("keeps API keys backend-only across every Task 8 guide", () => {
  for (const page of PAGES) {
    const text = requiredPage(page);
    assert.match(text, /backend|server-side/i, `${pageFile(page)} must state the backend boundary`);
    assert.match(
      text,
      /do not expose[\s\S]{0,120}`X-API-Key`[\s\S]{0,120}(?:browser|client)/i,
      `${pageFile(page)} must forbid client-side API keys`,
    );
  }
});

test("rejects legacy routes, hosts, embedded secrets, and unverified operational claims", () => {
  const text = PAGES.map(requiredPage).join("\n");
  for (const pattern of [
    /(^|[^A-Za-z0-9])v1(?=$|[^A-Za-z0-9])/i,
    /(^|[^A-Za-z0-9])v2(?=$|[^A-Za-z0-9])/i,
    /\/kyc(?:\/|\b)/i,
    /\/kyb(?:\/|\b)/i,
    /wallet\.swipelux\.com/i,
    /api\.swipelux\.com/i,
    /sandbox\.swipelux\.com/i,
    /\bsk\.(?:live|sbx)\.[A-Za-z0-9_-]{24,}\b/i,
    /\bBearer\b|serviceToken|uploadToken|client credentials/i,
  ]) {
    assert.doesNotMatch(text, pattern);
  }

  assert.doesNotMatch(text, /retry every|retry after \d|exponential backoff|fixed backoff/i);
  assert.doesNotMatch(text, /guaranteed delivery|guaranteed order|guaranteed exactly once/i);
  assert.doesNotMatch(text, /sandbox[\s\S]{0,100}(?:mirrors?|matches?|equals?)[\s\S]{0,80}production/i);
});

test("uses root-relative extensionless links and language-tagged code fences", () => {
  for (const page of PAGES) {
    const text = requiredPage(page);
    for (const href of internalLinks(text)) {
      assert.match(href, /^\//, `${pageFile(page)} has a non-root-relative link ${href}`);
      assert.doesNotMatch(href, /\.mdx?(?:$|[#?])/, `${pageFile(page)} link must omit extensions: ${href}`);
    }
    assertCodeFenceLanguages(pageFile(page), text);
  }
});

test("polarity guards reject inversions of critical Task 8 guidance", () => {
  const safeInbox = `## Process events safely

This workflow applies only to the 12 generated event contracts. \`api.deprecation\` and \`transfer.created\` have no generated payload schema; do not process them with this canonical envelope workflow.

Treat \`data.object\` as a partial or redacted locator and advisory projection, not the authority.

1. Parse the envelope.
2. Persist a pending record in a durable inbox keyed by event \`id\`.
3. Only completed records are no-ops. Stale, failed, or otherwise incomplete records remain resumable; if a crash occurs after pending insertion but before processing, resume the record.
4. Reconcile authenticated current state before downstream work.
5. For local effects, commit local effects and completed status atomically when possible.
6. For external effects, write a durable outbox or retry record and use idempotent downstream handling.

If an authenticated current read cannot be resolved, retain the inbox item for recovery. Do not perform destructive downstream actions from the projection alone.`;
  assert.doesNotThrow(() => assertEventProcessingSemantics("safe inbox", safeInbox));
  assert.throws(
    () =>
      assertEventProcessingSemantics(
        "unscoped envelope",
        safeInbox.replace(
          "This workflow applies only to the 12 generated event contracts. `api.deprecation` and `transfer.created` have no generated payload schema; do not process them with this canonical envelope workflow.\n\n",
          "",
        ),
      ),
    /scope envelope processing|exclude schema-less/,
  );
  assert.throws(
    () =>
      assertEventProcessingSemantics(
        "stop on exists",
        safeInbox.replace(
          "Only completed records are no-ops.",
          "If the event id already exists, stop without checking its state.",
        ),
      ),
    /only completed|must not stop merely/,
  );
  assert.throws(
    () =>
      assertEventProcessingSemantics(
        "lost insertion crash",
        safeInbox.replace(
          "if a crash occurs after pending insertion but before processing, resume the record",
          "if a crash occurs after pending insertion but before processing, discard the record",
        ),
      ),
    /insertion-before-processing crash/,
  );
  assert.throws(
    () =>
      assertEventProcessingSemantics(
        "authoritative payload",
        safeInbox.replace(
          "a partial or redacted locator and advisory projection, not the authority",
          "the complete authoritative current resource",
        ),
      ),
    /classify event data conservatively|not .*authority/,
  );

  const portal = `## Use the delivery portal

Use ${operationMarkdown("get", "/v3/webhooks/portal")} only for documented delivery logs, retries, and manual replay.`;
  assert.doesNotThrow(() => assertPortalScope("safe portal", portal));
  assert.throws(
    () =>
      assertPortalScope(
        "expanded portal",
        `${portal} Configure HMAC signing secrets in the portal.`,
      ),
    /must not expand/,
  );

  const boundary = `## Contract boundary

The public contract does not define webhook signing, HMAC, signature headers, or verification secrets.

The public contract does not document retry counts, retry timing, or backoff.

The public contract does not guarantee at-least-once or exactly-once delivery.

The public contract does not guarantee event ordering or other delivery guarantees.

## Canonical envelope

The contract-defined \`attempt\` field remains unchanged by delivery retries.

## Use the delivery portal

Use the portal only for documented delivery logs, retries, and manual replay.`;
  assert.doesNotThrow(() => assertWebhookContractBoundary("safe full page", boundary));

  for (const [name, claim] of [
    ["HMAC", "Verify the X-Swipelux-Signature HMAC header with the webhook secret."],
    ["signing", "Webhooks are signed before delivery."],
    ["signature header", "Read the X-Swipelux-Signature header before processing."],
    ["webhook secret", "Use the webhook secret to verify requests."],
    ["retry count", "Swipelux retries each delivery three times."],
    ["retry timing", "Swipelux retries deliveries after five minutes."],
    ["retry backoff", "Swipelux uses exponential backoff for delivery retries."],
    ["at least once", "Webhook delivery is at-least-once."],
    ["exactly once", "Webhook delivery is exactly-once."],
    ["ordering", "Webhook events are delivered in order."],
    ["ordered events", "Webhook events are ordered."],
  ]) {
    assert.throws(
      () => assertWebhookContractBoundary(name, `${boundary}\n\n${claim}`),
      /same-segment public-contract boundary/,
    );
  }
  assert.throws(
    () =>
      assertWebhookContractBoundary(
        "unrelated negative",
        `${boundary}\n\nThe public contract does not guarantee ordering. Webhooks are signed.`,
      ),
    /same-segment public-contract boundary/,
  );
  assert.throws(
    () =>
      assertWebhookContractBoundary(
        "same paragraph contradiction",
        `${boundary}\n\nThe public contract does not guarantee ordering. Webhook events are delivered in order.`,
      ),
    /same-segment public-contract boundary/,
  );
  assert.throws(
    () =>
      assertWebhookContractBoundary(
        "same sentence contradiction",
        `${boundary}\n\nThe public contract does not define signing, but webhooks are signed.`,
      ),
    /same-segment public-contract boundary/,
  );
  assert.throws(
    () =>
      assertWebhookContractBoundary(
        "same sentence and contradiction",
        `${boundary}\n\nThe public contract does not define signing and webhooks are signed.`,
      ),
    /same-segment public-contract boundary/,
  );
  assert.throws(
    () =>
      assertWebhookContractBoundary(
        "signature request contradiction",
        `${boundary}\n\nThe public contract does not define signatures and webhook requests carry a signature header.`,
      ),
    /same-segment public-contract boundary/,
  );
  assert.throws(
    () =>
      assertWebhookContractBoundary(
        "code block claim",
        `${boundary}\n\n\`\`\`text\nWebhook delivery is exactly-once.\n\`\`\``,
      ),
    /same-segment public-contract boundary/,
  );
  assert.throws(
    () =>
      assertWebhookContractBoundary(
        "code block contradiction",
        `${boundary}\n\n\`\`\`text\nThe contract does not guarantee ordering, but events are delivered in order.\n\`\`\``,
      ),
    /same-segment public-contract boundary/,
  );
  assert.throws(
    () =>
      assertWebhookContractBoundary(
        "code block and contradiction",
        `${boundary}\n\n\`\`\`text\nThe contract does not guarantee ordering and events are delivered in order.\n\`\`\``,
      ),
    /same-segment public-contract boundary/,
  );
  assert.throws(
    () =>
      assertWebhookContractBoundary(
        "code block delivery contradiction",
        `${boundary}\n\n\`\`\`text\nThe contract does not guarantee exactly-once semantics and webhook delivery is exactly-once.\n\`\`\``,
      ),
    /same-segment public-contract boundary/,
  );

  const production = requiredPage("integration/production-readiness");
  assert.throws(
    () =>
      assertLaunchChecklistSemantics(
        "schema-less production scope",
        production.replace("This workflow does not apply", "This workflow also applies"),
      ),
    /exclude schema-less/,
  );

  const cutover = `## Launch checklist

- [ ] Build a production inventory of required configuration and resources.
- [ ] Create or verify the needed production configuration and resources.
- [ ] Store environment-specific IDs for every production resource.
- [ ] Perform the environment cutover on the same host. A different API key only selects the target environment; the public contract does not document copying sandbox resource ids, customers, webhooks, or configuration to production.
- [ ] Run a read-only smoke test before enabling production writes.`;
  assert.doesNotThrow(() => assertProductionCutoverSemantics("safe cutover", cutover));
  assert.throws(
    () =>
      assertProductionCutoverSemantics(
        "automatic migration",
        `${cutover}\n- [ ] The API key swap automatically migrates sandbox customers to production.`,
      ),
    /automatic sandbox migration/,
  );
  assert.throws(
    () =>
      assertProductionCutoverSemantics(
        "sandbox ID reuse",
        `${cutover}\n- [ ] Reuse sandbox resource IDs in production.`,
      ),
    /reuse sandbox IDs/,
  );

  const environment = `Sandbox and production use the same API host, \`https://platform.swipelux.com\`. The API key selects the environment. No real funds move. Do not assume automatic sequencing or production equivalence.`;
  assert.doesNotThrow(() => assertEnvironmentSemantics("safe environment", environment));
  assert.throws(
    () =>
      assertEnvironmentSemantics(
        "separate host",
        environment.replace(
          "the same API host, \`https://platform.swipelux.com\`",
          "\`https://sandbox.swipelux.com\`",
        ),
      ),
    /same .*host|sandbox\.swipelux\.com/,
  );
  assert.throws(
    () => assertEnvironmentSemantics("real funds", environment.replace("No real funds move", "Real funds move")),
    /no real funds move/,
  );

  const sandboxSafety = `None of the six sandbox operations declare \`Idempotency-Key\`. None of their responses document \`Idempotency-Replayed\`.`;
  assert.doesNotThrow(() => assertSandboxSafetyBoundary("safe sandbox", sandboxSafety));
  assert.throws(
    () =>
      assertSandboxSafetyBoundary(
        "unsafe sandbox",
        "All sandbox writes require \`Idempotency-Key\` and return \`Idempotency-Replayed\`.",
      ),
    /must derive sandbox idempotency/,
  );
});
