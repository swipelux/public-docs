import {
  DEFAULT_MINT_IGNORES,
  getFileCategory,
  processMintIgnoreString,
} from "@mintlify/common";
import frontMatter from "front-matter";
import ignore from "ignore";

export const SOURCE_COMMIT =
  "b4c9b5b7101ec03e01424259f58a5c8763ea489b";

export const REQUIRED_NAVIGATION_PAGES = Object.freeze([
  "integration/overview",
  "integration/quickstart",
  "integration/authentication",
  "integration/sandbox",
  "integration/onboarding/customers",
  "integration/onboarding/capabilities-and-requirements",
  "integration/common-flows",
  "integration/accounts",
  "integration/issue-bank-account",
  "integration/recipients",
  "integration/receive-funds",
  "integration/send-funds",
  "integration/quotes-and-transfers",
  "integration/webhooks",
  "integration/go-live",
  "api-reference/introduction",
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
  "knowledge-base/business-onboarding/overview",
  "knowledge-base/business-onboarding/entity-and-business-types",
  "knowledge-base/business-onboarding/document-requirements",
  "knowledge-base/business-onboarding/shareholders-ubos-and-control-persons",
  "knowledge-base/business-onboarding/kyb-workflow",
  "knowledge-base/business-onboarding/faq",
  "knowledge-base/individual-onboarding/overview",
  "knowledge-base/individual-onboarding/verification-levels",
  "knowledge-base/individual-onboarding/status-and-workflow",
  "knowledge-base/individual-onboarding/api-workflow",
]);

export const REQUIRED_PUBLISHED_PAGES = Object.freeze([
  "index",
  ...REQUIRED_NAVIGATION_PAGES,
]);

// Independent oracle for the approved ledger's release decisions. Source-page
// and expected redirect-source inventories derive from this data, never from
// the ledger file under validation.
const FROZEN_MIGRATION_DECISION_ROWS = Object.freeze([
  [
    "content/business-onboarding/documents.mdx",
    "/knowledge-base/business-onboarding/document-requirements",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/business-onboarding/entity-types.mdx",
    "/knowledge-base/business-onboarding/entity-and-business-types",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/business-onboarding/faq.mdx",
    "/knowledge-base/business-onboarding/faq",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/business-onboarding/index.mdx",
    "/knowledge-base/business-onboarding/overview",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/business-onboarding/shareholders.mdx",
    "/knowledge-base/business-onboarding/shareholders-ubos-and-control-persons",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/business-onboarding/workflow.mdx",
    "/knowledge-base/business-onboarding/kyb-workflow",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/compliance/general-information.mdx",
    "/knowledge-base/compliance/regulatory-perimeter",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/compliance/governance.mdx",
    "/knowledge-base/compliance/governance-retention-and-privacy",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/compliance/index.mdx",
    "/knowledge-base/compliance/overview",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/compliance/jurisdiction-framework.mdx",
    "/knowledge-base/compliance/jurisdictions-and-availability",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/compliance/limits.mdx",
    "/knowledge-base/compliance/transaction-limits",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/compliance/merchant-onboarding.mdx",
    "/knowledge-base/business-onboarding/overview",
    "redirect-only",
    "not-applicable",
  ],
  [
    "content/compliance/payment-methods.mdx",
    "/knowledge-base/compliance/payment-methods",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/compliance/screening-monitoring.mdx",
    "/knowledge-base/compliance/screening-and-monitoring",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/compliance/supported-verticals.mdx",
    "/knowledge-base/compliance/supported-business-models",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/compliance/travel-rule.mdx",
    "/knowledge-base/compliance/travel-rule",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/compliance/wallet-architecture.mdx",
    "/knowledge-base/compliance/custody-and-wallet-controls",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/concepts/accounts.mdx",
    "/integration/accounts",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/concepts/customers.mdx",
    "/integration/overview",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/concepts/index.mdx",
    "/integration/overview",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/concepts/quotes.mdx",
    "/integration/quotes-and-transfers",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/concepts/rails.mdx",
    "/integration/overview",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/concepts/recipients.mdx",
    "/integration/recipients",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/concepts/wallets.mdx",
    "/integration/accounts",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/concepts/webhooks.mdx",
    "/integration/webhooks",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/get-started/api-reference.mdx",
    "/api-reference/customers/post-v3-customers",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/get-started/authentication.mdx",
    "/integration/authentication",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/get-started/index.mdx",
    "/integration/overview",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/get-started/sandbox.mdx",
    "/integration/sandbox",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/get-started/starter-kit.mdx",
    "/integration/overview#see-it-in-action",
    "contract-rewrite",
    "not-applicable",
  ],
  ["content/index.mdx", "/", "contract-rewrite", "not-applicable"],
  [
    "content/individual-onboarding/api-reference.mdx",
    "/knowledge-base/individual-onboarding/api-workflow",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/individual-onboarding/index.mdx",
    "/knowledge-base/individual-onboarding/overview",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/individual-onboarding/status-workflow.mdx",
    "/knowledge-base/individual-onboarding/status-and-workflow",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/individual-onboarding/verification-levels.mdx",
    "/knowledge-base/individual-onboarding/verification-levels",
    "preserved-policy",
    "review-required",
  ],
  [
    "content/onboarding/businesses.mdx",
    "/integration/onboarding/customers#business-customers",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/onboarding/index.mdx",
    "/integration/onboarding/customers#individual-customers",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/onboarding/individuals.mdx",
    "/integration/onboarding/customers#individual-customers",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/onboarding/shareholders-and-documents.mdx",
    "/integration/onboarding/capabilities-and-requirements#upload-documents",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/receive/index.mdx",
    "/integration/receive-funds",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/receive/pooled-payins.mdx",
    "/integration/receive-funds",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/receive/virtual-accounts.mdx",
    "/integration/receive-funds",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/reference/endpoint-map.mdx",
    "/api-reference/customers/post-v3-customers",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/reference/rates.mdx",
    "/api-reference/money-movement/get-v3-rates",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/reference/supported-rails.mdx",
    "/integration/overview",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/reference/v3-blockchain-networks.mdx",
    "/integration/accounts",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/reference/v3-fee-schedule.mdx",
    "/integration/quotes-and-transfers",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/reference/v3-method-coverage.mdx",
    "/integration/overview",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/reference/v3-reason-codes.mdx",
    "/api-reference/introduction#handle-errors",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/reference/webhooks.mdx",
    "/integration/webhooks",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/send/first-party-payouts.mdx",
    "/integration/send-funds",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/send/index.mdx",
    "/integration/send-funds",
    "contract-rewrite",
    "not-applicable",
  ],
  [
    "content/send/recipient-payouts.mdx",
    "/integration/send-funds",
    "contract-rewrite",
    "not-applicable",
  ],
  ["content/t-c/creating-customer.mdx", "—", "omitted", "not-applicable"],
  ["content/t-c/implementation.mdx", "—", "omitted", "not-applicable"],
  [
    "content/t-c/incorporating-terms.mdx",
    "—",
    "omitted",
    "not-applicable",
  ],
  ["content/t-c/index.mdx", "—", "omitted", "not-applicable"],
  ["content/t-c/updates.mdx", "—", "omitted", "not-applicable"],
  [
    "content/transfers/index.mdx",
    "/integration/quotes-and-transfers",
    "contract-rewrite",
    "not-applicable",
  ],
]);

