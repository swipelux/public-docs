import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import { assertPages, readPage } from "./helpers/content.mjs";
import { createOpenApiValidator } from "./helpers/openapi-validation.mjs";

const PAGES = [
  "integration/overview",
  "integration/quickstart",
  "integration/authentication",
  "integration/sandbox",
];

const STARTER_PAGE = "integration/starter-kit";

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

function proseSentences(text) {
  return text
    .split(/(?<=[.!?])(?:[ \t]+|\n+)|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function affirmingSentence(sentences, pattern, message) {
  const sentence = sentences.find((candidate) => pattern.test(candidate));
  assert.ok(sentence, message);
  return sentence;
}

function assertStarterCredentialPolarity(text) {
  assert.doesNotMatch(
    text,
    /https:\/\/neobank-starter\.vercel\.app/i,
    "Starter kit must not invite developers into the externally hosted credential form",
  );

  const paragraphs = text.split(/\n\s*\n/);
  const sentences = proseSentences(text);
  const hostedWarning = paragraphs.find((paragraph) => /hosted/i.test(paragraph));
  assert.ok(hostedWarning, "Hosted starter needs a credential warning");
  assert.match(
    hostedWarning,
    /(?:do not|never)[^.]{0,80}(?:choose|select|use)[^.]{0,40}`?Go live`?/i,
  );
  assert.match(
    hostedWarning,
    /(?:do not|must not|never)[^.]{0,100}(?:enter|expose|provide|supply|use)[^.]{0,60}(?:an? |any )?API key/i,
  );

  const browserDemo = paragraphs.find(
    (paragraph) =>
      /connected[- ]sandbox/i.test(paragraph) &&
      /sandbox key/i.test(paragraph) &&
      /browser/i.test(paragraph),
  );
  assert.ok(browserDemo, "Connected sandbox mode needs a browser credential warning");
  assert.match(
    browserDemo,
    /(?:local[^.]{0,80}browser|browser[^.]{0,80}(?:local|your (?:computer|machine)))/i,
  );
  const browserCode = String.raw`(?:browser\s+(?:code|runtime(?:\s+code)?)|client-side\s+code)`;
  const browserCredentialSentences = sentences.filter(
    (sentence) =>
      /sandbox key/i.test(sentence) && new RegExp(browserCode, "i").test(sentence),
  );
  assert.doesNotMatch(
    browserCredentialSentences.join("\n"),
    new RegExp(
      String.raw`(?:\bnever\b|\b(?:do|does|did|is|are|was|were|can|could|will|would|should|must)(?:n't|\s+not)\b)[^.!?\n]{0,40}\bexpos(?:e|es|ed|ing)\b|\b${browserCode}\b[^.!?\n]{0,40}\b(?:cannot|can't|(?:does?|did|can|could|will|would|should|must)(?:n't|\s+not))\s+(?:access|have\s+access\s+to)\s+(?:(?:the\s+)?sandbox key|it)\b`,
      "i",
    ),
    "Connected sandbox must affirmatively expose its sandbox key to browser code",
  );
  affirmingSentence(
    sentences,
    new RegExp(
      String.raw`(?:\bexpos(?:e|es|ed|ing)\b[^.!?\n]{0,80}\bsandbox key\b[^.!?\n]{0,40}\bto\s+${browserCode}\b|\bsandbox key\b[^.!?\n]{0,40}\b(?:is\s+)?exposed\b[^.!?\n]{0,40}\bto\s+${browserCode}\b|\b${browserCode}\b[^.!?\n]{0,40}\b(?:has|have)\s+access\s+to\s+(?:the\s+)?sandbox key\b|\bsandbox key\b[^.!?\n]{0,80}\b${browserCode}\b[^.!?\n]{0,40}\b(?:has|have)\s+access\s+to\s+it\b)`,
      "i",
    ),
    "Connected sandbox must affirmatively expose its sandbox key to browser code",
  );
  assert.match(browserDemo, /(?:must not|never)[^.]{0,80}share/i);
  assert.match(browserDemo, /(?:must not|never)[^.]{0,80}deploy/i);
  assert.match(
    browserDemo,
    /(?:do not|must not|never)[^.]{0,100}(?:enter|expose|provide|supply|use)[^.]{0,60}(?:a )?production (?:API )?key/i,
  );
  assert.doesNotMatch(
    text,
    /(?:browser|connected[- ]sandbox)[^.]{0,160}(?:(?:can|may|safe to) (?:be )?(?:shared|deployed|used in production)|shareable|deployable|production[- ]safe|production[- ]ready)/i,
    "Browser mode must not be portrayed as shareable, deployable, or production-safe",
  );

  const backendScopeSentences = sentences.filter(
    (sentence) =>
      /shared sandbox environments?/i.test(sentence) &&
      /(?:all|every) production integrations?/i.test(sentence) &&
      /backend/i.test(sentence),
  );
  assert.doesNotMatch(
    backendScopeSentences.join("\n"),
    /(?:\bnever\b|\b(?:do|does|did|can|could|will|would|should|must)(?:n't|\s+not)\b)[^.!?\n]{0,40}\b(?:use|requir(?:e|es|ed|ing))\b[^.!?\n]{0,80}\b(?:a\s+)?backend\b|\b(?:a\s+)?backend\b[^.!?\n]{0,40}\b(?:is|are|was|were|will|would|should|must)(?:n't|\s+not)\s+required\b/i,
    "Shared sandbox and production integrations must affirmatively use or require a backend",
  );
  affirmingSentence(
    sentences,
    /(?:\b(?:use|uses|using)\s+(?:a\s+)?backend\s+for\s+shared sandbox environments?[^.!?\n]{0,40}\b(?:all|every)\s+production integrations?\b|\b(?:a\s+)?backend\b[^.!?\n]{0,30}\b(?:is|are)\s+(?:used|required)\s+for\s+shared sandbox environments?[^.!?\n]{0,40}\b(?:all|every)\s+production integrations?\b|\bshared sandbox environments?[^.!?\n]{0,40}\b(?:all|every)\s+production integrations?\b[^.!?\n]{0,40}\b(?:use|uses|require|requires)\s+(?:a\s+)?backend\b)/i,
    "Shared sandbox and production integrations must use a backend",
  );

  const secretManagerSentences = sentences.filter(
    (sentence) =>
      /(?:API keys?|credentials?)/i.test(sentence) &&
      /secret manager/i.test(sentence),
  );
  assert.doesNotMatch(
    secretManagerSentences.join("\n"),
    /(?:\bnever\b|\b(?:do|does|did|can|could|will|would|should|must)(?:n't|\s+not)\b)[^.!?\n]{0,40}\b(?:keep|manage|store)\b[^.!?\n]{0,100}\b(?:API keys?|credentials?)\b|\b(?:API keys?|credentials?)\b[^.!?\n]{0,80}\b(?:are|were|will|would|should|must)(?:n't|\s+not)\s+(?:kept|managed|stored)\b/i,
    "API keys or credentials must affirmatively be kept in a secret manager",
  );
  assert.doesNotMatch(
    secretManagerSentences.join("\n"),
    /\b(?:API keys?|credentials?)\b[^.!?\n]{0,80}\b(?:outside|not\s+(?:in|inside))\s+(?:a\s+)?secret manager\b/i,
    "API keys or credentials must be kept inside a secret manager",
  );
  affirmingSentence(
    sentences,
    /(?:\b(?:keep|manage|store)\b[^.!?\n]{0,60}\b(?:API keys?|credentials?)\b[^.!?\n]{0,40}\b(?:in|inside)\s+(?:a\s+)?secret manager\b|\b(?:API keys?|credentials?)\b[^.!?\n]{0,60}\b(?:are|must be|should be)\s+(?:kept|managed|stored)\b[^.!?\n]{0,40}\b(?:in|inside)\s+(?:a\s+)?secret manager\b)/i,
    "API keys or credentials must affirmatively be kept in a secret manager",
  );
}

test("starter credential guard enforces outcomes without preferred adjectives", () => {
  const safeAlternativeWording = `
The hosted starter displays built-in data only. Do not choose \`Go live\`, and never enter an API key there.

Connected sandbox mode runs in a browser on your local computer and exposes the sandbox key to browser runtime code. Never share or deploy this mode. Do not use a production key in connected sandbox mode.

A backend is required for shared sandbox environments and all production integrations. Store API keys in a secret manager.
`;
  const missingProductionKeyProhibition = safeAlternativeWording.replace(
    "Do not use a production key in connected sandbox mode.",
    "",
  );
  const browserAccessSafeWording = safeAlternativeWording.replace(
    "Connected sandbox mode runs in a browser on your local computer and exposes the sandbox key to browser runtime code.",
    "Connected sandbox mode runs in a browser on your local computer. The sandbox key stays in the browser runtime, and browser runtime code has access to it.",
  );
  const negatedBrowserExposure = safeAlternativeWording.replace(
    "exposes the sandbox key to browser runtime code",
    "does not expose the sandbox key to browser runtime code",
  );
  const negatedBackendRequirement = safeAlternativeWording.replace(
    "A backend is required for shared sandbox environments and all production integrations.",
    "Do not use a backend for shared sandbox environments and all production integrations.",
  );
  const negatedSecretManagerStorage = safeAlternativeWording.replace(
    "Store API keys in a secret manager.",
    "Do not store API keys in a secret manager.",
  );
  const outsideSecretManagerStorage = safeAlternativeWording.replace(
    "Store API keys in a secret manager.",
    "Store API keys outside a secret manager.",
  );
  const serverOnlyBrowserExposure = safeAlternativeWording.replace(
    "Connected sandbox mode runs in a browser on your local computer and exposes the sandbox key to browser runtime code.",
    "Connected sandbox mode runs in a browser on your local computer. Connected sandbox mode exposes the sandbox key to server code; browser runtime code cannot access it.",
  );
  const unrelatedBackendGuidance = safeAlternativeWording.replace(
    "A backend is required for shared sandbox environments and all production integrations.",
    "Use a backend for local demos. Shared sandbox environments and all production integrations run directly in browser code.",
  );
  const hostedCardMutation = `${safeAlternativeWording}
<Card title="Open hosted starter" href={"https://neobank-starter.vercel.app"} />
`;
  assert.notEqual(missingProductionKeyProhibition, safeAlternativeWording);
  assert.notEqual(browserAccessSafeWording, safeAlternativeWording);
  assert.notEqual(negatedBrowserExposure, safeAlternativeWording);
  assert.notEqual(negatedBackendRequirement, safeAlternativeWording);
  assert.notEqual(negatedSecretManagerStorage, safeAlternativeWording);
  assert.notEqual(outsideSecretManagerStorage, safeAlternativeWording);
  assert.notEqual(serverOnlyBrowserExposure, safeAlternativeWording);
  assert.notEqual(unrelatedBackendGuidance, safeAlternativeWording);

  assert.doesNotThrow(() =>
    assertStarterCredentialPolarity(safeAlternativeWording),
  );
  assert.doesNotThrow(() =>
    assertStarterCredentialPolarity(browserAccessSafeWording),
  );
  assert.throws(
    () => assertStarterCredentialPolarity(missingProductionKeyProhibition),
    { name: "AssertionError" },
  );
  for (const invertedMutation of [
    negatedBrowserExposure,
    negatedBackendRequirement,
    negatedSecretManagerStorage,
    outsideSecretManagerStorage,
    serverOnlyBrowserExposure,
    unrelatedBackendGuidance,
  ]) {
    assert.throws(
      () => assertStarterCredentialPolarity(invertedMutation),
      { name: "AssertionError" },
    );
  }
  assert.throws(
    () => assertStarterCredentialPolarity(hostedCardMutation),
    { name: "AssertionError" },
  );
});

test("publishes the four Get started pages in the intended order", () => {
  assertPages(PAGES);
  const integration = config.navigation.tabs.find((tab) => tab.tab === "Integration Docs");
  assert.ok(integration, "Missing Integration Docs tab");
  const getStarted = integration.groups.find((group) => group.group === "Get started");
  assert.deepEqual(getStarted?.pages, PAGES);
});

test("publishes Starter kit as a focused resource outside Get started", () => {
  assertPages([STARTER_PAGE]);
  const integration = config.navigation.tabs.find((tab) => tab.tab === "Integration Docs");
  assert.ok(integration, "Missing Integration Docs tab");
  const getStarted = integration.groups.find((group) => group.group === "Get started");
  const resources = integration.groups.find((group) => group.group === "Resources");
  assert.equal(getStarted?.pages.includes(STARTER_PAGE), false);
  assert.deepEqual(resources?.pages, [STARTER_PAGE]);

  const text = readPage(STARTER_PAGE);
  assert.match(text, /(?:public )?(?:neobank )?starter[\s\S]{0,80}(?:shows|demonstrates)/i);
  assert.match(
    text,
    /git clone https:\/\/github\.com\/swipelux\/neobank-starter[\s\S]{0,120}cd neobank-starter[\s\S]{0,120}npm install[\s\S]{0,120}npm run dev/,
  );
  assert.match(text, /built-in (?:demo )?data/i);
  assert.match(text, /connected sandbox (?:data|mode)/i);
  assertStarterCredentialPolarity(text);
  assert.match(text, /\]\(\/integration\/quickstart\)/);
  assert.match(text, /\]\(\/integration\/authentication\)/);
  assert.doesNotMatch(
    text,
    /sandbox key (?:authorizes|enables|permits)[^.]{0,80}(?:real-money|production) use/i,
  );
  assert.ok((text.match(/\S+/g) ?? []).length <= 500);

  const tail = text.slice(-1200);
  assert.match(tail, /\/(?:integration\/quickstart|integration\/authentication)/);
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

test("overview leads with outcomes, the shared lifecycle, and core resources", () => {
  const text = readPage("integration/overview");
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
  ];
  const indexes = lifecycle.map((step) => text.indexOf(step));
  assert.ok(indexes.every((index) => index >= 0), "Overview is missing a lifecycle step");
  assert.deepEqual(indexes, indexes.toSorted((left, right) => left - right));

  const finalStep = text.match(/^6\. \*\*[^\n]+$/m)?.[0] ?? "";
  assert.match(finalStep, /money movement/i);
  assert.match(finalStep, /quote/i);
  assert.match(finalStep, /execute/i);
  assert.match(finalStep, /monitor/i);
  assert.match(
    finalStep,
    /issued bank account[\s\S]*create[\s\S]*monitor[\s\S]*provision/i,
  );

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
  assert.match(text, /\/api-reference/);
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
  assert.match(text, /sandbox (?:API )?key selects (?:the )?environment/i);
  assert.match(text, /without moving real funds|no real funds move/i);
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
