import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { docsConfigSchema } from "@mintlify/validation";

import {
  CANONICAL_NAVIGATION_PAGES,
  LOCALIZABLE_NAVIGATION_PAGES,
  LOCALIZED_NAVIGATION_PAGES,
  REQUIRED_NAVIGATION_PAGES,
  TRANSLATED_LOCALES,
  VERSIONING_PAGE_ROUTES,
  collectNavigationPages,
  getDefaultNavigation,
  parseFrontmatter,
  validateFrontmatter,
  validatePublishedJsonStrings,
  validatePublishedText,
} from "../scripts/lib/docs-validation.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(resolve(projectRoot, path), "utf8");
const config = JSON.parse(read("docs.json"));
const indexText = read("index.mdx");
const stylePath = resolve(projectRoot, "style.css");
const styleText = existsSync(stylePath) ? read("style.css") : "";
const LANGUAGE_PICKER_LAYOUT_BLOCK =
  /\/\* language-picker-layout:start \*\/[\s\S]*?\/\* language-picker-layout:end \*\//;
const redirectInventory = JSON.parse(read("docs/redirect-inventory.json"));

const INTEGRATION_GROUPS = [
  {
    group: "Get started",
    pages: [
      "integration/overview",
      "integration/quickstart",
      "integration/authentication",
      "integration/errors",
      "integration/sandbox",
    ],
  },
  {
    group: "Onboard customers",
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
    ],
  },
  {
    group: "Launch",
    pages: [
      "integration/webhooks",
      "integration/go-live",
    ],
  },
];

const NEW_CANONICAL_PAGE_TITLES = {
  "integration/errors": "Errors and retries",
  "integration/common-flows": "Common flows",
  "integration/issue-bank-account": "Issue a bank account",
  "integration/go-live": "Go live",
  "integration/onboarding/customers": "Customers",
  "integration/onboarding/capabilities-and-requirements":
    "Capabilities and tasks",
  "api-reference/introduction": "API reference",
  "knowledge-base/compliance/settlement-slas": "Settlement timing",
};

const RETIRED_INTEGRATION_PAGES = [
  "integration/environments.mdx",
  "integration/pagination-and-sync.mdx",
  "integration/request-safety.mdx",
  "integration/using-the-api-reference.mdx",
  "integration/onboarding/individuals.mdx",
  "integration/onboarding/businesses.mdx",
  "integration/onboarding/tasks-and-submissions.mdx",
  "integration/onboarding/documents.mdx",
  "integration/rules.mdx",
  "integration/api-reliability.mdx",
  "integration/sync-and-reconciliation.mdx",
  "integration/production-readiness.mdx",
  "integration/starter-kit.mdx",
];

const API_REFERENCE_GROUPS = [
  {
    group: "Overview",
    pages: ["api-reference/introduction"],
  },
  {
    group: "Versioning",
    icon: "code-branch",
    pages: [
      "api-reference/versioning/migrate-to-v3",
      "api-reference/versioning/changelog",
    ],
  },
  {
    group: "Endpoints",
    openapi: "openapi.json",
    pages: [],
  },
];