export const FROZEN_MIGRATION_DECISIONS = Object.freeze(
  Object.fromEntries(
    FROZEN_MIGRATION_DECISION_ROWS.map(
      ([sourcePath, destination, disposition, reviewState]) => [
        sourcePath,
        Object.freeze({ destination, disposition, reviewState }),
      ],
    ),
  ),
);

export const FROZEN_SOURCE_PAGES = Object.freeze(
  Object.keys(FROZEN_MIGRATION_DECISIONS).sort(compareStrings),
);

const REDIRECT_SOURCE_ROOTS = new Set([
  "business-onboarding",
  "compliance",
  "concepts",
  "get-started",
  "individual-onboarding",
  "onboarding",
  "receive",
  "reference",
  "send",
  "transfers",
]);

export function sourcePathToRoute(sourcePath) {
  const normalized = String(sourcePath).replaceAll("\\", "/");
  if (!normalized.startsWith("content/") || !normalized.endsWith(".mdx")) {
    throw new Error(`Invalid source MDX path: ${sourcePath}`);
  }

  const relative = normalized.slice("content/".length, -".mdx".length);
  if (relative === "index") return "/";
  if (relative.endsWith("/index")) {
    return `/${relative.slice(0, -"/index".length)}`;
  }
  return `/${relative}`;
}

function isRedirectSourcePage(sourcePath) {
  const route = sourcePathToRoute(sourcePath);
  if (route === "/") return false;
  return REDIRECT_SOURCE_ROOTS.has(route.split("/")[1]);
}

const LEGACY_REDIRECT_SOURCES = Object.freeze(
  FROZEN_SOURCE_PAGES.filter(isRedirectSourcePage)
    .map(sourcePathToRoute)
    .sort(compareStrings),
);

export const STRUCTURE_REDIRECTS = Object.freeze({
  "/integration/api-reliability": "/api-reference/introduction",
  "/integration/environments":
    "/integration/authentication#sandbox-and-production",
  "/integration/errors": "/api-reference/introduction#handle-errors",
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
});

export const EXPECTED_REDIRECT_SOURCES = Object.freeze(
  [...LEGACY_REDIRECT_SOURCES, ...Object.keys(STRUCTURE_REDIRECTS)].sort(
    compareStrings,
  ),
);

