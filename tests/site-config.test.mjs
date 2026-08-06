import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { docsConfigSchema } from "@mintlify/validation";

import {
  REQUIRED_NAVIGATION_PAGES,
  collectNavigationPages,
  parseFrontmatter,
  validateFrontmatter,
  validatePublishedJsonStrings,
  validatePublishedText,
} from "../scripts/lib/docs-validation.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(projectRoot, path), "utf8");
const config = JSON.parse(read("docs.json"));
const indexText = read("index.mdx");
const redirectInventory = JSON.parse(read("docs/redirect-inventory.json"));
const coverage = JSON.parse(read("openapi-coverage.json"));

const INTEGRATION_GROUPS = [
  {
    group: "Get started",
    pages: [
      "integration/overview",
      "integration/quickstart",
      "integration/authentication",
      "integration/sandbox",
    ],
  },
  {
    group: "Onboard",
    pages: [
      "integration/onboarding/customers",
      "integration/onboarding/capabilities-and-requirements",
    ],
  },
  {
    group: "Build money flows",
    pages: [
      "integration/common-flows",
      "integration/accounts",
      "integration/issue-bank-account",
      "integration/recipients",
      "integration/receive-funds",
      "integration/send-funds",
      "integration/quotes-and-transfers",
      "integration/rules",
    ],
  },
  {
    group: "Operate",
    pages: [
      "integration/webhooks",
      "integration/api-reliability",
      "integration/sync-and-reconciliation",
      "integration/production-readiness",
    ],
  },
  {
    group: "Resources",
    pages: ["integration/starter-kit"],
  },
];

const NEW_CANONICAL_PAGE_TITLES = {
  "integration/common-flows": "Common flows",
  "integration/issue-bank-account": "Issue a bank account",
  "integration/api-reliability": "API reliability",
  "integration/sync-and-reconciliation": "Sync and reconciliation",
  "integration/onboarding/customers": "Customers",
  "integration/onboarding/capabilities-and-requirements":
    "Capabilities and requirements",
};

const RETIRED_INTEGRATION_PAGES = [
  "integration/environments.mdx",
  "integration/errors.mdx",
  "integration/pagination-and-sync.mdx",
  "integration/request-safety.mdx",
  "integration/using-the-api-reference.mdx",
  "integration/onboarding/individuals.mdx",
  "integration/onboarding/businesses.mdx",
  "integration/onboarding/tasks-and-submissions.mdx",
  "integration/onboarding/documents.mdx",
];

const STRUCTURE_REDIRECTS = {
  "/integration/environments":
    "/integration/authentication#sandbox-and-production",
  "/integration/errors": "/integration/api-reliability#handle-errors",
  "/integration/pagination-and-sync":
    "/integration/sync-and-reconciliation",
  "/integration/request-safety": "/integration/api-reliability",
  "/integration/using-the-api-reference":
    "/api-reference/customers/post-v3-customers",
  "/integration/onboarding/individuals":
    "/integration/onboarding/customers#individual-customers",
  "/integration/onboarding/businesses":
    "/integration/onboarding/customers#business-customers",
  "/integration/onboarding/tasks-and-submissions":
    "/integration/onboarding/capabilities-and-requirements#complete-requirements",
  "/integration/onboarding/documents":
    "/integration/onboarding/capabilities-and-requirements#upload-documents",
};

const PUBLIC_GUIDE_WRITING = `## Public guide writing

- Lead with the developer outcome, then introduce API resources.
- Give each Integration page one primary job and one happy path.
- Keep complete schemas, enums, status catalogs, and error catalogs in API Reference.
- Do not expose documentation-generation files, source precedence, migration notes, provider names, or internal review language.
- State shared rules once and link to their canonical guide instead of repeating boilerplate.
- End workflow pages with the next developer action.`;

const KNOWLEDGE_BASE_GROUPS = [
  {
    group: "Compliance",
    pages: [
      "knowledge-base/compliance/overview",
      "knowledge-base/compliance/regulatory-perimeter",
      "knowledge-base/compliance/supported-business-models",
      "knowledge-base/compliance/jurisdictions-and-availability",
      "knowledge-base/compliance/transaction-limits",
      "knowledge-base/compliance/custody-and-wallet-controls",
      "knowledge-base/compliance/payment-methods",
      "knowledge-base/compliance/travel-rule",
      "knowledge-base/compliance/screening-and-monitoring",
      "knowledge-base/compliance/governance-retention-and-privacy",
    ],
  },
  {
    group: "Business onboarding",
    pages: [
      "knowledge-base/business-onboarding/overview",
      "knowledge-base/business-onboarding/entity-and-business-types",
      "knowledge-base/business-onboarding/document-requirements",
      "knowledge-base/business-onboarding/shareholders-ubos-and-control-persons",
      "knowledge-base/business-onboarding/kyb-workflow",
      "knowledge-base/business-onboarding/faq",
    ],
  },
  {
    group: "Individual onboarding",
    pages: [
      "knowledge-base/individual-onboarding/overview",
      "knowledge-base/individual-onboarding/verification-levels",
      "knowledge-base/individual-onboarding/status-and-workflow",
      "knowledge-base/individual-onboarding/api-workflow",
    ],
  },
];