const STRUCTURE_REDIRECTS = {
  "/integration/api-reliability": "/api-reference/introduction",
  "/integration/environments":
    "/integration/authentication#sandbox-and-production",
  "/integration/pagination-and-sync":
    "/integration/webhooks#recover-deliveries",
  "/integration/production-readiness": "/integration/go-live",
  "/integration/request-safety":
    "/api-reference/introduction#make-writes-safe-to-retry",
  "/integration/rules": "/integration/overview",
  "/integration/starter-kit": "/integration/overview#see-it-in-action",
  "/integration/sync-and-reconciliation":
    "/integration/webhooks#recover-deliveries",
  "/integration/using-the-api-reference":
    "/api-reference/customers/post-v3-customers",
  "/integration/onboarding/individuals":
    "/integration/onboarding/customers#individual-customers",
  "/integration/onboarding/businesses":
    "/integration/onboarding/customers#business-customers",
  "/integration/onboarding/tasks-and-submissions":
    "/integration/onboarding/capabilities-and-requirements#complete-current-tasks",
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
      "knowledge-base/compliance/settlement-slas",
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

const EXPECTED_TRANSLATED_LOCALES = [
  "ca",
  "cn",
  "cs",
  "de",
  "es",
  "fi",
  "fr",
  "hi",
  "hu",
  "it",
  "jp",
  "ko",
  "lv",
  "nl",
  "no",
  "zh-Hant",
];
const EXPECTED_VERSIONING_PAGE_ROUTES = [
  "api-reference/versioning/migrate-to-v3",
  "api-reference/versioning/changelog",
];

const ENGLISH_NAVIGATION = {
  tabs: [
    {
      tab: "Integration Docs",
      groups: INTEGRATION_GROUPS,
    },
    {
      tab: "API Reference",
      groups: API_REFERENCE_GROUPS,
    },
    {
      tab: "Knowledge Base",
      groups: KNOWLEDGE_BASE_GROUPS,
    },
  ],
};

const LOCALIZED_INTEGRATION_GROUPS = INTEGRATION_GROUPS.map((group) => ({
  ...group,
  pages: group.pages.filter((page) => page !== "integration/errors"),
}));

const LOCALIZED_KNOWLEDGE_BASE_GROUPS = KNOWLEDGE_BASE_GROUPS.map((group) => ({
  ...group,
  pages: group.pages.filter(
    (page) => page !== "knowledge-base/compliance/settlement-slas",
  ),
}));

const LOCALIZED_TAB_GROUPS = [
  LOCALIZED_INTEGRATION_GROUPS,
  API_REFERENCE_GROUPS.filter(({ openapi }) => openapi === undefined),
  LOCALIZED_KNOWLEDGE_BASE_GROUPS,
];

const APPROVED_FAVICON_SYMBOL =
  '<svg xmlns="http://www.w3.org/2000/svg" width="65" height="64" fill="none"><path fill="#F4663E" d="M2.938 34.102a2.97 2.97 0 0 1 0-4.204L18.2 14.655a2.98 2.98 0 0 1 4.21 0l15.262 15.243a2.97 2.97 0 0 1 0 4.204L22.411 49.345a2.98 2.98 0 0 1-4.21 0L2.937 34.102Z"/><path fill="#FA9B51" d="M27.897 44.922a1.486 1.486 0 0 0 0 2.103l2.323 2.32a2.98 2.98 0 0 0 4.21 0l15.262-15.243a2.97 2.97 0 0 0 0-4.204L34.43 14.655a2.98 2.98 0 0 0-4.21 0l-2.323 2.32a1.485 1.485 0 0 0 0 2.103l10.834 10.82a2.97 2.97 0 0 1 0 4.204l-10.834 10.82Z"/><path fill="#FFDA99" d="M39.909 44.923a1.485 1.485 0 0 0 0 2.102l2.323 2.32a2.98 2.98 0 0 0 4.21 0l15.262-15.243a2.97 2.97 0 0 0 0-4.204L46.442 14.655a2.98 2.98 0 0 0-4.21 0l-2.323 2.32a1.485 1.485 0 0 0 0 2.102l10.834 10.82a2.97 2.97 0 0 1 0 4.205l-10.834 10.82Z"/></svg>';
const LIGHT_DOCS_BACKGROUND = "#FFFFFF";
const PUBLIC_DOCS_COLORS = {
  primary: "#252525",
  light: "#FFFFFF",
  dark: "#777777",
};

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
  assert.equal(config.theme, "mint");
  assert.deepEqual(config.colors, PUBLIC_DOCS_COLORS);
  assert.deepEqual(config.fonts, {
    heading: {
      family: "Geist",
      weight: 500,
    },
    body: {
      family: "Geist",
      weight: 400,
    },
  });
  assert.equal(config.appearance, undefined);
  assert.equal(config.icons, undefined);
  assert.equal(config.background, undefined);
  assert.deepEqual(config.api?.playground, { display: "none" });
  assert.deepEqual(config.contextual, { options: ["copy", "view"] });
});

test("keeps Mintlify's native layout while styling components", () => {
  assert.equal(existsSync(stylePath), true, "style.css must style docs components");
  const nativeComponentStyle = styleText.replace(
    LANGUAGE_PICKER_LAYOUT_BLOCK,
    "",
  );
  assert.doesNotMatch(
    nativeComponentStyle,
    /#(?:navbar|sidebar|sidebar-content|content-area|content|page-title|table-of-contents)\b|(?:^|[\n,])\s*(?:html|body|mdx-content|\.mdx-content)\b/m,
    "custom CSS must not target Mintlify's shell or page typography",
  );
  assert.doesNotMatch(
    nativeComponentStyle,
    /\b(?:min-|max-)?(?:inline-|block-)?(?:width|height)\s*:|\b(?:margin|padding)(?:-[a-z]+)?\s*:|\bposition\s*:|\bdisplay\s*:|\b(?:grid|flex)(?:-[a-z]+)?\s*:|\boverflow(?:-[a-z]+)?\s*:|\b(?:font-size|line-height|letter-spacing)\s*:/,
    "component styling must not change layout, spacing, overflow, or type sizing",
  );

  for (const selector of [
    "#search-bar-entry",
    "button",
    "card",
    "callout",
    "code-block",
  ]) {
    assert.match(
      styleText,
      new RegExp(`${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*(?:,|\\{)`),
      `${selector} should keep the approved component styling`,
    );
  }
});