export const APPROVED_REDIRECT_DESTINATIONS = Object.freeze({
  "/business-onboarding": "/knowledge-base/business-onboarding/overview",
  "/business-onboarding/documents":
    "/knowledge-base/business-onboarding/document-requirements",
  "/business-onboarding/entity-types":
    "/knowledge-base/business-onboarding/entity-and-business-types",
  "/business-onboarding/faq": "/knowledge-base/business-onboarding/faq",
  "/business-onboarding/shareholders":
    "/knowledge-base/business-onboarding/shareholders-ubos-and-control-persons",
  "/business-onboarding/workflow":
    "/knowledge-base/business-onboarding/kyb-workflow",
  "/compliance": "/knowledge-base/compliance/overview",
  "/compliance/general-information":
    "/knowledge-base/compliance/regulatory-perimeter",
  "/compliance/governance":
    "/knowledge-base/compliance/governance-retention-and-privacy",
  "/compliance/jurisdiction-framework":
    "/knowledge-base/compliance/jurisdictions-and-availability",
  "/compliance/limits": "/knowledge-base/compliance/transaction-limits",
  "/compliance/merchant-onboarding":
    "/knowledge-base/business-onboarding/overview",
  "/compliance/payment-methods":
    "/knowledge-base/compliance/payment-methods",
  "/compliance/screening-monitoring":
    "/knowledge-base/compliance/screening-and-monitoring",
  "/compliance/supported-verticals":
    "/knowledge-base/compliance/supported-business-models",
  "/compliance/travel-rule": "/knowledge-base/compliance/travel-rule",
  "/compliance/wallet-architecture":
    "/knowledge-base/compliance/custody-and-wallet-controls",
  "/concepts": "/integration/overview",
  "/concepts/accounts": "/integration/accounts",
  "/concepts/customers": "/integration/overview",
  "/concepts/quotes": "/integration/quotes-and-transfers",
  "/concepts/rails": "/integration/overview",
  "/concepts/recipients": "/integration/recipients",
  "/concepts/wallets": "/integration/accounts",
  "/concepts/webhooks": "/integration/webhooks",
  "/get-started": "/integration/overview",
  "/get-started/api-reference":
    "/api-reference/customers/post-v3-customers",
  "/get-started/authentication": "/integration/authentication",
  "/get-started/sandbox": "/integration/sandbox",
  "/get-started/starter-kit":
    "/integration/overview#see-it-in-action",
  "/individual-onboarding":
    "/knowledge-base/individual-onboarding/overview",
  "/individual-onboarding/api-reference":
    "/integration/onboarding/customers#individual-customers",
  "/individual-onboarding/status-workflow":
    "/knowledge-base/individual-onboarding/status-and-workflow",
  "/individual-onboarding/verification-levels":
    "/knowledge-base/individual-onboarding/verification-levels",
  "/onboarding": "/integration/onboarding/customers#individual-customers",
  "/onboarding/businesses":
    "/integration/onboarding/customers#business-customers",
  "/onboarding/individuals":
    "/integration/onboarding/customers#individual-customers",
  "/onboarding/shareholders-and-documents":
    "/integration/onboarding/capabilities-and-requirements#upload-documents",
  "/receive": "/integration/receive-funds",
  "/receive/pooled-payins": "/integration/receive-funds",
  "/receive/virtual-accounts": "/integration/receive-funds",
  "/reference/endpoint-map":
    "/api-reference/customers/post-v3-customers",
  "/reference/rates": "/api-reference/money-movement/get-v3-rates",
  "/reference/supported-rails": "/integration/overview",
  "/reference/v3-blockchain-networks": "/integration/accounts",
  "/reference/v3-fee-schedule": "/integration/quotes-and-transfers",
  "/reference/v3-method-coverage": "/integration/overview",
  "/reference/v3-reason-codes":
    "/api-reference/introduction#handle-errors",
  "/reference/webhooks": "/integration/webhooks",
  "/send": "/integration/send-funds",
  "/send/first-party-payouts": "/integration/send-funds",
  "/send/recipient-payouts": "/integration/send-funds",
  "/transfers": "/integration/quotes-and-transfers",
  ...STRUCTURE_REDIRECTS,
});

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortedErrors(errors) {
  return [...new Set(errors)].sort(compareStrings);
}