const EXPECTED_NAVIGATION = {
  tabs: [
    {
      tab: "Integration Docs",
      groups: INTEGRATION_GROUPS,
    },
    {
      tab: "API Reference",
      openapi: "openapi.json",
    },
    {
      tab: "Knowledge Base",
      groups: KNOWLEDGE_BASE_GROUPS,
    },
  ],
};

const APPROVED_SYMBOL =
  '<svg xmlns="http://www.w3.org/2000/svg" width="65" height="64" fill="none"><path fill="#F4663E" d="M2.938 34.102a2.97 2.97 0 0 1 0-4.204L18.2 14.655a2.98 2.98 0 0 1 4.21 0l15.262 15.243a2.97 2.97 0 0 1 0 4.204L22.411 49.345a2.98 2.98 0 0 1-4.21 0L2.937 34.102Z"/><path fill="#FA9B51" d="M27.897 44.922a1.486 1.486 0 0 0 0 2.103l2.323 2.32a2.98 2.98 0 0 0 4.21 0l15.262-15.243a2.97 2.97 0 0 0 0-4.204L34.43 14.655a2.98 2.98 0 0 0-4.21 0l-2.323 2.32a1.485 1.485 0 0 0 0 2.103l10.834 10.82a2.97 2.97 0 0 1 0 4.204l-10.834 10.82Z"/><path fill="#FFDA99" d="M39.909 44.923a1.485 1.485 0 0 0 0 2.102l2.323 2.32a2.98 2.98 0 0 0 4.21 0l15.262-15.243a2.97 2.97 0 0 0 0-4.204L46.442 14.655a2.98 2.98 0 0 0-4.21 0l-2.323 2.32a1.485 1.485 0 0 0 0 2.102l10.834 10.82a2.97 2.97 0 0 1 0 4.205l-10.834 10.82Z"/></svg>';
const LIGHT_DOCS_BACKGROUND = "#FFFFFF";

function relativeLuminance(hex) {
  assert.match(hex, /^#[A-F0-9]{6}$/i, `${hex} must be a six-digit hex color`);
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  );
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const luminances = [
    relativeLuminance(foreground),
    relativeLuminance(background),
  ].sort((left, right) => right - left);
  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

function findObjects(value, predicate, matches = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => findObjects(item, predicate, matches));
    return matches;
  }
  if (!value || typeof value !== "object") return matches;
  if (predicate(value)) matches.push(value);
  Object.values(value).forEach((item) =>
    findObjects(item, predicate, matches),
  );
  return matches;
}

function attribute(openingTag, name) {
  return new RegExp(`\\b${name}="([^"]+)"`).exec(openingTag)?.[1];
}

function normalizeKnownDocsConfigDefaults(value) {
  const normalized = structuredClone(value);
  if (
    normalized.contextual &&
    normalized.contextual.display === undefined
  ) {
    normalized.contextual.display = "header";
  }
  return normalized;
}

function assertDocsConfigRoundTrips(value) {
  const result = docsConfigSchema.safeParse(value);
  assert.equal(
    result.success,
    true,
    result.success ? undefined : JSON.stringify(result.error.issues, null, 2),
  );
  assert.deepEqual(
    result.data,
    normalizeKnownDocsConfigDefaults(value),
    "docsConfigSchema must preserve every configured property",
  );
}

test("uses the approved Swipelux identity and site controls", () => {
  assert.equal(config.name, "Swipelux");
  assert.equal(config.favicon, "/favicon.svg");
  assert.deepEqual(config.logo, {
    light: "/logo/light.svg",
    dark: "/logo/dark.svg",
  });
  assert.deepEqual(config.colors, {
    primary: "#B8381D",
    light: "#FA9B51",
    dark: "#E2471D",
  });
  assert.deepEqual(config.api?.playground, { display: "none" });
  assert.deepEqual(config.contextual, { options: ["copy", "view"] });
});

