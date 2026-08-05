#!/usr/bin/env node

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

import {
  APPROVED_REDIRECT_DESTINATIONS,
  EXPECTED_REDIRECT_SOURCES,
  FROZEN_SOURCE_PAGES,
  REQUIRED_NAVIGATION_PAGES,
  REQUIRED_PUBLISHED_PAGES,
  collectJsonStrings,
  parseMigrationLedger,
  validateFrontmatter,
  validateMigrationCoverage,
  validateNavigation,
  validatePublishedText,
  validateRedirectInventory,
} from "./lib/docs-validation.mjs";

const rootDir = process.cwd();
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

function pageFile(page) {
  return page === "index" ? "index.mdx" : `${page}.mdx`;
}

function pageExists(page) {
  return existsSync(projectPath(pageFile(page)));
}

function listMdx(directory) {
  const absolute = projectPath(directory);
  if (!existsSync(absolute)) return [];

  const files = [];
  for (const entry of readdirSync(absolute).sort()) {
    const path = join(absolute, entry);
    if (statSync(path).isDirectory()) {
      files.push(...listMdx(relative(rootDir, path)));
    } else if (entry.endsWith(".mdx")) {
      files.push(relative(rootDir, path).replaceAll("\\", "/"));
    }
  }
  return files;
}

function add(findings) {
  errors.push(...findings);
}

for (const page of REQUIRED_PUBLISHED_PAGES) {
  const path = pageFile(page);
  if (!existsSync(projectPath(path))) {
    errors.push(`${path}: missing required published page`);
  }
}

const publishedMdx = [
  ...(existsSync(projectPath("index.mdx")) ? ["index.mdx"] : []),
  ...listMdx("integration"),
  ...listMdx("knowledge-base"),
].sort();

for (const path of publishedMdx) {
  const text = readText(path);
  add(validateFrontmatter(path, text));
  add(validatePublishedText(path, text));
}

const docsConfig = readJson("docs.json");
if (docsConfig) {
  add(validatePublishedText("docs.json", readText("docs.json"), {
    checkCodeFences: false,
  }));
  add(
    validateNavigation(docsConfig, {
      pageExists,
      requiredPages: REQUIRED_NAVIGATION_PAGES,
    }),
  );
}

const openapi = readJson("openapi.json");
if (openapi) {
  for (const { pointer, value } of collectJsonStrings(openapi)) {
    add(
      validatePublishedText(`openapi.json#${pointer}`, value, {
        checkCodeFences: false,
      }),
    );
  }
}

const coverage = readJson("openapi-coverage.json");
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
      expectedSources: EXPECTED_REDIRECT_SOURCES,
      expectedDestinations: APPROVED_REDIRECT_DESTINATIONS,
      knownDestinations,
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