function normalizePath(path) {
  return String(path).replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function pageFile(page) {
  return page === "index" ? "index.mdx" : `${page}.mdx`;
}

export function parseMintIgnoreRules(content) {
  return processMintIgnoreString(String(content));
}

export function createMintlifyIgnoreMatcher(rules = []) {
  const customRules = Array.isArray(rules)
    ? rules.map((rule) => String(rule).trim())
    : parseMintIgnoreRules(rules);
  const matcher = ignore().add(
    Array.from(new Set([...DEFAULT_MINT_IGNORES, ...customRules])),
  );

  return (path) => {
    const normalized = normalizePath(path).replace(/^\/+/, "");
    return normalized !== "" && matcher.ignores(normalized);
  };
}

export function isMintlifyIgnoredPath(path, rules = []) {
  return createMintlifyIgnoreMatcher(rules)(path);
}

export function selectPublishablePagePaths(paths, ignoreRules = []) {
  const isIgnored = createMintlifyIgnoreMatcher(ignoreRules);
  return [...new Set(paths.map(normalizePath))]
    .filter((path) => getFileCategory(path) === "page")
    .filter((path) => !isIgnored(path))
    .sort(compareStrings);
}

export function pagePathToRoute(path) {
  return normalizePath(path).replace(/\.mdx?$/, "");
}

export function validatePublishedPageInventory(paths, options = {}) {
  const requiredPages = options.requiredPages ?? REQUIRED_PUBLISHED_PAGES;
  const requiredSet = new Set(requiredPages);
  const publishedFiles = [...new Set(paths.map(normalizePath))].sort(
    compareStrings,
  );
  const pathsByRoute = new Map();
  const errors = [];

  for (const path of publishedFiles) {
    const route = pagePathToRoute(path);
    const routePaths = pathsByRoute.get(route) ?? [];
    routePaths.push(path);
    pathsByRoute.set(route, routePaths);
  }

  for (const page of requiredPages) {
    if (!pathsByRoute.has(page)) {
      errors.push(`${pageFile(page)}: missing required published page`);
    }
  }

  for (const [route, routePaths] of [...pathsByRoute.entries()].sort(
    ([left], [right]) => compareStrings(left, right),
  )) {
    if (routePaths.length > 1) {
      errors.push(
        `${route}: multiple publishable page files: ${routePaths.join(", ")}`,
      );
    }
    if (!requiredSet.has(route)) {
      for (const path of routePaths) {
        errors.push(`${path}: unexpected publishable page`);
      }
    }
  }

  return sortedErrors(errors);
}

export function isPublishedPath(path) {
  const normalized = normalizePath(path).split("#", 1)[0];
  if (normalized.startsWith("docs/")) return false;
  return (
    getFileCategory(normalized) === "page" ||
    normalized === "docs.json" ||
    normalized === "openapi.json"
  );
}

function formatFrontmatterParseError(error) {
  const reason =
    error && typeof error === "object" && typeof error.reason === "string"
      ? error.reason
      : error instanceof Error
        ? error.message.split("\n", 1)[0]
        : String(error);
  const line =
    error && typeof error === "object" && Number.isInteger(error.mark?.line)
      ? error.mark.line + 1
      : undefined;
  const column =
    error && typeof error === "object" && Number.isInteger(error.mark?.column)
      ? error.mark.column + 1
      : undefined;
  const location =
    line === undefined || column === undefined
      ? ""
      : ` at line ${line}, column ${column}`;
  return `invalid YAML frontmatter${location}: ${reason}`;
}

export function parseFrontmatter(text) {
  const content = String(text);
  try {
    return {
      ...frontMatter(content),
      errors: [],
    };
  } catch (error) {
    return {
      attributes: {},
      body: content,
      bodyBegin: 1,
      errors: [formatFrontmatterParseError(error)],
    };
  }
}

export function validateFrontmatter(path, text) {
  const { attributes, errors: parseErrors } = parseFrontmatter(text);
  const errors = parseErrors.map((error) => `${path}: ${error}`);

  if (parseErrors.length > 0) return sortedErrors(errors);

  if (typeof attributes?.title !== "string" || !attributes.title.trim()) {
    errors.push(`${path}: missing title frontmatter`);
  }
  if (
    typeof attributes?.description !== "string" ||
    !attributes.description.trim()
  ) {
    errors.push(`${path}: missing description frontmatter`);
  }

  for (const { pointer, value } of collectJsonStrings(attributes)) {
    const location = `${path}#frontmatter${pointer === "/" ? "" : pointer}`;
    errors.push(
      ...validatePublishedText(location, value, { checkCodeFences: false }),
    );
  }

  return sortedErrors(errors);
}

function isObviousSecretPlaceholder(suffix) {
  const normalized = suffix.toLowerCase();
  const placeholderWords = [
    "api_key",
    "apikey",
    "example",
    "placeholder",
    "redacted",
    "replace",
    "sample",
    "secret_here",
    "your_",
  ];
  if (placeholderWords.some((word) => normalized.includes(word))) return true;

  const compact = normalized.replace(/[_-]/g, "");
  return compact.length === 0 || new Set(compact).size < 8;
}

function validateCodeFences(path, text) {
  const errors = [];
  const lines = String(text).replaceAll("\r\n", "\n").split("\n");
  let openFence;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (openFence) {
      const indentation = /^ */.exec(line)?.[0].length ?? 0;
      const relativeIndent = indentation - openFence.containerIndent;
      const candidate = line.slice(indentation);
      const match =
        relativeIndent >= 0 && relativeIndent <= 3
          ? /^(`{3,}|~{3,})(.*)$/.exec(candidate)
          : undefined;

      if (match) {
        const [, marker, remainder] = match;
        if (
          marker[0] === openFence.character &&
          marker.length >= openFence.length &&
          remainder.trim() === ""
        ) {
          openFence = undefined;
        }
        continue;
      }

      const exitsListContainer =
        openFence.containerIndent > 0 &&
        indentation < openFence.containerIndent &&
        line.trim() !== "";
      if (!exitsListContainer) continue;

      openFence = undefined;
    }

    let candidate = line;
    let blockquoted = false;
    let listContainer = false;
    while (true) {
      candidate = candidate.trimStart();
      const blockquoteMatch = /^>\s*/.exec(candidate)?.[0];
      if (blockquoteMatch) {
        blockquoted = true;
        candidate = candidate.slice(blockquoteMatch.length);
        continue;
      }
      const listMatch = /^(?:[-+*]|\d+[.)])\s+/.exec(candidate)?.[0];
      if (!listMatch) break;
      listContainer = true;
      candidate = candidate.slice(listMatch.length);
    }
    const match = /^(`{3,}|~{3,})(.*)$/.exec(candidate);
    if (!match) continue;

    const [, marker, remainder] = match;
    if (blockquoted) {
      errors.push(`${path}:${index + 1}: code fence must not be blockquoted`);
    }
    const info = remainder.trim();
    const language = info.split(/\s+/, 1)[0] ?? "";
    if (!/^[A-Za-z0-9][A-Za-z0-9_+#.-]*$/.test(language)) {
      errors.push(
        `${path}:${index + 1}: code fence is missing a language tag`,
      );
    }
    openFence = {
      character: marker[0],
      containerIndent:
        listContainer && !blockquoted ? line.length - candidate.length : 0,
      length: marker.length,
    };
  }

  return errors;
}

export function validatePublishedText(path, text, options = {}) {
  if (!isPublishedPath(path)) return [];

  const errors = [];
  const value = String(text);
  const bannedPatterns = [
    {
      pattern: /(^|[^A-Za-z0-9])v[12](?=$|[^A-Za-z0-9])/i,
      label: "prohibited legacy API v1/v2 identifier",
    },
    {
      pattern: /wallet\.swipelux\.com/i,
      label: "deprecated wallet.swipelux.com host",
    },
    {
      pattern: /Mintlify Starter Kit/i,
      label: "starter branding Mintlify Starter Kit",
    },
    {
      pattern:
        /Welcome to your project|Ready to make this your own\?|Write a short description of your product here/i,
      label: "Mintlify starter placeholder content",
    },
  ];

  for (const { pattern, label } of bannedPatterns) {
    if (pattern.test(value)) errors.push(`${path}: ${label}`);
  }

  const secretPattern = /\bsk\.(?:live|sbx)\.([A-Za-z0-9_-]{8,})\b/g;
  for (const match of value.matchAll(secretPattern)) {
    const suffix = match[1];
    if (suffix.length >= 24 && !isObviousSecretPlaceholder(suffix)) {
      errors.push(`${path}: contains a real-looking secret key`);
      break;
    }
  }

  const normalized = normalizePath(path).split("#", 1)[0];
  if (normalized.startsWith("integration/")) {
    for (const pattern of [
      /openapi-coverage\.json/i,
      /openapi-provenance\.json/i,
      /x-mint\.href/i,
      /the committed contract defines/i,
      /the generated schema says/i,
    ]) {
      if (pattern.test(value)) {
        errors.push(`${path}: internal documentation implementation detail`);
      }
    }
  }

  const checkCodeFences =
    options.checkCodeFences ?? getFileCategory(normalized) === "page";
  if (checkCodeFences) errors.push(...validateCodeFences(path, value));

  return sortedErrors(errors);
}

function normalizeNavigationPage(page) {
  const normalized = String(page)
    .replaceAll("\\", "/")
    .replace(/^\//, "")
    .replace(/\.mdx?$/, "")
    .replace(/\/$/, "");
  return normalized === "" ? "index" : normalized;
}

export function collectNavigationPages(navigation) {
  const pages = [];

  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node.pages)) {
      for (const item of node.pages) {
        if (typeof item === "string") pages.push(normalizeNavigationPage(item));
        else walk(item);
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key !== "pages") walk(value);
    }
  }

  walk(navigation);
  return pages;
}