test("uses an accessible primary docs UI color on the light background", () => {
  const ratio = contrastRatio(config.colors.primary, LIGHT_DOCS_BACKGROUND);
  assert.ok(
    ratio >= 4.5,
    `${config.colors.primary} has ${ratio.toFixed(2)}:1 contrast against ${LIGHT_DOCS_BACKGROUND}; expected at least 4.5:1`,
  );
});

test("uses exactly the approved three-tab navigation skeleton", () => {
  assert.deepEqual(config.navigation, EXPECTED_NAVIGATION);
  assert.deepEqual(
    config.navigation.tabs.map(({ tab }) => tab),
    ["Integration Docs", "API Reference", "Knowledge Base"],
  );

  const manualPages = [
    ...INTEGRATION_GROUPS.flatMap(({ pages }) => pages),
    ...KNOWLEDGE_BASE_GROUPS.flatMap(({ pages }) => pages),
  ];
  assert.deepEqual(manualPages, REQUIRED_NAVIGATION_PAGES);
  assert.deepEqual(collectNavigationPages(config.navigation), manualPages);
});

test("publishes the new canonical Integration pages and removes retired files", () => {
  for (const [page, expectedTitle] of Object.entries(NEW_CANONICAL_PAGE_TITLES)) {
    const path = `${page}.mdx`;
    assert.equal(existsSync(resolve(projectRoot, path)), true, `${path} must exist`);
    const text = read(path);
    assert.deepEqual(validateFrontmatter(path, text), []);
    assert.deepEqual(validatePublishedText(path, text), []);

    const { attributes } = parseFrontmatter(text);
    assert.equal(attributes.title, expectedTitle);
  }

  for (const path of RETIRED_INTEGRATION_PAGES) {
    assert.equal(
      existsSync(resolve(projectRoot, path)),
      false,
      `${path} must be removed after its redirect is encoded`,
    );
  }
});

test("keeps the paired public guide writing rules identical", () => {
  for (const path of ["AGENTS.md", "CLAUDE.md"]) {
    assert.ok(
      read(path).includes(PUBLIC_GUIDE_WRITING),
      `${path} must contain the approved Public guide writing section`,
    );
  }
});

test("makes API Reference the sole owner of openapi.json", () => {
  const owners = findObjects(config.navigation, (value) =>
    Object.hasOwn(value, "openapi"),
  );

  assert.equal(owners.length, 1);
  assert.strictEqual(owners[0], config.navigation.tabs[1]);
  assert.deepEqual(owners[0], {
    tab: "API Reference",
    openapi: "openapi.json",
  });
});

test("copies the exact approved redirect pairs without internal metadata", () => {
  assert.equal(redirectInventory.length, 62);
  assert.deepEqual(
    config.redirects,
    redirectInventory.map(({ source, destination }) => ({
      source,
      destination,
    })),
  );
  assert.ok(
    config.redirects.every(
      ({ source, destination }) =>
        !source.startsWith("/t-c") && !destination.startsWith("/t-c"),
    ),
  );
  for (const redirect of config.redirects) {
    assert.deepEqual(Object.keys(redirect).sort(), ["destination", "source"]);
  }

  const destinations = new Map(
    redirectInventory.map(({ source, destination }) => [source, destination]),
  );
  for (const [source, destination] of Object.entries(STRUCTURE_REDIRECTS)) {
    assert.equal(destinations.get(source), destination);
  }
});

test("links only to the verified public company and support destinations", () => {
  assert.deepEqual(config.navbar, {
    links: [
      { label: "Company", href: "https://www.swipelux.com" },
      { label: "Support", href: "mailto:support@swipelux.com" },
    ],
  });
  assert.equal(config.navbar.primary, undefined);
  assert.equal(config.footer, undefined);
  assert.equal(config.navigation.global, undefined);
});

test("removes starter configuration, links, profiles, and page names", () => {
  const publishableConfig = structuredClone(config);
  delete publishableConfig.$schema;
  const searchable = `${JSON.stringify(publishableConfig)}\n${indexText}`;

  for (const pattern of [
    /Mintlify Starter Kit/i,
    /mintlify\.com/i,
    /hi@mintlify\.com/i,
    /app\.mintlify\.com/i,
    /x\.com\/mintlify/i,
    /github\.com\/mintlify/i,
    /linkedin\.com\/company\/mintlify/i,
    /Welcome to your project/i,
    /Ready to make this your own\?/i,
    /Write a short description of your product here/i,
    /<Card[^>]+title="(?:Quickstart|Components|Settings)"/i,
    /href="\/quickstart"/i,
    /\bDashboard\b/i,
  ]) {
    assert.doesNotMatch(searchable, pattern);
  }

  assert.ok(!collectNavigationPages(config.navigation).includes("index"));
  assert.ok(!collectNavigationPages(config.navigation).includes("quickstart"));
  assert.deepEqual(validatePublishedJsonStrings("docs.json", config), []);
});

