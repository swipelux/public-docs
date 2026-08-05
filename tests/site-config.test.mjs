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
    group: "Start",
    pages: [
      "integration/overview",
      "integration/quickstart",
      "integration/starter-kit",
      "integration/authentication",
      "integration/environments",
      "integration/using-the-api-reference",
      "integration/request-safety",
      "integration/errors",
      "integration/pagination-and-sync",
    ],
  },
  {
    group: "Onboarding",
    pages: [
      "integration/onboarding/individuals",
      "integration/onboarding/businesses",
      "integration/onboarding/tasks-and-submissions",
      "integration/onboarding/documents",
    ],
  },
  {
    group: "Accounts and money movement",
    pages: [
      "integration/accounts",
      "integration/recipients",
      "integration/quotes-and-transfers",
      "integration/receive-funds",
      "integration/send-funds",
      "integration/rules",
    ],
  },
  {
    group: "Events and launch",
    pages: [
      "integration/webhooks",
      "integration/sandbox",
      "integration/production-readiness",
    ],
  },
];

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

test("uses the approved Swipelux identity and site controls", () => {
  assert.equal(config.name, "Swipelux");
  assert.equal(config.favicon, "/favicon.svg");
  assert.deepEqual(config.logo, {
    light: "/logo/light.svg",
    dark: "/logo/dark.svg",
  });
  assert.deepEqual(config.colors, {
    primary: "#F4663E",
    light: "#FA9B51",
    dark: "#E2471D",
  });
  assert.deepEqual(config.api?.playground, { display: "none" });
  assert.deepEqual(config.contextual, { options: ["copy", "view"] });
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
  assert.equal(redirectInventory.length, 53);
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
  assert.deepEqual(
    cardTags.map((tag) => attribute(tag, "href")),
    [
      "/integration/overview",
      coverage.operations[0].href,
      "/knowledge-base/compliance/overview",
    ],
  );
  assert.ok(
    coverage.operations.some(
      ({ href }) => href === attribute(cardTags[1], "href"),
    ),
  );
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
  const result = docsConfigSchema.safeParse(config);
  assert.equal(
    result.success,
    true,
    result.success ? undefined : JSON.stringify(result.error.issues, null, 2),
  );
});