test("shows the language picker on every translated authored page and places it by the theme control", () => {
  const block = LANGUAGE_PICKER_LAYOUT_BLOCK.exec(styleText)?.[0];
  assert.ok(block, "style.css must contain the approved language picker layout block");
  assert.match(
    block,
    /#localization-select-trigger\s*\{[^}]*display:\s*none\s*!important;/s,
  );

  for (const path of [
    "/",
    ...EXPECTED_TRANSLATED_LOCALES.flatMap((locale) => [
      `/${locale}`,
      `/${locale}/`,
    ]),
  ]) {
    assert.ok(
      block.includes(`[data-current-path="${path}"]`),
      `language picker must cover ${path}`,
    );
  }

  for (const page of LOCALIZABLE_NAVIGATION_PAGES) {
    assert.ok(
      block.includes(`[data-current-path$="/${page}"]`),
      `language picker must cover ${page}`,
    );
  }

  assert.match(
    block,
    /html:is\([\s\S]*?\)\s+#localization-select-trigger\s*\{[^}]*display:\s*flex\s*!important;/,
  );
  assert.match(block, /@media\s*\(min-width:\s*1024px\)/);
  assert.match(block, /position:\s*absolute;/);
  assert.match(block, /top:\s*1rem;/);
  assert.match(block, /right:\s*2\.5rem;/);
  assert.match(
    block,
    /html:is\([\s\S]*?\)\s+#theme-preference-menu-trigger\s*\{[^}]*margin-left:\s*7rem\s*!important;/,
  );
});

test("uses an accessible mpanel primary color for docs UI text and controls", () => {
  const ratio = contrastRatio(config.colors.primary, LIGHT_DOCS_BACKGROUND);
  assert.ok(
    ratio >= 4.5,
    `${config.colors.primary} has ${ratio.toFixed(2)}:1 contrast against ${LIGHT_DOCS_BACKGROUND}; expected at least 4.5:1`,
  );
});

test("uses the approved language navigation and English tab skeleton", () => {
  assert.deepEqual(TRANSLATED_LOCALES, EXPECTED_TRANSLATED_LOCALES);
  assert.deepEqual(VERSIONING_PAGE_ROUTES, EXPECTED_VERSIONING_PAGE_ROUTES);
  assert.deepEqual(
    config.navigation.languages.map(({ language }) => language),
    ["en", ...EXPECTED_TRANSLATED_LOCALES],
  );

  const defaultNavigation = getDefaultNavigation(config.navigation);
  assert.deepEqual(defaultNavigation, {
    language: "en",
    default: true,
    ...ENGLISH_NAVIGATION,
  });

  const localizedNavigation = config.navigation.languages.slice(1);
  for (const languageNavigation of localizedNavigation) {
    const { language, tabs } = languageNavigation;
    assert.deepEqual(Object.keys(languageNavigation).sort(), ["language", "tabs"]);
    assert.equal(tabs.length, LOCALIZED_TAB_GROUPS.length);

    tabs.forEach((tab, tabIndex) => {
      assert.deepEqual(Object.keys(tab).sort(), ["groups", "tab"]);
      assert.equal(typeof tab.tab, "string");
      assert.notEqual(tab.tab.trim(), "");

      const expectedGroups = LOCALIZED_TAB_GROUPS[tabIndex];
      assert.equal(tab.groups.length, expectedGroups.length);
      tab.groups.forEach((group, groupIndex) => {
        const expectedGroup = expectedGroups[groupIndex];
        const expectedKeys = expectedGroup.icon
          ? ["group", "icon", "pages"]
          : ["group", "pages"];
        assert.deepEqual(Object.keys(group).sort(), expectedKeys);
        assert.equal(typeof group.group, "string");
        assert.notEqual(group.group.trim(), "");
        assert.deepEqual(
          group.pages,
          expectedGroup.pages.map((page) => `${language}/${page}`),
        );
        if (expectedGroup.icon) assert.equal(group.icon, expectedGroup.icon);
      });
    });
  }

  const canonicalPages = [
    ...INTEGRATION_GROUPS.flatMap(({ pages }) => pages),
    ...API_REFERENCE_GROUPS.flatMap(({ pages }) => pages),
    ...KNOWLEDGE_BASE_GROUPS.flatMap(({ pages }) => pages),
  ];
  const localizedPages = localizedNavigation.flatMap(({ tabs }) =>
    tabs.flatMap(({ groups }) => groups.flatMap(({ pages }) => pages)),
  );
  assert.deepEqual(canonicalPages, CANONICAL_NAVIGATION_PAGES);
  assert.deepEqual(localizedPages, LOCALIZED_NAVIGATION_PAGES);
  assert.deepEqual(
    [...canonicalPages, ...localizedPages],
    REQUIRED_NAVIGATION_PAGES,
  );
  assert.deepEqual(
    collectNavigationPages(config.navigation),
    REQUIRED_NAVIGATION_PAGES,
  );
});