function findObjects(value, predicate, matches = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => findObjects(item, predicate, matches));
    return matches;
  }
  if (!value || typeof value !== "object") return matches;
  if (predicate(value)) matches.push(value);
  Object.values(value).forEach((item) => findObjects(item, predicate, matches));
  return matches;
}

export function validateNavigation(config, options = {}) {
  const errors = [];
  const requiredPages = options.requiredPages ?? REQUIRED_NAVIGATION_PAGES;
  const pageExists = options.pageExists;
  const navigation = config?.navigation;

  if (!navigation || typeof navigation !== "object") {
    return ["docs.json: missing navigation configuration"];
  }

  const pages = collectNavigationPages(navigation);
  const pageCounts = new Map();
  for (const page of pages) {
    pageCounts.set(page, (pageCounts.get(page) ?? 0) + 1);
  }

  for (const page of [...pageCounts.keys()].sort(compareStrings)) {
    const count = pageCounts.get(page);
    if (count > 1) {
      errors.push(`docs.json: navigation page ${page} appears ${count} times`);
    }
    if (pageExists && !pageExists(page)) {
      errors.push(`docs.json: navigation page ${page} is missing from disk`);
    }
  }

  const requiredSet = new Set(requiredPages);
  for (const page of requiredPages) {
    const count = pageCounts.get(page) ?? 0;
    if (count === 0) {
      errors.push(`docs.json: missing required navigation page ${page}`);
    } else if (count > 1) {
      errors.push(
        `docs.json: required navigation page ${page} appears ${count} times`,
      );
    }
  }

  for (const page of [...pageCounts.keys()].sort(compareStrings)) {
    if (!requiredSet.has(page)) {
      errors.push(`docs.json: unexpected navigation page ${page}`);
    }
  }

  const topLevelTabs = Array.isArray(navigation.tabs) ? navigation.tabs : [];
  const apiTabs = topLevelTabs.filter(
    (value) =>
      value && typeof value === "object" && value.tab === "API Reference",
  );
  const openapiOwners = findObjects(
    navigation,
    (value) => Object.hasOwn(value, "openapi"),
  );
  const apiOpenapiOwners =
    apiTabs.length === 1
      ? findObjects(apiTabs[0], (value) => Object.hasOwn(value, "openapi"))
      : [];
  if (
    apiTabs.length !== 1 ||
    openapiOwners.length !== 1 ||
    apiOpenapiOwners.length !== 1 ||
    apiOpenapiOwners[0] !== openapiOwners[0] ||
    openapiOwners[0]?.openapi !== "openapi.json"
  ) {
    errors.push(
      "docs.json: top-level API Reference tab must contain openapi.json; navigation must contain exactly one openapi reference",
    );
  }

  return sortedErrors(errors);
}

