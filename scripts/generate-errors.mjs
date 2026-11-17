#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertNoForbiddenGeneratedTerms,
  buildErrorIndex,
  buildErrorModels,
  buildErrorRedirects,
  formattedJson,
  renderErrorsPage,
  updateDocsConfig,
  updateRedirectInventory,
} from "./lib/errors.mjs";

const root = process.cwd();
const check = process.argv.slice(2).includes("--check");

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function readText(path) {
  return readFileSync(resolve(root, path), "utf8");
}

const openapi = readJson("openapi.json");
const provenance = readJson("openapi-provenance.json");
const guidance = readJson("scripts/data/error-guidance.json");
const docsConfig = readJson("docs.json");
const redirectInventory = readJson("docs/redirect-inventory.json");
const { catalog } = buildErrorModels(openapi, guidance);
const redirects = buildErrorRedirects(catalog);
const errorsPage = renderErrorsPage(openapi, guidance);
const index = buildErrorIndex(provenance, catalog, guidance);
const generatedDocsConfig = updateDocsConfig(docsConfig, redirects);
const generatedInventory = updateRedirectInventory(
  redirectInventory,
  redirects,
);

assertNoForbiddenGeneratedTerms(errorsPage);

const artifacts = new Map([
  ["integration/errors.mdx", errorsPage],
  ["scripts/data/errors-index.json", formattedJson(index)],
  ["docs.json", formattedJson(generatedDocsConfig)],
  ["docs/redirect-inventory.json", formattedJson(generatedInventory)],
]);

const stale = [];
for (const [path, expected] of artifacts) {
  const absolute = resolve(root, path);
  if (check) {
    let actual;
    try {
      actual = readText(path);
    } catch {
      actual = undefined;
    }
    if (actual !== expected) stale.push(path);
  } else {
    writeFileSync(absolute, expected);
  }
}

if (stale.length > 0) {
  console.error(`Generated errors artifacts are stale: ${stale.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log(
    `${check ? "Verified" : "Generated"} ${catalog.length} errors and ${redirects.length} redirects from x-swipelux-problems`,
  );
}