test("keeps each translated changelog linked to its localized migration guide", () => {
  for (const locale of EXPECTED_TRANSLATED_LOCALES) {
    const changelogPath = `${locale}/api-reference/versioning/changelog.mdx`;
    const migrationPath = `${locale}/api-reference/versioning/migrate-to-v3.mdx`;
    assert.equal(existsSync(resolve(projectRoot, changelogPath)), true);
    assert.equal(existsSync(resolve(projectRoot, migrationPath)), true);
    assert.match(
      read(changelogPath),
      new RegExp(`\\]\\(/${locale}/api-reference/versioning/migrate-to-v3\\)`),
    );
  }
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
  const apiReference = getDefaultNavigation(config.navigation).tabs.find(
    ({ tab }) => tab === "API Reference",
  );
  const endpoints = apiReference?.groups.find(
    ({ group }) => group === "Endpoints",
  );
  assert.strictEqual(owners[0], endpoints);
  assert.deepEqual(owners[0], {
    group: "Endpoints",
    openapi: "openapi.json",
    pages: [],
  });
});

test("copies the exact approved redirect pairs without internal metadata", () => {
  assert.equal(redirectInventory.length, 160);
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

test("uses mpanel logo treatment without changing the compact symbol", () => {
  const favicon = read("favicon.svg").trim();
  const lightLogo = read("logo/light.svg").trim();
  const darkLogo = read("logo/dark.svg").trim();

  assert.equal(favicon, APPROVED_FAVICON_SYMBOL);
  const paths = (svg) =>
    [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)].map(
      (match) => match[1],
    );
  assert.deepEqual(paths(lightLogo), paths(favicon));
  assert.deepEqual(paths(darkLogo), paths(favicon));

  assert.deepEqual(
    [...lightLogo.matchAll(/\bfill="(#[A-F0-9]{6})"/g)].map(
      (match) => match[1],
    ),
    ["#252525", "#777777", "#A4A4A4"],
  );
  assert.deepEqual(
    [...darkLogo.matchAll(/\bfill="(#[A-F0-9]{6})"/g)].map(
      (match) => match[1],
    ),
    ["#FFFFFF", "#FFFFFF", "#FFFFFF"],
  );
  assert.deepEqual(
    [...darkLogo.matchAll(/\bopacity="([0-9.]+)"/g)].map(
      (match) => match[1],
    ),
    ["0.65", "0.4"],
  );

  for (const svg of [favicon, lightLogo, darkLogo]) {
    assert.equal((svg.match(/<path\b/g) ?? []).length, 3);
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
  assert.deepEqual(
    cardTags.map((tag) => attribute(tag, "title")),
    ["Start integrating", "Explore API", "Compliance and onboarding"],
  );
  const cardHrefs = cardTags.map((tag) => attribute(tag, "href"));
  assert.deepEqual(cardHrefs, [
    "/integration/quickstart",
    "/api-reference/introduction",
    "/knowledge-base/compliance/overview",
  ]);
  assert.doesNotMatch(body, /^import\s/m);
});

test("keeps landing copy concise and separates guides, reference, and knowledge", () => {
  const { body } = parseFrontmatter(indexText);
  const prose = body
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  assert.ok(prose.split(/\s+/).length <= 170, "landing copy is too long");
  assert.match(prose, /Swipelux API/i);
  assert.match(prose, /accept fiat/i);
  assert.match(prose, /pay a customer-owned account/i);
  assert.match(prose, /reusable bank details/i);
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