export function parseRedirectVerificationPhase(args = [], marker) {
  const usage = "Usage: verify-docs [--redirect-phase=current|final]";
  if (!Array.isArray(args)) throw new Error(usage);

  if (args.length > 0) {
    if (args.length !== 1) throw new Error(usage);
    const match = /^--redirect-phase=(current|final)$/.exec(String(args[0]));
    if (!match) throw new Error(usage);
    return match[1];
  }

  const keys =
    marker && typeof marker === "object" && !Array.isArray(marker)
      ? Object.keys(marker).sort(compareStrings)
      : [];
  if (
    keys.length !== 1 ||
    keys[0] !== "phase" ||
    (marker.phase !== "current" && marker.phase !== "final")
  ) {
    throw new Error(
      "Redirect verification phase marker must be an object with exactly one phase key set to current or final",
    );
  }
  return marker.phase;
}

export function validateRedirectInventory(inventory, options = {}) {
  if (!Array.isArray(inventory)) {
    return ["docs/redirect-inventory.json: inventory must be a JSON array"];
  }

  const errors = [];
  const expectedSources = options.expectedSources ?? EXPECTED_REDIRECT_SOURCES;
  const knownDestinations = options.knownDestinations;
  const expectedDestinations = options.expectedDestinations;
  const verificationPhase = options.verificationPhase ?? "current";
  const sourceCounts = new Map();
  const allowedKeys = ["destination", "reason", "source", "verified"];

  if (verificationPhase !== "current" && verificationPhase !== "final") {
    errors.push(
      `docs/redirect-inventory.json: invalid redirect verification phase ${verificationPhase}`,
    );
  }

  if (expectedDestinations !== undefined) {
    if (
      !expectedDestinations ||
      typeof expectedDestinations !== "object" ||
      Array.isArray(expectedDestinations)
    ) {
      errors.push(
        "docs/redirect-inventory.json: expected destinations must be an object",
      );
    } else {
      const expectedSourceSet = new Set(expectedSources);
      for (const source of expectedSources) {
        if (!Object.hasOwn(expectedDestinations, source)) {
          errors.push(`expected destinations are missing source ${source}`);
        }
      }
      for (const source of Object.keys(expectedDestinations).sort(
        compareStrings,
      )) {
        if (!expectedSourceSet.has(source)) {
          errors.push(
            `expected destinations contain unexpected source ${source}`,
          );
        }
      }
    }
  }

  inventory.forEach((entry, index) => {
    const location = `docs/redirect-inventory.json[${index}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${location}: redirect entry must be an object`);
      return;
    }

    const keys = Object.keys(entry).sort(compareStrings);
    if (JSON.stringify(keys) !== JSON.stringify(allowedKeys)) {
      errors.push(
        `${location}: redirect keys must be source, destination, reason, verified`,
      );
    }

    const { source, destination, reason, verified } = entry;
    if (typeof source !== "string" || !source.startsWith("/")) {
      errors.push(`${location}: source must be a root-relative route`);
    } else {
      sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
      if (source === "/t-c" || source.startsWith("/t-c/")) {
        errors.push(`${location}: Terms routes must not be redirected`);
      }
    }
    if (typeof destination !== "string" || !destination.startsWith("/")) {
      errors.push(`${location}: destination must be a root-relative route`);
    } else {
      const destinationPath = destination.split("#", 1)[0];
      if (
        knownDestinations &&
        !knownDestinations.has(destinationPath)
      ) {
        errors.push(`${location}: unknown destination ${destination}`);
      }
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      errors.push(`${location}: reason must be a non-empty string`);
    }
    const expectedVerified = verificationPhase === "final";
    if (verified !== expectedVerified) {
      errors.push(
        `${location}: verified must be ${expectedVerified} in ${verificationPhase} phase`,
      );
    }

    if (
      expectedDestinations &&
      typeof source === "string" &&
      Object.hasOwn(expectedDestinations, source) &&
      destination !== expectedDestinations[source]
    ) {
      errors.push(
        `${location}: ${source} must redirect to ${expectedDestinations[source]}`,
      );
    }
  });

  for (const [source, count] of [...sourceCounts.entries()].sort()) {
    if (count > 1) errors.push(`duplicate redirect source ${source}`);
  }

  const expectedSet = new Set(expectedSources);
  for (const source of expectedSources) {
    if (!sourceCounts.has(source)) {
      errors.push(`missing redirect source ${source}`);
    }
  }
  for (const source of [...sourceCounts.keys()].sort(compareStrings)) {
    if (!expectedSet.has(source)) {
      errors.push(`unexpected redirect source ${source}`);
    }
  }

  return sortedErrors(errors);
}