test("removes the starter quickstart page", () => {
  assert.equal(existsSync(resolve(projectRoot, "quickstart.mdx")), false);
});

test("uses the same approved three-path symbol for every brand asset", () => {
  for (const path of ["favicon.svg", "logo/light.svg", "logo/dark.svg"]) {
    const svg = read(path).trim();
    assert.equal(svg, APPROVED_SYMBOL, `${path} must match the approved symbol`);
    assert.equal((svg.match(/<path\b/g) ?? []).length, 3);
    assert.deepEqual(
      [...svg.matchAll(/\bfill="(#[A-F0-9]{6})"/g)].map((match) => match[1]),
      ["#F4663E", "#FA9B51", "#FFDA99"],
    );
    assert.doesNotMatch(svg, /Mintlify|Starter Kit|<text\b/i);
  }
});

test("keeps the landing page valid and within published-content guards", () => {
  assert.deepEqual(validateFrontmatter("index.mdx", indexText), []);
  assert.deepEqual(validatePublishedText("index.mdx", indexText), []);

  const { attributes } = parseFrontmatter(indexText);
  assert.match(attributes.title, /Swipelux/i);
  assert.ok(attributes.description.length <= 160);
});

test("links three native cards to the approved documentation sections", () => {
  const capabilitiesOperation = coverage.operations.find(
    ({ method, path }) =>
      method === "get" && path === "/v3/capabilities",
  );
  assert.ok(
    capabilitiesOperation,
    "openapi coverage must include GET /v3/capabilities",
  );

  const { body } = parseFrontmatter(indexText);
  const columns = /<Columns\s+cols=\{3\}>([\s\S]*?)<\/Columns>/.exec(body);
  assert.ok(columns, "index.mdx must contain one three-column Columns layout");
  assert.equal((body.match(/<Columns\b/g) ?? []).length, 1);

  const cardTags = [...columns[1].matchAll(/<Card\b[^>]*>/g)].map(
    ([openingTag]) => openingTag,
  );
  assert.equal(cardTags.length, 3);
  assert.equal((body.match(/<Card\b/g) ?? []).length, 3);
  assert.deepEqual(
    cardTags.map((tag) => attribute(tag, "title")),
    ["Integration Docs", "API Reference", "Knowledge Base"],
  );
  const cardHrefs = cardTags.map((tag) => attribute(tag, "href"));
  assert.deepEqual(cardHrefs, [
    "/integration/overview",
    capabilitiesOperation.href,
    "/knowledge-base/compliance/overview",
  ]);
  assert.equal(cardHrefs[1], capabilitiesOperation.href);
  assert.doesNotMatch(body, /^import\s/m);
});

test("keeps landing copy concise and separates guides, reference, and knowledge", () => {
  const { body } = parseFrontmatter(indexText);
  const prose = body
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  assert.ok(prose.split(/\s+/).length <= 110, "landing copy is too long");
  assert.match(prose, /guides/i);
  assert.match(prose, /generated API reference/i);
  assert.match(prose, /policy/i);
  assert.match(prose, /onboarding/i);
  assert.doesNotMatch(
    prose,
    /powerful|seamless|robust|cutting-edge|revolutionary|best-in-class/i,
  );
  assert.doesNotMatch(
    body,
    /```|<ParamField\b|<ResponseField\b|<RequestExample\b|<ResponseExample\b/i,
  );
});

test("conforms to the pinned Mintlify docs.json schema", () => {
  assertDocsConfigRoundTrips(config);
});

test("rejects unknown docs.json properties stripped by the schema", () => {
  const mutations = [
    [
      "misspelled root property",
      (value) => {
        value.colours = value.colors;
      },
    ],
    [
      "misspelled nested property",
      (value) => {
        value.contextual.dispay = "toc";
      },
    ],
  ];

  for (const [message, mutate] of mutations) {
    const mutatedConfig = structuredClone(config);
    mutate(mutatedConfig);
    assert.throws(
      () => assertDocsConfigRoundTrips(mutatedConfig),
      /docsConfigSchema must preserve every configured property/,
      message,
    );
  }
});
