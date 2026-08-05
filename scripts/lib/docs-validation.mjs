export const SOURCE_COMMIT =
  "b4c9b5b7101ec03e01424259f58a5c8763ea489b";

export const REQUIRED_NAVIGATION_PAGES = Object.freeze([
  "integration/overview",
  "integration/quickstart",
  "integration/starter-kit",
  "integration/authentication",
  "integration/environments",
  "integration/using-the-api-reference",
  "integration/request-safety",
  "integration/errors",
  "integration/pagination-and-sync",
  "integration/onboarding/individuals",
  "integration/onboarding/businesses",
  "integration/onboarding/tasks-and-submissions",
  "integration/onboarding/documents",
  "integration/accounts",
  "integration/recipients",
  "integration/quotes-and-transfers",
  "integration/receive-funds",
  "integration/send-funds",
  "integration/rules",
  "integration/webhooks",
  "integration/sandbox",
  "integration/production-readiness",
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

export const FROZEN_SOURCE_PAGES = Object.freeze([
  "content/business-onboarding/documents.mdx",
  "content/business-onboarding/entity-types.mdx",
  "content/business-onboarding/faq.mdx",
  "content/business-onboarding/index.mdx",
  "content/business-onboarding/shareholders.mdx",
  "content/business-onboarding/workflow.mdx",
  "content/compliance/general-information.mdx",
  "content/compliance/governance.mdx",
  "content/compliance/index.mdx",
  "content/compliance/jurisdiction-framework.mdx",
  "content/compliance/limits.mdx",
  "content/compliance/merchant-onboarding.mdx",
  "content/compliance/payment-methods.mdx",
  "content/compliance/screening-monitoring.mdx",
  "content/compliance/supported-verticals.mdx",
  "content/compliance/travel-rule.mdx",
  "content/compliance/wallet-architecture.mdx",
  "content/concepts/accounts.mdx",
  "content/concepts/customers.mdx",
  "content/concepts/index.mdx",
  "content/concepts/quotes.mdx",
  "content/concepts/rails.mdx",
  "content/concepts/recipients.mdx",
  "content/concepts/wallets.mdx",
  "content/concepts/webhooks.mdx",
  "content/get-started/api-reference.mdx",
  "content/get-started/authentication.mdx",
  "content/get-started/index.mdx",
  "content/get-started/sandbox.mdx",
  "content/get-started/starter-kit.mdx",
  "content/index.mdx",
  "content/individual-onboarding/api-reference.mdx",
  "content/individual-onboarding/index.mdx",
  "content/individual-onboarding/status-workflow.mdx",
  "content/individual-onboarding/verification-levels.mdx",
  "content/onboarding/businesses.mdx",
  "content/onboarding/index.mdx",
  "content/onboarding/individuals.mdx",
  "content/onboarding/shareholders-and-documents.mdx",
  "content/receive/index.mdx",
  "content/receive/pooled-payins.mdx",
  "content/receive/virtual-accounts.mdx",
  "content/reference/endpoint-map.mdx",
  "content/reference/rates.mdx",
  "content/reference/supported-rails.mdx",
  "content/reference/v3-blockchain-networks.mdx",
  "content/reference/v3-fee-schedule.mdx",
  "content/reference/v3-method-coverage.mdx",
  "content/reference/v3-reason-codes.mdx",
  "content/reference/webhooks.mdx",
  "content/send/first-party-payouts.mdx",
  "content/send/index.mdx",
  "content/send/recipient-payouts.mdx",
  "content/t-c/creating-customer.mdx",
  "content/t-c/implementation.mdx",
  "content/t-c/incorporating-terms.mdx",
  "content/t-c/index.mdx",
  "content/t-c/updates.mdx",
  "content/transfers/index.mdx",
]);

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

export const EXPECTED_REDIRECT_SOURCES = Object.freeze(
  FROZEN_SOURCE_PAGES.filter(isRedirectSourcePage)
    .map(sourcePathToRoute)
    .sort(compareStrings),
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
  "/get-started/api-reference": "/integration/using-the-api-reference",
  "/get-started/authentication": "/integration/authentication",
  "/get-started/sandbox": "/integration/sandbox",
  "/get-started/starter-kit": "/integration/starter-kit",
  "/individual-onboarding":
    "/knowledge-base/individual-onboarding/overview",
  "/individual-onboarding/api-reference":
    "/integration/onboarding/individuals",
  "/individual-onboarding/status-workflow":
    "/knowledge-base/individual-onboarding/status-and-workflow",
  "/individual-onboarding/verification-levels":
    "/knowledge-base/individual-onboarding/verification-levels",
  "/onboarding": "/integration/onboarding/individuals",
  "/onboarding/businesses": "/integration/onboarding/businesses",
  "/onboarding/individuals": "/integration/onboarding/individuals",
  "/onboarding/shareholders-and-documents":
    "/integration/onboarding/documents",
  "/receive": "/integration/receive-funds",
  "/receive/pooled-payins": "/integration/receive-funds",
  "/receive/virtual-accounts": "/integration/receive-funds",
  "/reference/endpoint-map": "/integration/using-the-api-reference",
  "/reference/rates": "/api-reference/money-movement/get-v3-rates",
  "/reference/supported-rails": "/integration/overview",
  "/reference/v3-blockchain-networks": "/integration/accounts",
  "/reference/v3-fee-schedule": "/integration/quotes-and-transfers",
  "/reference/v3-method-coverage": "/integration/overview",
  "/reference/v3-reason-codes": "/integration/errors",
  "/reference/webhooks": "/integration/webhooks",
  "/send": "/integration/send-funds",
  "/send/first-party-payouts": "/integration/send-funds",
  "/send/recipient-payouts": "/integration/send-funds",
  "/transfers": "/integration/quotes-and-transfers",
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
  return String(path).replaceAll("\\", "/").replace(/^\.\//, "");
}

export function isPublishedPath(path) {
  const normalized = normalizePath(path).split("#", 1)[0];
  return (
    normalized === "index.mdx" ||
    normalized === "docs.json" ||
    normalized === "openapi.json" ||
    /^integration\/.+\.mdx$/.test(normalized) ||
    /^knowledge-base\/.+\.mdx$/.test(normalized)
  );
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  if (["null", "~"].includes(trimmed.toLowerCase())) return "";
  return trimmed;
}

export function parseFrontmatter(text) {
  const normalized = String(text).replaceAll("\r\n", "\n");
  const lines = normalized.split("\n");
  const errors = [];
  const attributes = {};

  if (lines[0]?.trim() !== "---") {
    return {
      attributes,
      body: normalized,
      errors: ["missing opening frontmatter delimiter"],
    };
  }

  const closingIndex = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---",
  );
  if (closingIndex === -1) {
    return {
      attributes,
      body: "",
      errors: ["missing closing frontmatter delimiter"],
    };
  }

  const frontmatterLines = lines.slice(1, closingIndex);
  for (let index = 0; index < frontmatterLines.length; index += 1) {
    const line = frontmatterLines[index];
    const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(line);
    if (!match) continue;

    const [, key, rawValue = ""] = match;
    if (["|", ">", "|-", ">-", "|+", ">+"].includes(rawValue.trim())) {
      const block = [];
      while (
        index + 1 < frontmatterLines.length &&
        /^\s+/.test(frontmatterLines[index + 1])
      ) {
        index += 1;
        block.push(frontmatterLines[index].trim());
      }
      attributes[key] = block.join(" ").trim();
    } else {
      attributes[key] = unquote(rawValue);
    }
  }

  return {
    attributes,
    body: lines.slice(closingIndex + 1).join("\n"),
    errors,
  };
}

export function validateFrontmatter(path, text) {
  const { attributes, errors: parseErrors } = parseFrontmatter(text);
  const errors = parseErrors.map((error) => `${path}: ${error}`);

  if (!attributes.title?.trim()) {
    errors.push(`${path}: missing title frontmatter`);
  }
  if (!attributes.description?.trim()) {
    errors.push(`${path}: missing description frontmatter`);
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
    const match = /^\s*(`{3,}|~{3,})(.*)$/.exec(lines[index]);
    if (!match) continue;

    const [, marker, remainder] = match;
    if (openFence) {
      if (
        marker[0] === openFence.character &&
        marker.length >= openFence.length &&
        remainder.trim() === ""
      ) {
        openFence = undefined;
      }
      continue;
    }

    if (remainder.trim() === "") {
      errors.push(
        `${path}:${index + 1}: code fence is missing a language tag`,
      );
    }
    openFence = { character: marker[0], length: marker.length };
  }

  return errors;
}

export function validatePublishedText(path, text, options = {}) {
  if (!isPublishedPath(path)) return [];

  const errors = [];
  const value = String(text);
  const bannedPatterns = [
    { pattern: /\/v1\//i, label: "prohibited /v1/ route" },
    { pattern: /\/v2\//i, label: "prohibited /v2/ route" },
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
  const checkCodeFences =
    options.checkCodeFences ?? normalized.endsWith(".mdx");
  if (checkCodeFences) errors.push(...validateCodeFences(path, value));

  return sortedErrors(errors);
}

function normalizeNavigationPage(page) {
  const normalized = String(page)
    .replaceAll("\\", "/")
    .replace(/^\//, "")
    .replace(/\.mdx$/, "")
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

  const apiTabs = findObjects(
    navigation,
    (value) => value.tab === "API Reference",
  );
  if (apiTabs.length !== 1 || apiTabs[0]?.openapi !== "openapi.json") {
    errors.push(
      "docs.json: API Reference navigation must use openapi.json exactly once",
    );
  }

  return sortedErrors(errors);
}

export function validateRedirectInventory(inventory, options = {}) {
  if (!Array.isArray(inventory)) {
    return ["docs/redirect-inventory.json: inventory must be a JSON array"];
  }

  const errors = [];
  const expectedSources = options.expectedSources ?? EXPECTED_REDIRECT_SOURCES;
  const knownDestinations = options.knownDestinations;
  const expectedDestinations = options.expectedDestinations;
  const sourceCounts = new Map();
  const allowedKeys = ["destination", "reason", "source", "verified"];

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
    } else if (knownDestinations && !knownDestinations.has(destination)) {
      errors.push(`${location}: unknown destination ${destination}`);
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      errors.push(`${location}: reason must be a non-empty string`);
    }
    if (verified !== false) {
      errors.push(`${location}: verified must be false before preview checks`);
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

  const rows = [];
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.trim().startsWith("|")) break;
    const cells = line
      .trim()
      .slice(1, -1)
      .split("|")
      .map(stripCode);
    if (cells.length !== 6) {
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

export function collectJsonStrings(value, pointer = "", output = []) {
  if (typeof value === "string") {
    output.push({ pointer: pointer || "/", value });
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectJsonStrings(item, `${pointer}/${index}`, output),
    );
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const key of Object.keys(value).sort(compareStrings)) {
    collectJsonStrings(
      value[key],
      `${pointer}/${escapeJsonPointer(key)}`,
      output,
    );
  }
  return output;
}