function stripCode(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("`") && trimmed.endsWith("`")) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function splitMarkdownTableRow(line) {
  const trimmed = String(line).trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return undefined;

  const cells = [];
  let cell = "";
  const content = trimmed.slice(1, -1);
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === "\\" && content[index + 1] === "|") {
      cell += "|";
      index += 1;
    } else if (character === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

export function parseMigrationLedger(markdown) {
  const lines = String(markdown).replaceAll("\r\n", "\n").split("\n");
  const headerIndex = lines.findIndex(
    (line) =>
      line.trim() ===
      "| Source path | Source commit | Destination | Disposition | Review state | Notes |",
  );
  if (headerIndex === -1) {
    throw new Error("Migration ledger table header is missing or malformed");
  }

  const separator = splitMarkdownTableRow(lines[headerIndex + 1]);
  if (
    separator?.length !== 6 ||
    separator.some((cell) => !/^:?-{3,}:?$/.test(cell))
  ) {
    throw new Error("Migration ledger table separator is missing or malformed");
  }

  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith("|")) break;
    const cells = splitMarkdownTableRow(line)?.map(stripCode);
    if (cells?.length !== 6) {
      throw new Error(`Malformed migration ledger row: ${line}`);
    }
    const [
      sourcePath,
      sourceCommit,
      destination,
      disposition,
      reviewState,
      notes,
    ] = cells;
    rows.push({
      sourcePath,
      sourceCommit,
      destination,
      disposition,
      reviewState,
      notes,
    });
  }
  return rows;
}

