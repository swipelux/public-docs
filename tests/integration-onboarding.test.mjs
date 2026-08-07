import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import { assertPages, readPage } from "./helpers/content.mjs";
import { createOpenApiValidator } from "./helpers/openapi-validation.mjs";

const PAGES = [
  "integration/onboarding/customers",
  "integration/onboarding/capabilities-and-requirements",
];

const PATH_VARIABLES = new Map([
  ["CUSTOMER_ID", "customerId"],
  ["CAPABILITY_ID", "capabilityId"],
  ["TASK_ID", "taskId"],
  ["RELATED_PARTY_ID", "relatedPartyId"],
  ["DOCUMENT_ID", "documentId"],
]);

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

function responseDataSchema(method, path, status = "200") {
  const { operation } = openApiOperation(method, path);
  const response = resolveReference(operation.responses?.[status]);
  assert.ok(response, `Missing ${status} response for ${method.toUpperCase()} ${path}`);
  const envelope = resolveReference(response.content?.["application/json"]?.schema);
  assert.ok(envelope?.properties?.data, `Missing data envelope for ${method.toUpperCase()} ${path}`);
  return resolveReference(envelope.properties.data);
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
    (match) => ({ method: match[1].toLowerCase(), path: match[2], href: match[3] }),
  );
}

function assertOperationLinksMatchOpenApi(page, text) {
  const links = operationLinks(text);
  assert.ok(links.length > 0, `${page}.mdx must link API operations`);

  for (const { method, path, href } of links) {
    const { operation } = openApiOperation(method, path);
    assert.equal(coverageOperation(method, path).href, href);
    const security = operation.security ?? openapi.security ?? [];
    assert.ok(
      security.some((requirement) => Object.hasOwn(requirement, "apiKey")),
      `${method.toUpperCase()} ${path} must use apiKey security`,
    );
  }

  for (const match of text.matchAll(/\[[^\]]+\]\((\/api-reference\/[^)]+)\)/g)) {
    assert.ok(
      links.some(({ href }) => href === match[1]),
      `${page}.mdx must label ${match[1]} with its method and path`,
    );
  }
}

function headingIndex(text, heading) {
  const index = text.indexOf(`## ${heading}`);
  assert.notEqual(index, -1, `Missing section: ${heading}`);
  return index;
}

function assertHeadingOrder(text, headings) {
  const indexes = headings.map((heading) => headingIndex(text, heading));
  assert.deepEqual(indexes, indexes.toSorted((left, right) => left - right));
}

function bashBlocks(text) {
  return [...text.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => match[1]);
}

function normalizePath(url) {
  let path = url.replace(/^\$\{API_BASE\}/, "");
  for (const [variable, parameter] of PATH_VARIABLES) {
    path = path.replaceAll(`\${${variable}}`, `{${parameter}}`);
  }
  return path;
}

function parseJsonBody(block) {
  const heredoc = block.match(/--data\s+@-\s+<<'?JSON'?\n([\s\S]*?)\nJSON(?:\n|$)/);
  if (heredoc) return JSON.parse(heredoc[1]);
  const quoted = block.match(/--data\s+'([^']*)'/);
  return quoted ? JSON.parse(quoted[1]) : undefined;
}

function parseCurl(block, label) {
  const method = block.match(/--request\s+([A-Z]+)/i)?.[1]?.toLowerCase();
  assert.ok(method, `${label} must declare a method`);
  const url = block.match(/["'](\$\{API_BASE\}\/v3\/[^"']+)["']/)?.[1];
  assert.ok(url, `${label} must use API_BASE`);

  return {
    method,
    path: normalizePath(url),
    headers: [...block.matchAll(/--header\s+["']([^"']+)["']/g)].map(
      (match) => match[1],
    ),
    forms: [...block.matchAll(/--form\s+["']([^"']+)["']/g)].map(
      (match) => match[1],
    ),
    body: parseJsonBody(block),
  };
}

function headerValues(example, name) {
  return example.headers
    .filter((header) => header.slice(0, header.indexOf(":")) === name)
    .map((header) => header.slice(header.indexOf(":") + 1).trim());
}

