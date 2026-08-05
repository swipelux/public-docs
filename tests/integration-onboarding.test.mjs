import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { collectNavigationPages } from "../scripts/lib/docs-validation.mjs";
import { assertPages, readPage } from "./helpers/content.mjs";

const PAGES = [
  "integration/onboarding/individuals",
  "integration/onboarding/businesses",
  "integration/onboarding/tasks-and-submissions",
  "integration/onboarding/documents",
];

const PAGE_OPERATIONS = new Map([
  [
    "integration/onboarding/individuals",
    [
      ["post", "/v3/customers"],
      ["get", "/v3/customers/{customerId}"],
      ["get", "/v3/customers/{customerId}/capabilities/supported"],
      [
        "get",
        "/v3/customers/{customerId}/capabilities/{capabilityId}/tasks-preview",
      ],
      ["post", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
      ["get", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
    ],
  ],
  [
    "integration/onboarding/businesses",
    [
      ["post", "/v3/customers"],
      ["get", "/v3/customers/{customerId}"],
      ["post", "/v3/customers/{customerId}/related-parties"],
      ["get", "/v3/customers/{customerId}/related-parties"],
      [
        "get",
        "/v3/customers/{customerId}/related-parties/{relatedPartyId}",
      ],
      [
        "patch",
        "/v3/customers/{customerId}/related-parties/{relatedPartyId}",
      ],
      [
        "delete",
        "/v3/customers/{customerId}/related-parties/{relatedPartyId}",
      ],
      ["get", "/v3/customers/{customerId}/capabilities/supported"],
      [
        "get",
        "/v3/customers/{customerId}/capabilities/{capabilityId}/tasks-preview",
      ],
      ["post", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
      ["get", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
    ],
  ],
  [
    "integration/onboarding/tasks-and-submissions",
    [
      ["get", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
      [
        "get",
        "/v3/customers/{customerId}/capabilities/{capabilityId}/applications",
      ],
      ["get", "/v3/customers/{customerId}/tasks"],
      ["get", "/v3/customers/{customerId}/tasks/{taskId}"],
      [
        "post",
        "/v3/customers/{customerId}/tasks/{taskId}/submissions",
      ],
      [
        "get",
        "/v3/customers/{customerId}/tasks/{taskId}/submissions",
      ],
      [
        "get",
        "/v3/customers/{customerId}/tasks/{taskId}/submissions/{submissionId}",
      ],
      ["post", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
      [
        "post",
        "/v3/customers/{customerId}/capabilities/{capabilityId}/cancel",
      ],
    ],
  ],
  [
    "integration/onboarding/documents",
    [
      ["post", "/v3/customers/{customerId}/documents"],
      ["get", "/v3/customers/{customerId}/documents"],
      ["get", "/v3/customers/{customerId}/documents/{documentId}"],
      ["delete", "/v3/customers/{customerId}/documents/{documentId}"],
    ],
  ],
]);

const WRITE_OPERATIONS = new Map([
  [
    "integration/onboarding/individuals",
    [
      ["post", "/v3/customers"],
      ["post", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
    ],
  ],
  [
    "integration/onboarding/businesses",
    [
      ["post", "/v3/customers"],
      ["post", "/v3/customers/{customerId}/related-parties"],
      [
        "patch",
        "/v3/customers/{customerId}/related-parties/{relatedPartyId}",
      ],
      [
        "delete",
        "/v3/customers/{customerId}/related-parties/{relatedPartyId}",
      ],
      ["post", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
    ],
  ],
  [
    "integration/onboarding/tasks-and-submissions",
    [
      [
        "post",
        "/v3/customers/{customerId}/tasks/{taskId}/submissions",
      ],
      ["post", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
      [
        "post",
        "/v3/customers/{customerId}/capabilities/{capabilityId}/cancel",
      ],
    ],
  ],
  [
    "integration/onboarding/documents",
    [
      ["post", "/v3/customers/{customerId}/documents"],
      ["delete", "/v3/customers/{customerId}/documents/{documentId}"],
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function requestBodySchema(method, path, mediaType = "application/json") {
  const body = requestBody(method, path);
  assert.ok(body, `Missing request body for ${method.toUpperCase()} ${path}`);
  const schema = body.content?.[mediaType]?.schema;
  assert.ok(
    schema,
    `Missing ${mediaType} request schema for ${method.toUpperCase()} ${path}`,
  );
  return resolveOpenApiReference(schema);
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

function responseDataSchema(method, path, status = "200") {
  const envelope = responseSchema(method, path, status);
  assert.ok(envelope.required?.includes("data"));
  return resolveOpenApiReference(envelope.properties?.data);
}

function responseHeaderSchema(method, path, status, headerName) {
  const { operationObject } = openApiOperation(method, path);
  const response = resolveOpenApiReference(operationObject.responses?.[status]);
  assert.ok(response, `Missing ${status} response for ${method.toUpperCase()} ${path}`);
  const header = resolveOpenApiReference(response.headers?.[headerName]);
  assert.ok(
    header,
    `Missing ${headerName} header for ${method.toUpperCase()} ${path} ${status}`,
  );
  return resolveOpenApiReference(header.schema);
}

function assertNoStoreResponses(method, path) {
  const { operationObject } = openApiOperation(method, path);
  for (const status of Object.keys(operationObject.responses)) {
    const schema = responseHeaderSchema(method, path, status, "Cache-Control");
    assert.equal(schema.type, "string");
    assertExactOpenApiSet(
      schema.enum,
      ["no-store"],
      `${method.toUpperCase()} ${path} ${status} Cache-Control values`,
    );
  }
}

function assertExactOpenApiSet(actual, expected, label) {
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
  return [...text.matchAll(/\[\`(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS|TRACE) (\/v3\/[^`]+)\`\]\(([^)]+)\)/g)].map(
    (match) => ({
      end: match.index + match[0].length,
      href: match[3],
      method: match[1].toLowerCase(),
      path: match[2],
      start: match.index,
    }),
  );
}

function assertEveryOperationLabelIsCoverageLinked(label, text) {
  const links = linkedOperationLabels(text);
  const labels = [
    ...text.matchAll(/\`(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS|TRACE) (\/v3\/[^`]+)\`/g),
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

function statusLineValues(text, label) {
  const prefix = `- **${label}:**`;
  const lines = text.split("\n").filter((line) => line.startsWith(prefix));
  assert.equal(lines.length, 1, `Expected one ${label} vocabulary line`);
  return [...lines[0].matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function shellBlocks(text) {
  return [...text.matchAll(/```(?:bash|sh|shell)\n([\s\S]*?)```/g)].map(
    (match) => match[1],
  );
}

const DOCUMENT_CURL_EXPORTS = [
  "API_BASE",
  "CUSTOMER_ID",
  "SWIPELUX_API_KEY",
  "RUN_ID",
  "IDEMPOTENCY_KEY",
];

function unquotedShellControl(block) {
  let quote;
  for (let index = 0; index < block.length; index += 1) {
    const character = block[index];
    if (character === "\\" && quote === '"') {
      index += 1;
      continue;
    }
    if (character === "'" || character === '"') {
      if (quote === character) quote = undefined;
      else if (quote === undefined) quote = character;
      continue;
    }
    if (quote === undefined && ";|&<>".includes(character)) return character;
  }
  return undefined;
}

function assertSafeMdxCurlBlock(block, label) {
  assert.doesNotMatch(
    block,
    /\$\(|`/,
    `${label} must not contain command substitution`,
  );
  assert.equal(
    unquotedShellControl(block),
    undefined,
    `${label} must not contain redirections or shell control operators`,
  );

  const lines = block.trimEnd().split("\n");
  assert.ok(lines.length > 0, `${label} must not be empty`);

  const exportNames = [];
  let commandIndex = 0;
  while (commandIndex < lines.length && lines[commandIndex].startsWith("export ")) {
    const match = lines[commandIndex].match(
      /^export ([A-Z_][A-Z0-9_]*)=(?:'[^']*'|"[^"]*")$/,
    );
    assert.ok(match, `${label} has an unsafe export assignment`);
    exportNames.push(match[1]);
    commandIndex += 1;
  }
  assert.deepEqual(
    exportNames.toSorted(),
    DOCUMENT_CURL_EXPORTS.toSorted(),
    `${label} must contain exactly the permitted export assignments`,
  );

  if (lines[commandIndex]?.trim() === "") commandIndex += 1;

  const commandLines = lines.slice(commandIndex);
  assert.ok(commandLines.length >= 2, `${label} must contain one curl command`);
  assert.ok(
    commandLines.every((line) => line.trim() !== ""),
    `${label} must not contain blank curl command lines`,
  );
  assert.match(
    commandLines[0],
    /^curl --request [A-Z]+ \\$/,
    `${label} must start one non-absolute curl command`,
  );
  assert.equal(
    commandLines.filter((line) => /^\s*(?:curl|\/[^\s]*)\b/.test(line)).length,
    1,
    `${label} must contain exactly one non-absolute curl command`,
  );

  for (let index = 1; index < commandLines.length; index += 1) {
    const line = commandLines[index];
    const isLast = index === commandLines.length - 1;
    const hasContinuation = line.endsWith(" \\");
    assert.equal(
      hasContinuation,
      !isLast,
      `${label} must continue every curl line except the last`,
    );
    const content = hasContinuation ? line.slice(0, -2) : line;
    assert.match(
      content,
      /^\s+(?:"[^"]+"|--[a-z][a-z-]+ "[^"]+")$/,
      `${label} must contain only curl arguments and continuations`,
    );
  }

  assert.deepEqual(
    commandLines,
    [
      "curl --request POST \\",
      '  "${API_BASE}/v3/customers/${CUSTOMER_ID}/documents" \\',
      '  --header "X-API-Key: ${SWIPELUX_API_KEY}" \\',
      '  --header "Idempotency-Key: ${IDEMPOTENCY_KEY}" \\',
      '  --form "file=@./document.pdf;type=application/pdf"',
    ],
    `${label} must use the exact POST document-upload command with the exact URL and option order, exactly two expected headers, exactly one file form field, and no extra options`,
  );
}

function assertGeneratedDocumentIdempotencySource(block, label) {
  const runIdAssignments = [...block.matchAll(/^export RUN_ID=(.+)$/gm)];
  assert.equal(
    runIdAssignments.length,
    1,
    `${label} must define one generated or caller-preserved RUN_ID`,
  );
  assert.match(
    runIdAssignments[0][1],
    /\$\{RUN_ID:-/,
    `${label} must preserve a caller-provided RUN_ID`,
  );
  assert.doesNotMatch(
    runIdAssignments[0][1],
    /\$\(|`/,
    `${label} must use only Bash built-ins to generate RUN_ID`,
  );
  for (const [pattern, source] of [
    [/(?:\$\{PPID\}|\$PPID\b)/, "PPID"],
    [/\$\$/, "$$"],
    [/(?:\$\{RANDOM\}|\$RANDOM\b)/, "RANDOM"],
  ]) {
    assert.match(
      runIdAssignments[0][1],
      pattern,
      `${label} must include ${source} in its generated run-scoped RUN_ID`,
    );
  }

  const keyAssignments = [...block.matchAll(/^export IDEMPOTENCY_KEY=(.+)$/gm)];
  assert.equal(
    keyAssignments.length,
    1,
    `${label} must define one IDEMPOTENCY_KEY`,
  );
  assert.match(
    keyAssignments[0][1],
    /\$\{RUN_ID\}|\$RUN_ID\b/,
    `${label} must derive IDEMPOTENCY_KEY from RUN_ID`,
  );
  assert.doesNotMatch(
    keyAssignments[0][1],
    /\$\{?IDEMPOTENCY_KEY\b/,
    `${label} must derive IDEMPOTENCY_KEY unconditionally instead of preserving a stale key`,
  );
  assert.doesNotMatch(
    block,
    /(?:attempt[-_]?0*01|[-_]0*01)(?:['"\s]|$)/i,
    `${label} must not publish a fixed -001-style key`,
  );
  assert.match(
    block,
    /Idempotency-Key:\s*\$\{IDEMPOTENCY_KEY\}/,
    `${label} must pass the expanded IDEMPOTENCY_KEY to curl`,
  );
}

function shellSingleQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function curlArgumentRunsFromBash(
  block,
  label,
  { environment = {}, runIds = [undefined] } = {},
) {
  assertSafeMdxCurlBlock(block, label);

  const startMarker = "__SWIPELUX_CURL_START__";
  const endMarker = "__SWIPELUX_CURL_END__";
  const script = [
    "set -euo pipefail",
    "curl() {",
    `  printf '%s\\0' '${startMarker}' "$@" '${endMarker}'`,
    "}",
    ...runIds.flatMap((runId) => [
      ...(runId === undefined
        ? []
        : [`export RUN_ID=${shellSingleQuote(runId)}`]),
      block,
    ]),
  ].join("\n");
  const result = spawnSync(
    "/bin/bash",
    ["--noprofile", "--norc", "-c", script],
    {
      encoding: "utf8",
      env: {
        PATH: "/nonexistent",
        ...environment,
      },
    },
  );

  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    `${label} must execute under Bash with a stub curl: ${result.stderr.trim()}`,
  );

  const output = result.stdout.split("\0");
  const invocations = [];
  for (let index = 0; index < output.length; index += 1) {
    if (output[index] !== startMarker) continue;
    const endIndex = output.indexOf(endMarker, index + 1);
    assert.notEqual(endIndex, -1, `${label} must finish every curl invocation`);
    const argv = output.slice(index + 1, endIndex);
    assert.doesNotMatch(
      argv.join("\n"),
      /\$\{?[A-Z_][A-Z0-9_]*\}?/,
      `${label} must not pass unresolved shell placeholders to curl`,
    );
    invocations.push(argv);
    index = endIndex;
  }
  assert.equal(
    invocations.length,
    runIds.length,
    `${label} must invoke curl exactly once per requested run`,
  );
  return invocations;
}

function curlHeaderValues(argv, headerName) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--header" && argv[index] !== "-H") continue;
    assert.ok(index + 1 < argv.length, `${argv[index]} must have a value`);
    const header = argv[index + 1];
    const separator = header.indexOf(":");
    if (
      separator >= 0 &&
      header.slice(0, separator).trim().toLowerCase() ===
        headerName.toLowerCase()
    ) {
      values.push(header.slice(separator + 1).trim());
    }
    index += 1;
  }
  return values;
}

function curlOptionValues(argv, option) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== option) continue;
    assert.ok(index + 1 < argv.length, `${option} must have a value`);
    values.push(argv[index + 1]);
    index += 1;
  }
  return values;
}

function curlFormFieldNames(argv) {
  return curlOptionValues(argv, "--form").map((value) => {
    const separator = value.indexOf("=");
    assert.ok(separator > 0, `multipart form value must contain a field name: ${value}`);
    return value.slice(0, separator);
  });
}

function expectedDocumentUploadCurlArgv(idempotencyKey) {
  return [
    "--request",
    "POST",
    "https://platform.swipelux.com/v3/customers/cus_example123/documents",
    "--header",
    "X-API-Key: YOUR_API_KEY",
    "--header",
    `Idempotency-Key: ${idempotencyKey}`,
    "--form",
    "file=@./document.pdf;type=application/pdf",
  ];
}

function proseParagraphs(text) {
  const paragraphs = [];
  let current = [];
  let inFence = false;

  const flush = () => {
    if (current.length > 0) paragraphs.push(current.join("\n"));
    current = [];
  };

  for (const line of text.split("\n")) {
    if (/^```/.test(line)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (line.trim() === "" || /^#{1,6}\s/.test(line)) {
      flush();
      continue;
    }
    if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(line)) {
      flush();
      current.push(line);
      continue;
    }
    current.push(line);
  }
  flush();
  return paragraphs;
}

function assertParagraphIdempotency(label, text, method, path) {
  const markdown = operationMarkdown(method, path);
  const matchingParagraphs = proseParagraphs(text).filter((paragraph) =>
    paragraph.includes(markdown),
  );
  assert.equal(
    matchingParagraphs.length,
    1,
    `${label} must contain ${markdown} in exactly one prose paragraph`,
  );
  assert.match(
    matchingParagraphs[0],
    /`Idempotency-Key`/,
    `${label} must keep Idempotency-Key guidance in the same prose paragraph as ${method.toUpperCase()} ${path}`,
  );
}

function markdownSection(text, heading) {
  const headingPattern = new RegExp(`^## ${escapeRegExp(heading)}\\s*$`, "m");
  const match = headingPattern.exec(text);
  assert.ok(match, `Missing section: ${heading}`);
  const contentStart = match.index + match[0].length;
  const remaining = text.slice(contentStart);
  const nextHeading = remaining.search(/^##\s/m);
  return nextHeading === -1 ? remaining : remaining.slice(0, nextHeading);
}

function labeledBullet(section, label) {
  const prefix = `- **${label}:**`;
  const lines = section.split("\n").filter((line) => line.startsWith(prefix));
  assert.equal(lines.length, 1, `Expected one ${label} lifecycle bullet`);
  return lines[0].slice(prefix.length).trim();
}

test("publishes all onboarding pages once with valid guarded MDX", () => {
  assertPages(PAGES);

  const navigationPages = collectNavigationPages(config.navigation);
  for (const page of PAGES) {
    assert.equal(
      navigationPages.filter((candidate) => candidate === page).length,
      1,
      `${page} must appear in navigation exactly once`,
    );
  }
});

test("semantic operation-link checks reject a swapped coverage href", () => {
  const customer = coveredOperation("post", "/v3/customers");
  const supported = coveredOperation(
    "get",
    "/v3/customers/{customerId}/capabilities/supported",
  );
  assert.notEqual(customer.href, supported.href);

  assert.throws(
    () =>
      assertEveryOperationLabelIsCoverageLinked(
        "probe",
        `[\`POST /v3/customers\`](${supported.href})`,
      ),
    /wrong href/,
  );
  assert.doesNotThrow(() =>
    assertEveryOperationLabelIsCoverageLinked(
      "probe",
      `[\`POST /v3/customers\`](${customer.href})`,
    ),
  );
});

test("links every onboarding operation label to its exact coverage-derived href", () => {
  for (const [page, operations] of PAGE_OPERATIONS) {
    assertRequiredOperationLinks(page, operations);
    assertEveryOperationLabelIsCoverageLinked(pageFile(page), requiredPage(page));
  }
});

test("individual and business creation use the exact customer union shapes", () => {
  const { operationObject } = openApiOperation("post", "/v3/customers");
  assert.match(
    operationObject.description,
    /Individuals require only type; businesses require business\.legalName/,
  );

  const createSchema = requestBodySchema("post", "/v3/customers");
  assert.equal(createSchema.oneOf.length, 2);
  const individual = createSchema.oneOf.find(
    (variant) => variant.properties?.type?.enum?.[0] === "individual",
  );
  const business = createSchema.oneOf.find(
    (variant) => variant.properties?.type?.enum?.[0] === "business",
  );
  assertExactOpenApiSet(individual.required, ["type"], "individual create required fields");
  assertExactOpenApiSet(
    business.required,
    ["type", "business"],
    "business create required fields",
  );
  assert.ok(business.properties.business.required.includes("legalName"));

  const examples = operationObject.requestBody.content["application/json"].examples;
  const individualText = requiredPage("integration/onboarding/individuals");
  const businessText = requiredPage("integration/onboarding/businesses");
  assert.ok(
    hasDeepEqual(jsonBlocks(individualText), examples.minimalIndividual.value),
    "individuals must use the contract minimalIndividual example",
  );
  assert.ok(
    hasDeepEqual(jsonBlocks(businessText), examples.minimalBusiness.value),
    "businesses must use the contract minimalBusiness example",
  );

  for (const [label, text] of [
    ["individuals", individualText],
    ["businesses", businessText],
  ]) {
    const customer = responseDataSchema("post", "/v3/customers", "201");
    assert.ok(customer, "customer create response must contain data");
    assert.match(text, /`data\.id`[\s\S]{0,100}(?:customer id|`customerId`)/i, label);
    assert.match(text, /current customer|read the customer again/i, label);
  }
});

test("business onboarding manages person and entity related parties through v3", () => {
  const createPath = "/v3/customers/{customerId}/related-parties";
  const { operationObject } = openApiOperation("post", createPath);
  assert.match(operationObject.description, /person or entity related party/i);
  assert.match(operationObject.description, /stable rp_ id/i);
  assert.match(operationObject.description, /at least one role or one ownership/i);

  const schema = requestBodySchema("post", createPath);
  assert.equal(schema.oneOf.length, 2);
  const person = schema.oneOf.find(
    (variant) => variant.properties?.partyType?.enum?.[0] === "person",
  );
  const entity = schema.oneOf.find(
    (variant) => variant.properties?.partyType?.enum?.[0] === "entity",
  );
  assertExactOpenApiSet(
    person.required,
    ["partyType", "roles", "person"],
    "person related-party required fields",
  );
  assertExactOpenApiSet(
    entity.required,
    ["partyType", "roles", "entity"],
    "entity related-party required fields",
  );
  assert.ok(entity.properties.entity.required.includes("legalName"));

  const text = requiredPage("integration/onboarding/businesses");
  const example = operationObject.requestBody.content["application/json"].examples.personDirector.value;
  assert.ok(
    hasDeepEqual(jsonBlocks(text), example),
    "businesses must include the contract personDirector example",
  );
  assert.match(text, /`partyType`[\s\S]{0,80}`person`[\s\S]{0,80}`entity`/i);
  assert.match(text, /at least one role[\s\S]{0,120}(?:ownership|voting|control)/i);
  assert.match(text, /current related-party resource[\s\S]{0,120}(?:before|then)[\s\S]{0,120}(?:patch|update)/i);
  assert.match(text, /omitted fields[\s\S]{0,80}unchanged/i);
  assert.match(text, /arrays[\s\S]{0,80}replaced whole/i);
});

test("business onboarding documents the exact related-party archival lifecycle", () => {
  const path =
    "/v3/customers/{customerId}/related-parties/{relatedPartyId}";
  const { operationObject } = openApiOperation("delete", path);
  assert.equal(
    operationObject.description,
    "Archives the related party: the id is never reused, normal reads return 404 afterwards, and an idempotent replay returns the same 204. Deletion is blocked with 409 related_party_in_review while an active review depends on the party.",
  );

  const archived = resolveOpenApiReference(operationObject.responses["204"]);
  assert.deepEqual(
    archived.headers["Idempotency-Replayed"].schema.enum,
    ["true"],
  );

  for (const method of ["get", "patch"]) {
    const { operationObject: followUp } = openApiOperation(method, path);
    const notFound = resolveOpenApiReference(followUp.responses["404"]);
    assert.ok(
      notFound.content["application/problem+json"].schema.properties.code.enum.includes(
        "related_party_not_found",
      ),
      `${method.toUpperCase()} ${path} must treat archived ids as not found`,
    );
  }

  const conflict = resolveOpenApiReference(operationObject.responses["409"]);
  const conflictSchema = conflict.content["application/problem+json"].schema;
  assert.ok(
    conflictSchema.properties.code.enum.includes("related_party_in_review"),
  );
  assert.deepEqual(conflict.content["application/problem+json"].examples.activeReview.value, {
    type: "https://docs.swipelux.com/errors/related-party-in-review",
    title: "Related Party In Review",
    status: 409,
    code: "related_party_in_review",
    detail: "Wait for the active review to finish before archiving the party.",
    correlationId: "01JERRORRELATEDPARTY",
    retryable: false,
  });

  const text = requiredPage("integration/onboarding/businesses");
  assert.ok(
    text.includes(operationObject.description),
    "businesses must preserve the exact archival behavior wording",
  );
  assert.match(
    text,
    /read and update operations[\s\S]{0,120}404[\s\S]{0,80}`related_party_not_found`/i,
  );
  assert.match(
    text,
    /reuse the same `Idempotency-Key`[\s\S]{0,140}same archive request/i,
  );
});

test("capability discovery, optional preview, and request guidance follow the contract", () => {
  const supportedPath = "/v3/customers/{customerId}/capabilities/supported";
  const supported = responseDataSchema("get", supportedPath);
  assert.equal(supported.type, "array");
  const variant = resolveOpenApiReference(supported.items);
  for (const field of ["availability", "eligibility", "institutions"]) {
    assert.ok(variant.required.includes(field));
  }
  assertExactOpenApiSet(
    variant.properties.availability.enum,
    ["available", "beta", "disabled"],
    "supported capability availability",
  );
  const eligibility = resolveOpenApiReference(variant.properties.eligibility);
  assert.ok(eligibility.required.includes("eligible"));
  assert.equal(eligibility.properties.eligible.type, "boolean");

  const previewPath =
    "/v3/customers/{customerId}/capabilities/{capabilityId}/tasks-preview";
  const preview = openApiOperation("get", previewPath).operationObject;
  assert.match(preview.description, /descriptor-only tasks/i);
  assert.match(preview.description, /pinned, side-effect-free evaluation snapshot/i);

  const requestPath = "/v3/customers/{customerId}/capabilities/{capabilityId}";
  const capabilityRequestBody = requestBody("post", requestPath);
  assert.equal(capabilityRequestBody.required, true);
  const requestSchema = requestBodySchema("post", requestPath);
  assert.deepEqual(requestSchema.required ?? [], []);
  const institutions = requestSchema.properties.institutions;
  assert.equal(institutions.type, "array");
  assert.match(institutions.description, /omitted or empty/i);
  assert.match(institutions.description, /registry defaults/i);
  assert.match(institutions.description, /non-empty list explicitly overrides defaults/i);
  assert.match(
    openApiOperation("post", requestPath).operationObject.description,
    /Known ineligible variants fail/i,
  );

  for (const page of [
    "integration/onboarding/individuals",
    "integration/onboarding/businesses",
  ]) {
    const text = requiredPage(page);
    assert.match(
      text,
      /`availability`[\s\S]{0,100}`available`[\s\S]{0,80}`beta`/i,
    );
    assert.match(text, /`eligibility\.eligible`[\s\S]{0,80}`true`/i);
    assert.match(text, /known[\s\S]{0,80}`disabled`[\s\S]{0,100}ineligible/i);
    assert.match(text, /optional[\s\S]{0,100}task preview/i);
    assert.match(text, /descriptor-only[\s\S]{0,120}side-effect-free/i);
    assert.match(text, /preview[\s\S]{0,160}(?:does not|not)[\s\S]{0,100}(?:current|actual) task/i);
    assert.match(
      text,
      /omitted or empty[\s\S]{0,120}registry defaults[\s\S]{0,160}non-empty[\s\S]{0,120}overrides defaults/i,
    );
    assert.match(text, /known ineligible[\s\S]{0,80}fail/i);
  }

  const businessText = requiredPage("integration/onboarding/businesses");
  assert.match(businessText, /JSON body is required/i);
  assert.match(
    businessText,
    /`\{\}`[\s\S]{0,80}(?:uses|selects)[\s\S]{0,80}defaults/i,
  );
});

test("openTaskIds lead to customer-scoped task details and only details expose action URLs", () => {
  const capability = resolveOpenApiReference(openapi.components.schemas.Capability);
  assert.ok(capability.required.includes("openTaskIds"));
  assert.ok(capability.required.includes("applications"));
  assert.match(capability.properties.openTaskIds.description, /one of its applications/i);
  assert.match(capability.properties.openTaskIds.description, /shared customer tasks/i);

  const application = resolveOpenApiReference(openapi.components.schemas.Application);
  assert.ok(application.required.includes("openTaskIds"));
  assert.match(application.properties.openTaskIds.description, /shared customer tasks/i);
  assert.match(
    openApiOperation(
      "get",
      "/v3/customers/{customerId}/capabilities/{capabilityId}/applications",
    ).operationObject.description,
    /Use each application's ordered openTaskIds to fetch authorized customer task details/i,
  );

  const listPath = "/v3/customers/{customerId}/tasks";
  const listResponse = responseSchema("get", listPath);
  assert.ok(listResponse.required.includes("data"));
  assert.equal(listResponse.properties.data.type, "array");
  const summaryTask = resolveOpenApiReference(listResponse.properties.data.items);

  const detailPath = "/v3/customers/{customerId}/tasks/{taskId}";
  const detailResponse = responseSchema("get", detailPath);
  assert.ok(detailResponse.required.includes("data"));
  const detailTask = resolveOpenApiReference(detailResponse.properties.data);

  for (const field of ["verificationSessions", "tosSessions"]) {
    assert.ok(summaryTask.required.includes(field));
    assert.ok(detailTask.required.includes(field));
    const summarySession = resolveOpenApiReference(
      summaryTask.properties[field].items,
    );
    const detailSession = resolveOpenApiReference(
      detailTask.properties[field].items,
    );
    assert.equal(
      summarySession.properties.url,
      undefined,
      `${field} list summaries must omit url`,
    );
    assert.equal(
      summarySession.properties.expiresAt,
      undefined,
      `${field} list summaries must omit expiresAt`,
    );
    assert.ok(detailSession.required.includes("url"));
    assert.ok(detailSession.required.includes("expiresAt"));
    assert.equal(detailSession.properties.url.type, "string");
    assert.equal(detailSession.properties.url.format, "uri");
    assert.equal(detailSession.properties.url.pattern, "^https://");
    assert.equal(
      detailSession.properties.url.description,
      "Stable first-party Swipelux action URL.",
    );
    assert.equal(detailSession.properties.expiresAt.type, "string");
    assert.equal(detailSession.properties.expiresAt.format, "date-time");
    assert.equal(detailSession.properties.expiresAt.nullable, true);
    assert.deepEqual(detailSession.properties.expiresAt.enum, [null]);
  }

  const detailOperation = openApiOperation(
    "get",
    detailPath,
  ).operationObject;
  assert.match(detailOperation.description, /authorized task action surface/i);
  assert.match(detailOperation.description, /first-party verification-session URLs/i);

  const text = requiredPage("integration/onboarding/tasks-and-submissions");
  assert.match(text, /capability[\s\S]{0,120}`openTaskIds`/i);
  assert.match(text, /application[\s\S]{0,120}`openTaskIds`/i);
  assert.match(text, /customer-scoped task detail/i);
  assert.match(text, /list[\s\S]{0,120}URL-free/i);
  assert.match(text, /`verificationSessions`[\s\S]{0,120}`url`/i);
  assert.match(text, /`tosSessions`[\s\S]{0,120}`url`/i);
  assert.match(text, /stable first-party Swipelux action URL/i);
  assert.match(text, /`expiresAt`[\s\S]{0,100}`null`[\s\S]{0,140}(?:do not|does not)[\s\S]{0,80}(?:lifetime|expiry|TTL)/i);
  assert.match(text, /backend[\s\S]{0,160}(?:fetch|read)[\s\S]{0,160}task detail/i);
  assert.match(text, /do not expose[\s\S]{0,100}`X-API-Key`[\s\S]{0,100}(?:browser|client)/i);
});

test("sensitive task and submission responses are no-store and submission detail preserves the authorized snapshot", () => {
  const taskDetailPath = "/v3/customers/{customerId}/tasks/{taskId}";
  const submissionCreatePath =
    "/v3/customers/{customerId}/tasks/{taskId}/submissions";
  const submissionDetailPath =
    "/v3/customers/{customerId}/tasks/{taskId}/submissions/{submissionId}";

  for (const [method, path] of [
    ["get", taskDetailPath],
    ["post", submissionCreatePath],
    ["get", submissionDetailPath],
  ]) {
    assertNoStoreResponses(method, path);
  }

  const detailOperation = openApiOperation(
    "get",
    submissionDetailPath,
  ).operationObject;
  assert.equal(
    detailOperation.description,
    "Returns the authorized immutable answer snapshot and current public outcome.",
  );

  const createDetail = responseDataSchema("post", submissionCreatePath, "201");
  const authorizedDetail = responseDataSchema("get", submissionDetailPath);
  for (const detail of [createDetail, authorizedDetail]) {
    assert.equal(
      detail.properties.answers.items.$ref,
      "#/components/schemas/SubmissionSnapshotAnswerEntry",
    );
    const snapshotEntry = resolveOpenApiReference(detail.properties.answers.items);
    assertExactOpenApiSet(
      snapshotEntry.required,
      ["requirementId", "answer"],
      "submission snapshot answer required fields",
    );
    assert.ok(snapshotEntry.properties.alternativeKey);
    assert.ok(snapshotEntry.properties.answer);
  }

  const listEnvelope = responseSchema("get", submissionCreatePath);
  assert.equal(listEnvelope.properties.data.type, "array");
  const summary = resolveOpenApiReference(listEnvelope.properties.data.items);
  assert.equal(
    summary.properties.answers.items.$ref,
    "#/components/schemas/SubmissionAnswerSummary",
  );
  const summaryAnswer = resolveOpenApiReference(summary.properties.answers.items);
  assertExactOpenApiSet(
    Object.keys(summaryAnswer.properties),
    ["requirementId", "answerType"],
    "redacted submission answer fields",
  );

  const text = requiredPage("integration/onboarding/tasks-and-submissions");
  assert.match(
    text,
    /task detail[\s\S]{0,180}submission creation[\s\S]{0,180}submission detail[\s\S]{0,120}`Cache-Control: no-store`/i,
  );
  assert.match(
    text,
    /`Cache-Control: no-store`[\s\S]{0,160}do not[\s\S]{0,80}(?:browser|proxy|application) cache/i,
  );
  assert.match(
    text,
    /authorized immutable answer snapshot[\s\S]{0,120}current (?:public )?outcome/i,
  );
  assert.match(
    text,
    /redacted[\s\S]{0,120}(?:omits|without)[\s\S]{0,120}(?:answer values|alternatives|document ids)/i,
  );
  assert.doesNotMatch(text, /does not add other hosted-session security properties/i);
});

test("task submissions use the current revision and one complete immutable answer set", () => {
  const path = "/v3/customers/{customerId}/tasks/{taskId}/submissions";
  const { operationObject } = openApiOperation("post", path);
  assert.match(operationObject.description, /one complete immutable attempt/i);
  assert.match(operationObject.description, /current remediation round/i);
  assert.equal(operationObject.requestBody["x-max-body-bytes"], 524288);

  const submission = resolveOpenApiReference(openapi.components.schemas.SubmissionRequest);
  assertExactOpenApiSet(
    submission.required,
    ["taskRevision", "answers"],
    "submission required fields",
  );
  assert.equal(submission.properties.taskRevision.minimum, 1);
  assert.equal(submission.properties.answers.minItems, 1);
  assert.equal(submission.properties.answers.maxItems, 100);
  const entry = resolveOpenApiReference(submission.properties.answers.items);
  assertExactOpenApiSet(
    entry.required,
    ["requirementId", "answer"],
    "submission answer entry required fields",
  );
  assert.ok(entry.properties.alternativeKey);

  const taskChanged = resolveOpenApiReference(
    openapi.components.schemas.TaskChangedProblem,
  );
  assert.deepEqual(taskChanged.properties.code.enum, ["task_changed"]);
  for (const field of ["currentRevision", "currentStatus", "taskId", "taskUrl"]) {
    assert.ok(taskChanged.required.includes(field));
  }
  const incomplete = resolveOpenApiReference(
    openapi.components.schemas.TaskSubmissionIncompleteProblem,
  );
  assert.deepEqual(incomplete.properties.code.enum, ["task_submission_incomplete"]);
  assert.ok(incomplete.required.includes("missingRequirementIds"));

  const text = requiredPage("integration/onboarding/tasks-and-submissions");
  const example = resolveOpenApiReference(
    openapi.components.examples.SubmissionRequest,
  ).value;
  assert.ok(
    hasDeepEqual(jsonBlocks(text), example),
    "tasks guide must include the contract submission example",
  );
  assert.match(text, /current `revision`[\s\S]{0,100}`taskRevision`/i);
  assert.match(text, /complete[\s\S]{0,100}(?:answer set|answers)/i);
  assert.match(text, /immutable[\s\S]{0,100}(?:attempt|submission)/i);
  assert.match(text, /`requirementId`[\s\S]{0,120}`request\.type`[\s\S]{0,120}`answer\.type`/i);
  assert.match(text, /`alternativeKey`[\s\S]{0,140}(?:alternative|when)/i);
  assert.match(text, /`task_submission_incomplete`[\s\S]{0,120}`missingRequirementIds`/i);
  assert.match(text, /`task_changed`[\s\S]{0,160}`currentRevision`[\s\S]{0,160}(?:fetch|read)[\s\S]{0,100}task again/i);
  assert.match(text, /524,288 bytes/);
  assert.match(text, /do not reuse[\s\S]{0,160}(?:task|revision|answer set)/i);
});

test("submission idempotency keys replay only the exact body and never a rebuilt body", () => {
  const text = requiredPage("integration/onboarding/tasks-and-submissions");
  const section = markdownSection(text, "Build one current submission");
  const exactGuidance =
    "Reuse the same `Idempotency-Key` only to replay the exact same submission body. If you rebuild the body after `task_submission_incomplete` or `task_changed`, use a new key.";

  assert.ok(
    section.includes(exactGuidance),
    "submission guidance must preserve the exact replay-versus-rebuild key boundary",
  );
  assert.doesNotMatch(
    section,
    /same `Idempotency-Key`[\s\S]{0,160}(?:rebuilt|changed|new) (?:body|submission)/i,
  );
});

test("customer document upload preserves the exact multipart and format boundary", () => {
  const path = "/v3/customers/{customerId}/documents";
  const { operationObject } = openApiOperation("post", path);
  assert.match(
    operationObject.description,
    /PDF, JPEG, PNG, WebP, or HEIF\/HEIC document up to 25 MB/,
  );
  assert.match(operationObject.description, /multipart\/form-data/);
  assert.match(operationObject.description, /raw binary/i);
  assert.match(operationObject.description, /base64 JSON is not accepted/i);

  const body = requestBody("post", path);
  assert.deepEqual(Object.keys(body.content), ["multipart/form-data"]);
  const upload = requestBodySchema("post", path, "multipart/form-data");
  assertExactOpenApiSet(upload.required, ["file"], "document upload required fields");
  assertExactOpenApiSet(
    Object.keys(upload.properties),
    ["file", "type"],
    "document upload multipart field names",
  );
  assert.equal(upload.properties.file.type, "string");
  assert.equal(upload.properties.file.format, "binary");
  assert.equal(upload.properties.type.type, "string");

  const document = resolveOpenApiReference(openapi.components.schemas.Document);
  assertExactOpenApiSet(
    document.required,
    [
      "id",
      "type",
      "fileName",
      "contentType",
      "sizeBytes",
      "status",
      "archivedAt",
      "createdAt",
      "updatedAt",
    ],
    "document metadata fields",
  );
  const documentAnswer = resolveOpenApiReference(
    openapi.components.schemas.DocumentSubmissionAnswer,
  );
  assertExactOpenApiSet(
    documentAnswer.required,
    ["type", "documentIds"],
    "document answer required fields",
  );
  assert.deepEqual(documentAnswer.properties.type.enum, ["document"]);

  const text = requiredPage("integration/onboarding/documents");
  for (const format of ["PDF", "JPEG", "PNG", "WebP", "HEIF/HEIC"]) {
    assert.match(text, new RegExp(escapeRegExp(format)));
  }
  assert.match(text, /25 MB/);
  assert.match(text, /`multipart\/form-data`/);
  assert.match(text, /raw binary[\s\S]{0,120}`file`/i);
  assert.match(text, /base64 JSON[\s\S]{0,80}not accepted/i);
  assert.match(text, /optional `type`/i);
  assert.match(
    text,
    /example[\s\S]{0,100}(?:intentionally|explicitly) omits[\s\S]{0,100}(?:API|multipart) `type` field/i,
  );
  assert.match(
    text,
    /`;type=application\/pdf`[\s\S]{0,140}(?:sets|declares)[\s\S]{0,100}(?:MIME|media) type[\s\S]{0,100}`file` part/i,
  );
  assert.match(
    text,
    /`;type=application\/pdf`[\s\S]{0,180}(?:does not|doesn't)[\s\S]{0,100}(?:API|multipart) `type` field/i,
  );
  assert.match(text, /`data\.id`[\s\S]{0,120}`documentIds`/i);
  assert.match(text, /metadata[\s\S]{0,80}(?:not|rather than)[\s\S]{0,80}(?:download|file bytes)/i);
  assert.match(
    text,
    /transport uncertainty[\s\S]{0,180}same `Idempotency-Key`[\s\S]{0,180}same multipart body[\s\S]{0,120}same file/i,
  );
});

test("document upload curl replays and rotates run-scoped keys safely without network access", () => {
  const text = requiredPage("integration/onboarding/documents");
  const curlBlocks = shellBlocks(text).filter((block) => /\bcurl\b/.test(block));
  assert.equal(curlBlocks.length, 1, "documents must contain one curl example");
  const block = curlBlocks[0];
  assertGeneratedDocumentIdempotencySource(block, "document upload curl");

  const [first, replay, nextRun] = curlArgumentRunsFromBash(
    block,
    "document upload curl same-shell runs",
    {
      environment: { IDEMPOTENCY_KEY: "stale-key-must-be-overwritten" },
      runIds: ["run-shell-test", undefined, "run-shell-next"],
    },
  );
  const [generated, generatedReplay] = curlArgumentRunsFromBash(
    block,
    "document upload curl generated RUN_ID",
    { runIds: [undefined, undefined] },
  );

  assert.deepEqual(curlHeaderValues(first, "Idempotency-Key"), [
    "customer-document-run-shell-test",
  ]);
  assert.deepEqual(
    curlHeaderValues(replay, "Idempotency-Key"),
    curlHeaderValues(first, "Idempotency-Key"),
    "rerunning the block in one shell must replay the same intended upload",
  );
  assert.deepEqual(curlHeaderValues(nextRun, "Idempotency-Key"), [
    "customer-document-run-shell-next",
  ]);
  const generatedKeys = curlHeaderValues(generated, "Idempotency-Key");
  assert.equal(generatedKeys.length, 1);
  assert.match(
    generatedKeys[0],
    /^customer-document-run-\d+-\d+-\d+$/,
    "the no-RUN_ID path must use only Bash-provided run-scoped values",
  );
  assert.deepEqual(
    curlHeaderValues(generatedReplay, "Idempotency-Key"),
    generatedKeys,
    "a generated RUN_ID must remain reusable for replay in the same shell",
  );

  for (const [argv, idempotencyKey, label] of [
    [first, "customer-document-run-shell-test", "first intended upload"],
    [replay, "customer-document-run-shell-test", "same-shell replay"],
    [nextRun, "customer-document-run-shell-next", "next intended upload"],
    [generated, generatedKeys[0], "generated-key upload"],
    [generatedReplay, generatedKeys[0], "generated-key replay"],
  ]) {
    assert.deepEqual(
      argv,
      expectedDocumentUploadCurlArgv(idempotencyKey),
      `${label} must execute the exact document upload argv`,
    );
    assertExactOpenApiSet(
      curlFormFieldNames(argv),
      ["file"],
      `${label} multipart field names`,
    );
  }

  assert.deepEqual(curlHeaderValues(first, "X-API-Key"), ["YOUR_API_KEY"]);
  assert.ok(
    first.includes(
      "https://platform.swipelux.com/v3/customers/cus_example123/documents",
    ),
  );
  assert.deepEqual(curlOptionValues(first, "--form"), [
    "file=@./document.pdf;type=application/pdf",
  ]);
  assert.deepEqual(
    curlOptionValues(replay, "--form"),
    curlOptionValues(first, "--form"),
    "a replay must preserve the same file form body",
  );
  assert.match(
    text,
    /same shell[\s\S]{0,180}(?:same|reuse)[\s\S]{0,100}`RUN_ID`[\s\S]{0,180}(?:same|replay)[\s\S]{0,100}`Idempotency-Key`/i,
  );
  assert.match(
    text,
    /(?:change|new) `RUN_ID`[\s\S]{0,180}(?:new|rotat)[\s\S]{0,100}(?:key|`Idempotency-Key`)/i,
  );
});

test("shell-block safety rejects unapproved syntax before execution", () => {
  const safeBlock = [
    "export API_BASE='https://platform.swipelux.com'",
    "export CUSTOMER_ID='cus_example123'",
    "export SWIPELUX_API_KEY='YOUR_API_KEY'",
    'export RUN_ID="${RUN_ID:-run-${PPID}-$$-${RANDOM}}"',
    'export IDEMPOTENCY_KEY="customer-document-${RUN_ID}"',
    "curl --request POST \\",
    '  "${API_BASE}/v3/customers/${CUSTOMER_ID}/documents" \\',
    '  --header "X-API-Key: ${SWIPELUX_API_KEY}" \\',
    '  --header "Idempotency-Key: ${IDEMPOTENCY_KEY}" \\',
    '  --form "file=@./document.pdf;type=application/pdf"',
  ].join("\n");
  assert.doesNotThrow(() => assertSafeMdxCurlBlock(safeBlock, "safe probe"));

  const probes = [
    ["redirection", `${safeBlock} > /dev/null`, /redirections/],
    [
      "command substitution",
      safeBlock.replace("run-${PPID}-$$-${RANDOM}", "$(date)"),
      /command substitution/,
    ],
    ["semicolon", `${safeBlock}; echo unsafe`, /control operators/],
    ["pipe", `${safeBlock} | echo unsafe`, /control operators/],
    ["background", `${safeBlock} &`, /control operators/],
    [
      "extra command",
      safeBlock.replace("curl --request", "echo unsafe\ncurl --request"),
      /one non-absolute curl command/,
    ],
    [
      "absolute command",
      safeBlock.replace("curl --request", "/usr/bin/curl --request"),
      /non-absolute curl command/,
    ],
    [
      "extra export",
      safeBlock.replace("export API_BASE", "export HOME='/tmp'\nexport API_BASE"),
      /exactly the permitted export assignments/,
    ],
    [
      "PUT method",
      safeBlock.replace("curl --request POST", "curl --request PUT"),
      /exact POST document-upload command/,
    ],
    [
      "extra header",
      safeBlock.replace(
        '  --form "file=@./document.pdf;type=application/pdf"',
        '  --header "Accept: application/json" \\\n  --form "file=@./document.pdf;type=application/pdf"',
      ),
      /exact POST document-upload command/,
    ],
  ];
  for (const [name, probe, expected] of probes) {
    assert.throws(
      () => assertSafeMdxCurlBlock(probe, `${name} probe`),
      expected,
    );
  }
});

test("document upload idempotency checks reject stale keys and weak generators", () => {
  const generatedRun =
    'export RUN_ID="${RUN_ID:-run-${PPID}-$$-${RANDOM}}"';
  assert.throws(
    () =>
      assertGeneratedDocumentIdempotencySource(
        [
          generatedRun,
          "export IDEMPOTENCY_KEY='customer-document-attempt-001'",
          'curl --header "Idempotency-Key: ${IDEMPOTENCY_KEY}"',
        ].join("\n"),
        "fixed assignment probe",
      ),
    /derive IDEMPOTENCY_KEY from RUN_ID/,
  );
  assert.throws(
    () =>
      assertGeneratedDocumentIdempotencySource(
        [
          generatedRun,
          'export IDEMPOTENCY_KEY="customer-document-${RUN_ID}"',
          'curl --header "Idempotency-Key: customer-document-upload"',
        ].join("\n"),
        "fixed header probe",
      ),
    /pass the expanded IDEMPOTENCY_KEY/,
  );
  assert.throws(
    () =>
      assertGeneratedDocumentIdempotencySource(
        [
          generatedRun,
          'export IDEMPOTENCY_KEY="${IDEMPOTENCY_KEY:-customer-document-${RUN_ID}}"',
          'curl --header "Idempotency-Key: ${IDEMPOTENCY_KEY}"',
        ].join("\n"),
        "stale key probe",
      ),
    /unconditionally instead of preserving a stale key/,
  );
  assert.throws(
    () =>
      assertGeneratedDocumentIdempotencySource(
        [
          'export RUN_ID="${RUN_ID:-20260805}"',
          'export IDEMPOTENCY_KEY="customer-document-${RUN_ID}"',
          'curl --header "Idempotency-Key: ${IDEMPOTENCY_KEY}"',
        ].join("\n"),
        "fixed date probe",
      ),
    /generated run-scoped RUN_ID/,
  );
  assert.throws(
    () =>
      assertGeneratedDocumentIdempotencySource(
        [
          'export RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"',
          'export IDEMPOTENCY_KEY="customer-document-${RUN_ID}"',
          'curl --header "Idempotency-Key: ${IDEMPOTENCY_KEY}"',
        ].join("\n"),
        "external command probe",
      ),
    /only Bash built-ins/,
  );
});

test("document archival retains compliance data while excluding archived documents from active surfaces", () => {
  const path = "/v3/customers/{customerId}/documents/{documentId}";
  const { operationObject } = openApiOperation("delete", path);
  const exactLifecycle =
    "Archives one customer document. Archived documents are retained for compliance but excluded from subsequent reads, lists, and task submissions.";
  assert.equal(operationObject.description, exactLifecycle);
  assert.equal(requestBody("delete", path), undefined);

  const archivedDocument = resolveOpenApiReference(
    openapi.components.schemas.ArchivedDocument,
  );
  assertExactOpenApiSet(
    archivedDocument.required,
    [
      "id",
      "type",
      "fileName",
      "contentType",
      "sizeBytes",
      "status",
      "archivedAt",
      "createdAt",
      "updatedAt",
    ],
    "ArchivedDocument fields",
  );
  assertExactOpenApiSet(
    archivedDocument.properties.status.enum,
    ["archived"],
    "ArchivedDocument status",
  );
  assert.equal(archivedDocument.properties.archivedAt.type, "string");
  assert.equal(archivedDocument.properties.archivedAt.format, "date-time");
  assert.match(archivedDocument.properties.archivedAt.description, /set exactly once/i);

  const archivedResponse = responseDataSchema("delete", path);
  assertExactOpenApiSet(
    archivedResponse.properties.status.enum,
    ["archived"],
    "document DELETE response status",
  );
  assert.match(archivedResponse.properties.archivedAt.description, /set exactly once/i);

  const listPath = "/v3/customers/{customerId}/documents";
  const listEnvelope = responseSchema("get", listPath);
  const listedDocument = resolveOpenApiReference(listEnvelope.properties.data.items);
  const currentDocument = responseDataSchema("get", path);
  for (const [label, document] of [
    ["document list item", listedDocument],
    ["document detail", currentDocument],
  ]) {
    assert.equal(document.properties.archivedAt.nullable, true, label);
    assert.match(document.properties.archivedAt.description, /always null/i, label);
    assertExactOpenApiSet(
      document.properties.status.enum,
      ["uploaded"],
      `${label} status`,
    );
  }

  const text = requiredPage("integration/onboarding/documents");
  assert.ok(
    text.includes(exactLifecycle),
    "documents guide must preserve the exact archive lifecycle wording",
  );
  assert.match(
    text,
    /DELETE response[\s\S]{0,100}`ArchivedDocument`[\s\S]{0,100}`archived`[\s\S]{0,120}`archivedAt`[\s\S]{0,100}set (?:exactly )?once/i,
  );
  assert.match(
    text,
    /ordinary (?:document )?(?:reads|read and list)[\s\S]{0,120}`Document`[\s\S]{0,120}`archivedAt`[\s\S]{0,80}always `null`/i,
  );
  assert.match(
    text,
    /same `Idempotency-Key`[\s\S]{0,140}(?:exact|same) archive request[\s\S]{0,160}new (?:key|`Idempotency-Key`)[\s\S]{0,120}different intended archival/i,
  );
  assertExactOpenApiSet(
    statusLineValues(text, "Archived document status"),
    ["archived"],
    "Archived document status",
  );
});

test("publishes exact task, application, capability, and document vocabularies", () => {
  const vocabularies = [
    [
      "Capability status",
      resolveOpenApiReference(openapi.components.schemas.Capability).properties.status.enum,
      ["pending", "ready", "restricted", "rejected", "canceled"],
    ],
    [
      "Application status",
      resolveOpenApiReference(openapi.components.schemas.Application).properties.status.enum,
      ["requested", "in_review", "action_required", "ready", "rejected", "disabled", "canceled"],
    ],
    [
      "Task status",
      resolveOpenApiReference(openapi.components.schemas.Task).properties.status.enum,
      ["action_required", "in_review", "satisfied", "rejected", "canceled"],
    ],
    [
      "Submission outcome",
      resolveOpenApiReference(openapi.components.schemas.SubmissionDetail).properties.outcome.enum,
      ["in_review", "accepted", "changes_requested", "rejected"],
    ],
    [
      "Requirement status",
      resolveOpenApiReference(openapi.components.schemas.CustomerTaskRequirement).properties.status.enum,
      ["action_required", "in_review", "accepted", "rejected", "canceled", "superseded"],
    ],
    [
      "Hosted-session status",
      resolveOpenApiReference(openapi.components.schemas.VerificationSession).properties.status.enum,
      ["action_required", "in_review", "completed", "rejected", "canceled"],
    ],
  ];

  const taskText = requiredPage("integration/onboarding/tasks-and-submissions");
  for (const [label, actual, expected] of vocabularies) {
    assertExactOpenApiSet(actual, expected, `${label} OpenAPI enum`);
    assertExactOpenApiSet(statusLineValues(taskText, label), expected, label);
  }

  const documentStatus = resolveOpenApiReference(
    openapi.components.schemas.Document,
  ).properties.status.enum;
  assertExactOpenApiSet(documentStatus, ["uploaded"], "Document status OpenAPI enum");
  assertExactOpenApiSet(
    statusLineValues(requiredPage("integration/onboarding/documents"), "Document status"),
    ["uploaded"],
    "Document status",
  );

  assert.match(
    taskText,
    /(?:read|refetch) the current task, application, and capability/i,
  );
  assert.match(taskText, /task[\s\S]{0,120}`satisfied`[\s\S]{0,120}`rejected`/i);
  assert.match(taskText, /application[\s\S]{0,160}`ready`[\s\S]{0,120}`rejected`/i);
  assert.match(taskText, /capability[\s\S]{0,160}`ready`[\s\S]{0,120}`rejected`/i);
  assert.match(taskText, /do not assume[\s\S]{0,120}(?:transition|next status|become)/i);
});

test("capability cancellation documents exact eligibility, dependency, and replacement behavior", () => {
  const cancelPath =
    "/v3/customers/{customerId}/capabilities/{capabilityId}/cancel";
  const { operationObject: cancelOperation } = openApiOperation(
    "post",
    cancelPath,
  );
  const exactCancelContract =
    "Cancels a `pending` or `restricted` capability that has no active linked accounts or transfers. On success, tasks owned exclusively by the capability or its applications and all non-archived applications are canceled. A customer-scoped intake task shared with another active capability remains open for that sibling until its final dependency ends. The canceled lifecycle remains readable until a new create request successfully replaces it.";
  assert.equal(cancelOperation.description, exactCancelContract);
  assert.equal(requestBody("post", cancelPath), undefined);

  const createPath = "/v3/customers/{customerId}/capabilities/{capabilityId}";
  const { operationObject: createOperation } = openApiOperation("post", createPath);
  const exactReplacementBehavior =
    "Requesting a canceled capability with a new idempotency key starts a fresh lifecycle after current eligibility and routing checks pass.";
  assert.ok(createOperation.description.includes(exactReplacementBehavior));

  const text = requiredPage("integration/onboarding/tasks-and-submissions");
  const section = markdownSection(text, "Cancel a current capability lifecycle");
  assert.ok(
    section.includes(exactCancelContract),
    "tasks guide must preserve the exact cancellation contract",
  );
  assert.ok(
    section.includes(exactReplacementBehavior),
    "tasks guide must preserve the exact canceled-capability replacement behavior",
  );
  assert.match(
    section,
    /same `Idempotency-Key`[\s\S]{0,140}(?:exact|same) cancel request/i,
  );
  assert.match(
    section,
    /new `Idempotency-Key`[\s\S]{0,120}(?:different|another) intended cancellation/i,
  );
});

test("documents an explicit current-state monitoring loop from exact status fields", () => {
  const capability = resolveOpenApiReference(openapi.components.schemas.Capability);
  const capabilityReason = capability.properties.statusReason;
  assertExactOpenApiSet(
    capabilityReason.required,
    ["code", "resolution", "message"],
    "capability statusReason fields",
  );
  assertExactOpenApiSet(
    capabilityReason.properties.resolution.enum,
    ["complete_tasks", "wait", "contact_support", "none"],
    "capability statusReason resolutions",
  );
  const readyVariant = capability.oneOf.find(
    (variant) => variant.properties?.status?.enum?.[0] === "ready",
  );
  const reasonVariant = capability.oneOf.find(
    (variant) => variant.required?.includes("statusReason"),
  );
  assert.ok(readyVariant.not.required.includes("statusReason"));
  assertExactOpenApiSet(
    reasonVariant.properties.status.enum,
    ["pending", "restricted", "rejected", "canceled"],
    "capability statuses that require statusReason",
  );

  const application = resolveOpenApiReference(openapi.components.schemas.Application);
  const applicationReasonProperty = application.properties.statusReason;
  assert.ok(
    application.required.includes("statusReason"),
    "Application.statusReason must be a required field",
  );
  assert.equal(applicationReasonProperty.nullable, true);
  assert.match(applicationReasonProperty.description, /`in_review` always returns/i);
  assert.match(applicationReasonProperty.description, /self-explanatory statuses may return null/i);
  const applicationReason = resolveOpenApiReference(
    applicationReasonProperty.allOf[0],
  );
  assertExactOpenApiSet(
    applicationReason.required,
    ["code", "message", "actor", "retryable"],
    "application statusReason fields",
  );
  assertExactOpenApiSet(
    applicationReason.properties.actor.enum,
    ["customer", "developer", "provider", "network", "swipelux"],
    "application statusReason actors",
  );

  const text = requiredPage("integration/onboarding/tasks-and-submissions");
  const section = markdownSection(text, "Monitor current resources");
  assert.match(
    section,
    /after every action or status event[\s\S]{0,180}(?:refetch|read again)[\s\S]{0,180}task[\s\S]{0,120}application[\s\S]{0,120}capability/i,
  );
  assert.match(
    section,
    /fresh `openTaskIds`[\s\S]{0,180}(?:repeat|loop|current response)/i,
  );

  const ready = labeledBullet(section, "`ready`");
  assert.match(ready, /capability is usable/i);

  const pending = labeledBullet(section, "`pending`");
  assert.match(pending, /continue monitoring/i);

  const restricted = labeledBullet(section, "`restricted`");
  assert.match(restricted, /not a stop condition/i);
  assert.match(
    restricted,
    /current `statusReason\.resolution`/i,
  );
  const resolutionIndex = restricted.indexOf("`statusReason.resolution`");
  const openTasksIndex = restricted.indexOf("fresh `openTaskIds`");
  assert.ok(resolutionIndex >= 0, "restricted guidance must consult resolution");
  assert.ok(openTasksIndex >= 0, "restricted complete_tasks guidance must use fresh task ids");
  assert.ok(
    resolutionIndex < openTasksIndex,
    "restricted guidance must consult statusReason.resolution before following openTaskIds",
  );
  assert.match(
    restricted,
    /`complete_tasks`[\s\S]{0,100}fresh `openTaskIds`[\s\S]{0,120}current task details/i,
  );
  for (const [resolution, action] of [
    ["complete_tasks", /complete[\s\S]{0,100}current tasks/i],
    ["wait", /continue monitoring/i],
    ["contact_support", /contact support/i],
    ["none", /do not invent/i],
  ]) {
    assert.match(restricted, new RegExp(`\`${resolution}\``));
    assert.match(restricted, action);
  }

  const terminal = labeledBullet(section, "`rejected` and `canceled`");
  assert.match(terminal, /stop the current lifecycle/i);
  assert.doesNotMatch(section, /Capability stop conditions/i);

  const applicationLifecycle = labeledBullet(section, "Application lifecycle");
  assert.match(
    applicationLifecycle,
    /`ready`[\s\S]{0,120}institution flow[\s\S]{0,180}`rejected`[\s\S]{0,120}`disabled`[\s\S]{0,120}`canceled`/i,
  );
  assert.match(
    applicationLifecycle,
    /only (?:a )?`ready` capability[\s\S]{0,100}capability usable/i,
  );
  assert.doesNotMatch(applicationLifecycle, /application is usable/i);
  assert.match(
    applicationLifecycle,
    /do not (?:treat|classify)[\s\S]{0,80}`canceled`[\s\S]{0,80}`disabled`[\s\S]{0,120}(?:waiting|action)/i,
  );

  const applicationReasonText = labeledBullet(
    section,
    "Application `statusReason`",
  );
  assert.match(applicationReasonText, /required field/i);
  assert.match(applicationReasonText, /value is nullable/i);
  assert.match(
    applicationReasonText,
    /`in_review`[\s\S]{0,120}stored or synthesized reason/i,
  );
  assert.match(
    applicationReasonText,
    /self-explanatory statuses[\s\S]{0,100}`null`/i,
  );
  for (const field of ["code", "message", "actor", "retryable"]) {
    assert.match(applicationReasonText, new RegExp(`\`${field}\``));
  }
  assert.doesNotMatch(applicationReasonText, /when present/i);

  assert.doesNotMatch(
    section,
    /other listed statuses[\s\S]{0,100}(?:require action|waiting)/i,
  );
});

test("idempotency guidance cannot be borrowed from a neighboring paragraph", () => {
  const method = "post";
  const path = "/v3/customers";
  const markdown = operationMarkdown(method, path);
  assert.doesNotThrow(() =>
    assertParagraphIdempotency(
      "same paragraph probe",
      `${markdown} declares \`Idempotency-Key\`.`,
      method,
      path,
    ),
  );
  for (const text of [
    `${markdown} creates a customer.\n\nUse \`Idempotency-Key\` for the write.`,
    `Use \`Idempotency-Key\` for the write.\n\n${markdown} creates a customer.`,
    `- ${markdown} creates a customer.\n- Use \`Idempotency-Key\` for the write.`,
  ]) {
    assert.throws(
      () => assertParagraphIdempotency("neighbor probe", text, method, path),
      /same prose paragraph/,
    );
  }

  assert.doesNotThrow(() =>
    assertParagraphIdempotency(
      "same bullet probe",
      `- ${markdown} declares \`Idempotency-Key\`.`,
      method,
      path,
    ),
  );
});

test("keeps idempotency and API credentials operation-aware and backend-only", () => {
  for (const [page, operations] of WRITE_OPERATIONS) {
    const text = requiredPage(page);
    for (const [method, path] of operations) {
      const parameter = idempotencyParameter(method, path);
      assert.ok(parameter, `${method.toUpperCase()} ${path} declares Idempotency-Key`);
      assert.equal(parameter.required, true);
      assertParagraphIdempotency(pageFile(page), text, method, path);
    }
  }

  const readOperations = [...PAGE_OPERATIONS.values()]
    .flat()
    .filter(([method]) => method === "get");
  for (const [method, path] of readOperations) {
    assert.equal(
      idempotencyParameter(method, path),
      undefined,
      `${method.toUpperCase()} ${path} must not declare Idempotency-Key`,
    );
  }

  const text = PAGES.map(requiredPage).join("\n");
  assert.match(text, /backend/gi);
  assert.match(text, /do not expose[\s\S]{0,100}`X-API-Key`[\s\S]{0,100}(?:browser|client)/i);
  assert.doesNotMatch(text, /every (?:POST|write|effectful request)[\s\S]{0,80}`Idempotency-Key`/i);
  assert.doesNotMatch(text, /all (?:POST|write|effectful) operations[\s\S]{0,80}(?:require|use)/i);

  for (const block of text.matchAll(/```(?:bash|sh|shell)\n([\s\S]*?)```/g)) {
    if (/--request\s+(?:POST|PATCH|PUT|DELETE)\b/i.test(block[1])) {
      assert.match(block[1], /Idempotency-Key:/i);
    }
    assert.doesNotMatch(block[1], /X-API-Key:\s*(?!\$|\{?YOUR_)[^"'\s]+/i);
  }
});

test("rejects legacy routes, hosts, secrets, and unverified onboarding guarantees", () => {
  const text = PAGES.map(requiredPage).join("\n");
  for (const pattern of [
    /\/kyc(?:\/|\b)/i,
    /\/kyb(?:\/|\b)/i,
    /\/customers\/business(?:\/|\b)/i,
    /(^|[^A-Za-z0-9])v1(?=$|[^A-Za-z0-9])/i,
    /(^|[^A-Za-z0-9])v2(?=$|[^A-Za-z0-9])/i,
    /wallet\.swipelux\.com/i,
    /api\.swipelux\.com/i,
    /sandbox\.swipelux\.com/i,
    /\bsk\.(?:live|sbx)\.[A-Za-z0-9_-]{24,}\b/i,
    /\bBearer\b|serviceToken|uploadToken|client credentials/i,
  ]) {
    assert.doesNotMatch(text, pattern);
  }

  assert.doesNotMatch(
    text,
    /guaranteed|guarantees|single[- ]use|signed URL|secure URL|encrypted session/i,
  );
  assert.doesNotMatch(
    text,
    /automatically (?:becomes?|transitions?|moves?)[\s\S]{0,50}(?:ready|accepted|satisfied)/i,
  );
  assert.doesNotMatch(
    text,
    /(?:will|always) (?:become|transition to|reach)[\s\S]{0,50}(?:ready|accepted|satisfied)/i,
  );
  assert.doesNotMatch(text, /retry every|retry after|exponential backoff|fixed backoff/i);
  assert.doesNotMatch(text, /expires? in \d|time[- ]to[- ]live/i);
  assert.match(text, /conditional|depends on the current|current resource/i);
  assert.match(text, /do not (?:copy|reuse|assume)[\s\S]{0,160}(?:payload|answer|task|revision)/i);
});

test("uses root-relative internal links without file extensions", () => {
  for (const page of PAGES) {
    const text = requiredPage(page);
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const href = match[1];
      if (/^(?:https?:|mailto:|#)/.test(href)) continue;
      assert.match(href, /^\//, `${pageFile(page)} has a non-root-relative link ${href}`);
      assert.doesNotMatch(href, /\.mdx?(?:$|[?#])/i);
    }
  }
});