export function validateMigrationCoverage(sourcePages, ledgerRows, options = {}) {
  if (!Array.isArray(sourcePages) || !Array.isArray(ledgerRows)) {
    return ["migration coverage requires source-page and ledger-row arrays"];
  }

  const errors = [];
  const allowedDispositions = new Set([
    "preserved-policy",
    "contract-rewrite",
    "redirect-only",
    "omitted",
  ]);
  const allowedReviewStates = new Set(["review-required", "not-applicable"]);
  const expectedDecisions =
    options.expectedDecisions ?? FROZEN_MIGRATION_DECISIONS;
  const sourceSet = new Set(sourcePages);
  const rowCounts = new Map();

  for (const row of ledgerRows) {
    const sourcePath = row?.sourcePath;
    if (typeof sourcePath !== "string" || sourcePath === "") {
      errors.push("migration ledger row is missing a source path");
      continue;
    }
    rowCounts.set(sourcePath, (rowCounts.get(sourcePath) ?? 0) + 1);

    if (!sourceSet.has(sourcePath)) {
      errors.push(`unexpected migration ledger row ${sourcePath}`);
    }
    if (row.sourceCommit !== SOURCE_COMMIT) {
      errors.push(`${sourcePath}: source commit must be ${SOURCE_COMMIT}`);
    }
    if (!allowedDispositions.has(row.disposition)) {
      errors.push(`${sourcePath}: invalid disposition ${row.disposition}`);
    }
    if (!allowedReviewStates.has(row.reviewState)) {
      errors.push(`${sourcePath}: invalid review state ${row.reviewState}`);
    }

    const expectedDecision = expectedDecisions?.[sourcePath];
    if (expectedDecision) {
      if (row.destination !== expectedDecision.destination) {
        errors.push(
          `${sourcePath}: destination must remain ${expectedDecision.destination}`,
        );
      }
      if (row.disposition !== expectedDecision.disposition) {
        errors.push(
          `${sourcePath}: disposition must remain ${expectedDecision.disposition}`,
        );
      }
      if (row.reviewState !== expectedDecision.reviewState) {
        errors.push(
          `${sourcePath}: review state must remain ${expectedDecision.reviewState}`,
        );
      }
    }

    if (
      row.disposition === "preserved-policy" &&
      row.reviewState !== "review-required"
    ) {
      errors.push(`${sourcePath}: preserved policy must be review-required`);
    }
    if (
      row.disposition !== "preserved-policy" &&
      row.reviewState !== "not-applicable"
    ) {
      errors.push(`${sourcePath}: ${row.disposition} must be not-applicable`);
    }

    const isTerms = sourcePath.startsWith("content/t-c/");
    if (isTerms) {
      if (row.disposition !== "omitted") {
        errors.push(`${sourcePath}: Terms page must be omitted`);
      }
      if (row.destination !== "—") {
        errors.push(`${sourcePath}: omitted Terms page destination must be —`);
      }
    } else if (row.disposition === "omitted") {
      if (row.destination !== "—") {
        errors.push(`${sourcePath}: omitted page destination must be —`);
      }
    } else if (!row.destination?.startsWith("/")) {
      errors.push(`${sourcePath}: destination must be a root-relative route`);
    }

    if (
      sourcePath === "content/compliance/merchant-onboarding.mdx" &&
      row.disposition !== "redirect-only"
    ) {
      errors.push(`${sourcePath}: moved stub must be redirect-only`);
    }
  }

  for (const sourcePath of sourcePages) {
    const count = rowCounts.get(sourcePath) ?? 0;
    if (count === 0) {
      errors.push(`missing migration ledger row for ${sourcePath}`);
    } else if (count > 1) {
      errors.push(`duplicate migration ledger row for ${sourcePath}`);
    }
  }

  if (Array.isArray(options.redirects)) {
    const redirectsBySource = new Map();
    for (const redirect of options.redirects) {
      if (!redirectsBySource.has(redirect.source)) {
        redirectsBySource.set(redirect.source, []);
      }
      redirectsBySource.get(redirect.source).push(redirect);
    }

    for (const sourcePath of sourcePages) {
      const route = sourcePathToRoute(sourcePath);
      const redirects = redirectsBySource.get(route) ?? [];
      const shouldRedirect = isRedirectSourcePage(sourcePath);
      if (shouldRedirect && redirects.length === 0) {
        errors.push(`${sourcePath}: missing redirect for ${route}`);
      }
      if (!shouldRedirect && redirects.length > 0) {
        errors.push(`${sourcePath}: unexpected redirect for ${route}`);
      }
      if (redirects.length > 1) {
        errors.push(`${sourcePath}: duplicate redirects for ${route}`);
      }
    }
  }

  return sortedErrors(errors);
}

function escapeJsonPointer(segment) {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function collectJsonStrings(
  value,
  pointer = "",
  output = [],
  ancestors = new WeakSet(),
) {
  if (typeof value === "string") {
    output.push({ pointer: pointer || "/", value });
    return output;
  }
  if (!value || typeof value !== "object") return output;
  if (ancestors.has(value)) return output;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        collectJsonStrings(item, `${pointer}/${index}`, output, ancestors),
      );
    } else {
      for (const key of Object.keys(value).sort(compareStrings)) {
        collectJsonStrings(
          value[key],
          `${pointer}/${escapeJsonPointer(key)}`,
          output,
          ancestors,
        );
      }
    }
  } finally {
    ancestors.delete(value);
  }
  return output;
}

export function validatePublishedJsonStrings(path, value) {
  const errors = [];
  for (const { pointer, value: stringValue } of collectJsonStrings(value)) {
    errors.push(
      ...validatePublishedText(`${path}#${pointer}`, stringValue, {
        checkCodeFences: false,
      }),
    );
  }
  return sortedErrors(errors);
}
