import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  FORBIDDEN_GENERATED_TERMS,
  INTERNAL_ONLY_PROBLEM_CODES,
  assertNoForbiddenGeneratedTerms,
  buildErrorIndex,
  buildErrorModels,
  buildErrorRedirects,
  renderErrorsPage,
  updateDocsConfig,
  updateRedirectInventory,
} from "../scripts/lib/errors.mjs";

const read = (path) => readFileSync(path, "utf8");
const readJson = (path) => JSON.parse(read(path));
const openapi = readJson("openapi.json");
const provenance = readJson("openapi-provenance.json");
const guidance = readJson("scripts/data/error-guidance.json");
const docsConfig = readJson("docs.json");
const redirectInventory = readJson("docs/redirect-inventory.json");
const generatedIndex = readJson("scripts/data/errors-index.json");
const page = read("integration/errors.mdx");
const { catalog } = buildErrorModels(openapi, guidance);

function count(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

function explicitAnchorPattern(entry) {
  return new RegExp(
    `<a id="${entry.slug}" className="block scroll-mt-32">\\n  <span className="sr-only">${entry.code} error</span>\\n</a>`,
    "g",
  );
}

function publicMdxFiles(directory = ".") {
  const ignored = new Set([
    ".git",
    ".mintlify",
    ".worktrees",
    "docs",
    "node_modules",
    "scripts",
    "tests",
  ]);
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...publicMdxFiles(path));
    else if (entry.isFile() && extname(entry.name) === ".mdx") files.push(path);
  }
  return files;
}

test("every public problem has documentation guidance", () => {
  const catalogCodes = catalog.map(({ code }) => code).sort();
  const guidanceCodes = Object.keys(guidance).sort();
  assert.deepEqual(guidanceCodes, catalogCodes);
});

test("guidance contains no unknown problem codes", () => {
  const catalogCodes = new Set(catalog.map(({ code }) => code));
  assert.deepEqual(
    Object.keys(guidance).filter((code) => !catalogCodes.has(code)),
    [],
  );
});

test("every problem code has exactly one explicit page anchor and heading", () => {
  for (const entry of catalog) {
    assert.equal(
      count(page, explicitAnchorPattern(entry)),
      1,
      `${entry.code} anchor`,
    );
    assert.equal(
      count(
        page,
        new RegExp(`^### ${String.fromCharCode(96)}${entry.code}${String.fromCharCode(96)}$`, "gm"),
      ),
      1,
      `${entry.code} heading`,
    );
  }
});

test("every problem type URI has one matching generated redirect", () => {
  const aliases = docsConfig.redirects.filter(({ source }) =>
    source.startsWith("/errors/"),
  );
  assert.equal(aliases.length, catalog.length);
  for (const entry of catalog) {
    const source = new URL(entry.type).pathname;
    const matches = aliases.filter((redirect) => redirect.source === source);
    assert.deepEqual(matches, [
      {
        source,
        destination: `/integration/errors#${entry.slug}`,
      },
    ]);
  }
});

test("every generated redirect points to an existing explicit anchor", () => {
  for (const redirect of docsConfig.redirects.filter(({ source }) =>
    source.startsWith("/errors/"),
  )) {
    const [path, fragment] = redirect.destination.split("#");
    assert.equal(path, "/integration/errors");
    assert.ok(fragment, `${redirect.source} must include a fragment`);
    const entry = catalog.find((problem) => problem.slug === fragment);
    assert.ok(entry, `${redirect.source} must target a cataloged anchor`);
    assert.match(page, explicitAnchorPattern(entry));
  }
});

test("problem slugs and anchors use kebab-case", () => {
  for (const entry of catalog) {
    assert.match(entry.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(entry.slug, entry.code.replaceAll("_", "-"));
    if (entry.code.includes("_")) {
      assert.ok(!page.includes(`<a id="${entry.code}">`));
    }
  }
});

test("internal-only problem codes do not appear in public artifacts", () => {
  const publicText = `${page}\n${JSON.stringify(generatedIndex)}\n${JSON.stringify(
    catalog,
  )}`;
  for (const code of INTERNAL_ONLY_PROBLEM_CODES) {
    assert.ok(!publicText.includes(code), code);
  }
});

test("public examples use stable /errors/ problem type URIs", () => {
  for (const path of [...publicMdxFiles(), "openapi.json"]) {
    assert.doesNotMatch(
      read(path),
      /https:\/\/docs\.swipelux\.com\/problems\//,
      path,
    );
  }
});

test("generated errors artifacts are current", () => {
  const result = spawnSync(process.execPath, ["scripts/generate-errors.mjs", "--check"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("errors generation is deterministic", () => {
  const firstPage = renderErrorsPage(openapi, guidance);
  const secondPage = renderErrorsPage(openapi, guidance);
  assert.equal(secondPage, firstPage);

  const redirects = buildErrorRedirects(catalog);
  assert.deepEqual(buildErrorRedirects(catalog), redirects);
  assert.deepEqual(
    updateDocsConfig(docsConfig, redirects),
    updateDocsConfig(docsConfig, redirects),
  );
  assert.deepEqual(
    updateRedirectInventory(redirectInventory, redirects),
    updateRedirectInventory(redirectInventory, redirects),
  );
  assert.deepEqual(
    buildErrorIndex(provenance, catalog, guidance),
    buildErrorIndex(provenance, catalog, guidance),
  );
});

test("generated errors content excludes provider names and internal terms", () => {
  assert.doesNotThrow(() => assertNoForbiddenGeneratedTerms(page));
  const normalized = page.toLowerCase();
  for (const term of FORBIDDEN_GENERATED_TERMS) {
    assert.ok(!normalized.includes(term), term);
  }
});
