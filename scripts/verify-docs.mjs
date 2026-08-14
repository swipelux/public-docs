#!/usr/bin/env node

import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

import {
  APPROVED_REDIRECT_DESTINATIONS,
  EXPECTED_REDIRECT_SOURCES,
  FROZEN_SOURCE_PAGES,
  REQUIRED_NAVIGATION_PAGES,
  REQUIRED_PUBLISHED_PAGES,
  createMintlifyIgnoreMatcher,
  pagePathToRoute,
  parseMigrationLedger,
  parseMintIgnoreRules,
  parseRedirectVerificationPhase,
  selectPublishablePagePaths,
  validateFrontmatter,
  validateMigrationCoverage,
  validateNavigation,
  validatePublishedJsonStrings,
  validatePublishedPageInventory,
  validatePublishedText,
  validateRedirectInventory,
} from "./lib/docs-validation.mjs";

const rootDir = process.cwd();
const cliArgs = process.argv.slice(2);
let redirectPhaseMarker;
if (cliArgs.length === 0) {
  try {
    redirectPhaseMarker = JSON.parse(
      readFileSync(
        resolve(rootDir, "docs/redirect-verification-phase.json"),
        "utf8",
      ),
    );
  } catch (error) {
    console.error(
      `Redirect phase configuration error: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
}

let redirectVerificationPhase;
try {
  redirectVerificationPhase = parseRedirectVerificationPhase(
    cliArgs,
    redirectPhaseMarker,
  );
} catch (error) {
  const prefix =
    cliArgs.length === 0
      ? "Redirect phase configuration error"
      : "Argument error";
  console.error(
    `${prefix}: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(cliArgs.length === 0 ? 1 : 2);
}

const errors = [];

function projectPath(path) {
  return resolve(rootDir, path);
}

function readText(path) {
  return readFileSync(projectPath(path), "utf8");
}

function readJson(path) {
  try {
    return JSON.parse(readText(path));
  } catch (error) {
    errors.push(
      `${path}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

const mintIgnoreRules = parseMintIgnoreRules(readText(".mintignore"));
const isMintIgnored = createMintlifyIgnoreMatcher(mintIgnoreRules);

function listRepositoryFiles(directory = "") {
  const absolute = projectPath(directory);
  if (!existsSync(absolute)) return [];

  const files = [];
  const entries = readdirSync(absolute, { withFileTypes: true }).sort(
    (left, right) => {
      if (left.name < right.name) return -1;
      if (left.name > right.name) return 1;
      return 0;
    },
  );
  for (const entry of entries) {
    const path = join(absolute, entry.name);
    const relativePath = relative(rootDir, path).replaceAll("\\", "/");
    if (entry.isSymbolicLink()) {
      errors.push(`${relativePath}: symbolic link entries are not supported`);
      continue;
    }
    if (entry.isDirectory()) {
      if (isMintIgnored(`${relativePath}/`)) continue;
      files.push(...listRepositoryFiles(relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function add(findings) {
  errors.push(...findings);
}

const publishedPages = selectPublishablePagePaths(
  listRepositoryFiles(),
  mintIgnoreRules,
);
add(
  validatePublishedPageInventory(publishedPages, {
    requiredPages: REQUIRED_PUBLISHED_PAGES,
  }),
);

for (const path of publishedPages) {
  const text = readText(path);
  add(validateFrontmatter(path, text));
  add(validatePublishedText(path, text));
}

const publishedPageRoutes = new Set(publishedPages.map(pagePathToRoute));
const pageExists = (page) => publishedPageRoutes.has(page);

const docsConfig = readJson("docs.json");
if (docsConfig) {
  add(validatePublishedJsonStrings("docs.json", docsConfig));
  add(
    validateNavigation(docsConfig, {
      pageExists,
      requiredPages: REQUIRED_NAVIGATION_PAGES,
    }),
  );
}

const openapi = readJson("openapi.json");
if (openapi) {
  add(validatePublishedJsonStrings("openapi.json", openapi));
}

const coverage = readJson("openapi-coverage.json");
const generatedErrorRedirects = Array.isArray(
  openapi?.["x-swipelux-problems"],
)
  ? openapi["x-swipelux-problems"].map(({ slug }) => ({
      source: `/errors/${slug}`,
      destination: `/integration/errors#${slug}`,
    }))
  : [];
const generatedErrorDestinations = Object.fromEntries(
  generatedErrorRedirects.map(({ source, destination }) => [source, destination]),
);
const knownDestinations = new Set([
  "/",
  ...REQUIRED_NAVIGATION_PAGES.map((page) => `/${page}`),
  ...(coverage?.operations ?? []).map(({ href }) => href),
  ...(coverage?.webhooks ?? []).map(({ href }) => href),
]);

const redirects = readJson("docs/redirect-inventory.json");
if (redirects) {
  add(
    validateRedirectInventory(redirects, {
      expectedSources: [
        ...EXPECTED_REDIRECT_SOURCES,
        ...generatedErrorRedirects.map(({ source }) => source),
      ].sort(),
      expectedDestinations: {
        ...APPROVED_REDIRECT_DESTINATIONS,
        ...generatedErrorDestinations,
      },
      knownDestinations,
      verificationPhase: redirectVerificationPhase,
    }),
  );
}

let ledger;
if (existsSync(projectPath("docs/content-migration-ledger.md"))) {
  try {
    ledger = parseMigrationLedger(readText("docs/content-migration-ledger.md"));
  } catch (error) {
    errors.push(
      `docs/content-migration-ledger.md: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
} else {
  errors.push("docs/content-migration-ledger.md: missing migration ledger");
}

if (ledger) {
  add(
    validateMigrationCoverage(FROZEN_SOURCE_PAGES, ledger, {
      redirects: Array.isArray(redirects) ? redirects : [],
    }),
  );
}

const findings = [...new Set(errors)].sort();
if (findings.length > 0) {
  console.error(`Documentation verification failed (${findings.length} findings):`);
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else {
  console.log(
    `Documentation verification passed: ${REQUIRED_PUBLISHED_PAGES.length} pages, ${EXPECTED_REDIRECT_SOURCES.length} redirects, ${FROZEN_SOURCE_PAGES.length} source pages`,
  );
}