function assertCurlMatchesOpenApi(example, label) {
  const { method, path } = example;
  openApiOperation(method, path);
  assert.deepEqual(headerValues(example, "X-API-Key"), ["${SWIPELUX_API_KEY}"]);

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
    assert.equal(example.body, undefined, `${label} must not send JSON`);
    return;
  }

  const json = body.content?.["application/json"];
  const multipart = body.content?.["multipart/form-data"];
  if (json) {
    assert.notEqual(example.body, undefined, `${label} must send JSON`);
    assert.deepEqual(headerValues(example, "Content-Type"), ["application/json"]);
    const validation = openApiValidator.validateRequestBody(method, path, example.body);
    assert.equal(
      validation.valid,
      true,
      `${label} must match OpenAPI: ${JSON.stringify(validation.errors)}`,
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
    .filter((block) => /(^|\n)curl\s/.test(block))
    .map((block, index) => parseCurl(block, `${page}.mdx curl ${index + 1}`));
}

function examplesFor(examples, method, path) {
  return examples.filter((example) => example.method === method && example.path === path);
}

function containsBody(examples, expected) {
  return examples.some(({ body }) => isDeepStrictEqual(body, expected));
}

test("publishes the customer and capability onboarding pages", () => {
  assertPages(PAGES);
});

test("every onboarding operation link, security scheme, and request remains contract-backed", () => {
  assert.deepEqual(
    openapi.components.securitySchemes.apiKey,
    {
      type: "apiKey",
      in: "header",
      name: "X-API-Key",
      description: openapi.components.securitySchemes.apiKey.description,
    },
  );

  for (const page of PAGES) {
    const text = readPage(page);
    assertOperationLinksMatchOpenApi(page, text);
    for (const [index, example] of curlExamples(page, text).entries()) {
      assertCurlMatchesOpenApi(example, `${page}.mdx curl ${index + 1}`);
    }
  }
});

test("customers starts from the intended outcome and stores caller mappings", () => {
  const text = readPage("integration/onboarding/customers");
  const intro = text.slice(text.indexOf("---", 3) + 3, text.indexOf("## "));
  assert.match(intro, /pay-in|payout|issued bank account/i);
  assert.match(
    intro,
    /capabilit[^.]*account[^.]*transfer[^.]*scoped[^.]*customer|scoped[^.]*customer[^.]*capabilit[^.]*account[^.]*transfer/i,
  );
  assertHeadingOrder(text, [
    "Individual customers",
    "Business customers",
    "Add business related parties",
    "Read readiness from capabilities",
  ]);
  assert.match(text, /`externalId`[^.]*stable mapping|stable mapping[^.]*`externalId`/i);
  assert.match(text, /CUSTOMER_ID/);
  assert.match(text, /RELATED_PARTY_ID/);
  assert.match(text, /\/knowledge-base\/individual-onboarding\/overview/);
  assert.match(text, /\/knowledge-base\/business-onboarding\/overview/);
  assert.match(text, /\/integration\/onboarding\/capabilities-and-requirements/);

  const examples = curlExamples("integration/onboarding/customers", text);
  const customers = examplesFor(examples, "post", "/v3/customers");
  assert.equal(
    containsBody(customers, {
      type: "individual",
      externalId: "user_123",
      individual: {
        firstName: "Amina",
        lastName: "Diallo",
        residenceCountry: "FR",
      },
    }),
    true,
  );
  assert.equal(
    containsBody(customers, {
      type: "business",
      externalId: "company_456",
      business: { legalName: "Acme Payments SAS" },
    }),
    true,
  );
  assert.equal(
    containsBody(
      examplesFor(examples, "post", "/v3/customers/{customerId}/related-parties"),
      {
        partyType: "person",
        roles: ["director"],
        title: "Chief executive officer",
        person: {
          firstName: "Amina",
          lastName: "Diallo",
          residenceCountry: "FR",
        },
      },
    ),
    true,
  );
  assert.equal(examplesFor(examples, "get", "/v3/customers/{customerId}").length, 1);
});

test("capability onboarding follows discovery, request, requirements, and readiness", () => {
  const text = readPage("integration/onboarding/capabilities-and-requirements");
  assertHeadingOrder(text, [
    "Discover supported capabilities",
    "Request the capability",
    "Complete current tasks",
    "Continue when the capability is ready",
  ]);

  const supported = text.indexOf("`GET /v3/customers/{customerId}/capabilities/supported`");
  const request = text.indexOf("`POST /v3/customers/{customerId}/capabilities/{capabilityId}`");
  assert.ok(supported >= 0 && supported < request);

  for (const field of [
    "`availability`",
    "`eligibility.eligible`",
    "`directions`",
    "`method`",
    "`accountType`",
    "`institutions`",
  ]) {
    assert.ok(text.includes(field), `Missing capability decision field ${field}`);
  }
  assert.match(text, /--data '\{\}'/i);
  assert.match(text, /IDs returned by the supported-capability response/i);
  assert.match(text, /CAPABILITY_STATUS|`status`/);
  assert.match(text, /OPEN_TASK_IDS|`openTaskIds`/);
  assert.match(text, /APPLICATION_IDS|`applications\[\]\.id`/);
  assert.match(text, /verificationSessions[\s\S]{0,80}tosSessions/);
  assert.match(text, /session `id`[\s\S]{0,80}(?:current )?`url`/i);

  const uploadIndex = text.indexOf("### Upload documents");
  const submitIndex = text.indexOf("### API answers");
  assert.ok(uploadIndex < submitIndex);
  assert.match(
    text,
    /Store the returned `data\.id` as `DOCUMENT_ID` before submitting/i,
  );
  assert.match(text, /latest `data\.revision`|current revision/i);
  assert.match(text, /requirement ID[^.]*latest task/i);
  assert.match(text, /answer type[^.]*latest task/i);
  assert.match(text, /refetch|read the capability again/i);
  assert.match(text, /continue only when[^.]*current capability status/i);
  assert.doesNotMatch(text, /\]\(\/api-reference\)/);
  assert.doesNotMatch(text, /\/v3\/sandbox\/customers\/\{customerId\}\/verification/);
});

test("capability request, document upload, and text submission examples validate", () => {
  const text = readPage("integration/onboarding/capabilities-and-requirements");
  const examples = curlExamples("integration/onboarding/capabilities-and-requirements", text);

  const requests = examplesFor(
    examples,
    "post",
    "/v3/customers/{customerId}/capabilities/{capabilityId}",
  );
  assert.ok(containsBody(requests, {}), "Capability request must show the default empty body");

  const uploads = examplesFor(examples, "post", "/v3/customers/{customerId}/documents");
  assert.equal(uploads.length, 1);
  assert.ok(uploads[0].forms.some((form) => form.startsWith("file=@${DOCUMENT_PATH}")));

  const expectedSubmission = {
    taskRevision: 3,
    answers: [
      {
        requirementId: "req_from_current_task",
        answer: { type: "text", value: "Current answer" },
      },
    ],
  };
  assert.equal(
    containsBody(
      examplesFor(
        examples,
        "post",
        "/v3/customers/{customerId}/tasks/{taskId}/submissions",
      ),
      expectedSubmission,
    ),
    true,
  );

  assert.equal(
    openApiValidator.validateRequestBody(
      "post",
      "/v3/customers/{customerId}/tasks/{taskId}/submissions",
      expectedSubmission,
    ).valid,
    true,
  );
});

test("selection and hosted-session guidance names only response fields defined by OpenAPI", () => {
  const supported = responseDataSchema(
    "get",
    "/v3/customers/{customerId}/capabilities/supported",
  );
  const supportedItem = resolveReference(supported.items);
  const expectedRequired = [
    "id",
    "method",
    "accountType",
    "directions",
    "availability",
    "eligibility",
    "institutions",
  ];
  assert.equal(new Set(supportedItem.required).size, supportedItem.required.length);
  assert.deepEqual(
    new Set(supportedItem.required),
    new Set(expectedRequired),
    "Supported-capability required fields must match as a set",
  );

  const capability = responseDataSchema(
    "get",
    "/v3/customers/{customerId}/capabilities/{capabilityId}",
  );
  const capabilityVariants = capability.anyOf ?? capability.oneOf;
  assert.ok(capabilityVariants.length >= 1);
  for (const rawVariant of capabilityVariants) {
    const variant = resolveReference(rawVariant);
    for (const field of ["status", "openTaskIds", "applications"]) {
      assert.ok(variant.properties?.[field], `Capability response must define ${field}`);
    }
    const application = resolveReference(variant.properties.applications.items);
    assert.ok(application.properties.id);
  }

  const task = responseDataSchema("get", "/v3/customers/{customerId}/tasks/{taskId}");
  for (const field of ["revision", "requirements", "verificationSessions", "tosSessions"]) {
    assert.ok(task.properties?.[field], `Task detail must define ${field}`);
  }
  for (const collection of ["verificationSessions", "tosSessions"]) {
    const session = resolveReference(task.properties[collection].items);
    assert.ok(session.properties.id);
    assert.ok(session.properties.url);
  }
});

test("onboarding pages keep public-only language and root-relative links", () => {
  const text = PAGES.map((page) => readPage(page)).join("\n");
  assert.doesNotMatch(
    text,
    /openapi-coverage\.json|openapi-provenance\.json|x-mint|source precedence|provider orchestration|internal review|migration mechanics/i,
  );
  assert.doesNotMatch(text, /\bv1\b|\bv2\b|Bearer |serviceToken|uploadToken/i);
  assert.doesNotMatch(text, /guaranteed|guarantees|immediately ready|universally available/i);
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
