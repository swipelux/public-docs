import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { generateOpenApiPages } from "@mintlify/common";

import {
  APPROVED_REDIRECT_DESTINATIONS,
  EXPECTED_REDIRECT_SOURCES,
  FROZEN_MIGRATION_DECISIONS,
  FROZEN_SOURCE_PAGES,
  REQUIRED_PUBLISHED_PAGES,
  SOURCE_COMMIT,
  parseMigrationLedger,
  sourcePathToRoute,
} from "../scripts/lib/docs-validation.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function readProjectFile(path) {
  return readFileSync(resolve(projectRoot, path), "utf8");
}

function readProjectJson(path) {
  return JSON.parse(readProjectFile(path));
}

const config = readProjectJson("docs.json");
const coverage = readProjectJson("openapi-coverage.json");
const inventory = readProjectJson("docs/redirect-inventory.json");
const openapi = readProjectJson("openapi.json");
const phase = readProjectJson("docs/redirect-verification-phase.json");
const ledger = parseMigrationLedger(
  readProjectFile("docs/content-migration-ledger.md"),
);

const STRUCTURE_REDIRECTS = {
  "/integration/environments":
    "/integration/authentication#sandbox-and-production",
  "/integration/errors": "/integration/api-reliability#handle-errors",
  "/integration/pagination-and-sync":
    "/integration/sync-and-reconciliation",
  "/integration/request-safety": "/integration/api-reliability",
  "/integration/using-the-api-reference": "/api-reference",
  "/integration/onboarding/individuals":
    "/integration/onboarding/customers#individual-customers",
  "/integration/onboarding/businesses":
    "/integration/onboarding/customers#business-customers",
  "/integration/onboarding/tasks-and-submissions":
    "/integration/onboarding/capabilities-and-requirements#complete-requirements",
  "/integration/onboarding/documents":
    "/integration/onboarding/capabilities-and-requirements#upload-documents",
};

function publishedRoute(page) {
  return page === "index" ? "/" : `/${page}`;
}

function markdownFiles(directory = projectRoot, prefix = "") {
  const files = [];
  const entries = readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const projectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...markdownFiles(absolutePath, projectPath));
    } else if (entry.isFile() && /\.mdx?$/i.test(entry.name)) {
      files.push(projectPath);
    }
  }

  return files;
}

function generatedPageKey(page) {
  return page.method === "webhook"
    ? `webhook ${page.path}`
    : `${page.method} ${page.path}`;
}

function coverageEntryKey(entry, kind) {
  return kind === "webhook"
    ? `webhook ${entry.name}`
    : `${entry.method} ${entry.path}`;
}

function generatedOpenApiPages() {
  return generateOpenApiPages({ spec: openapi, specFilePath: "openapi.json" });
}

test("every frozen source page has exactly one approved migration row", () => {
  assert.equal(FROZEN_SOURCE_PAGES.length, 59);
  assert.equal(ledger.length, FROZEN_SOURCE_PAGES.length);

  const rowsBySource = new Map();
  for (const row of ledger) {
    const rows = rowsBySource.get(row.sourcePath) ?? [];
    rows.push(row);
    rowsBySource.set(row.sourcePath, rows);
  }

  for (const sourcePath of FROZEN_SOURCE_PAGES) {
    const rows = rowsBySource.get(sourcePath) ?? [];
    assert.equal(rows.length, 1, `${sourcePath} must have exactly one ledger row`);
    const approved = FROZEN_MIGRATION_DECISIONS[sourcePath];
    assert.deepEqual(
      {
        sourceCommit: rows[0].sourceCommit,
        destination: rows[0].destination,
        disposition: rows[0].disposition,
        reviewState: rows[0].reviewState,
      },
      {
        sourceCommit: SOURCE_COMMIT,
        destination: approved.destination,
        disposition: approved.disposition,
        reviewState: approved.reviewState,
      },
      `${sourcePath} must retain its approved migration decision`,
    );
  }
});

test("every approved redirect source has one direct redirect and root has none", () => {
  assert.equal(EXPECTED_REDIRECT_SOURCES.length, 62);
  assert.equal(inventory.length, EXPECTED_REDIRECT_SOURCES.length);

  const redirectsBySource = new Map();
  for (const redirect of inventory) {
    const redirects = redirectsBySource.get(redirect.source) ?? [];
    redirects.push(redirect);
    redirectsBySource.set(redirect.source, redirects);
  }

  for (const source of EXPECTED_REDIRECT_SOURCES) {
    const redirects = redirectsBySource.get(source) ?? [];
    assert.equal(redirects.length, 1, `${source} must have exactly one redirect`);
    assert.equal(
      redirects[0].destination,
      APPROVED_REDIRECT_DESTINATIONS[source],
      `${source} must retain its approved redirect destination`,
    );
  }

  assert.equal(redirectsBySource.has("/"), false, "root must not redirect");
  const nonTermsSources = FROZEN_SOURCE_PAGES.filter(
    (sourcePath) => !sourcePath.startsWith("content/t-c/"),
  );
  for (const sourcePath of nonTermsSources) {
    const route = sourcePathToRoute(sourcePath);
    const expectedCount = route === "/" ? 0 : 1;
    assert.equal(
      redirectsBySource.get(route)?.length ?? 0,
      expectedCount,
      `${sourcePath} must have ${expectedCount} approved redirect(s)`,
    );
  }
});

test("docs.json redirects exactly match the approved inventory pairs", () => {
  assert.deepEqual(
    config.redirects,
    inventory.map(({ source, destination }) => ({ source, destination })),
  );
});

test("retired Integration routes and legacy sources resolve without redirect chains", () => {
  const destinations = new Map(
    inventory.map(({ source, destination }) => [source, destination]),
  );
  for (const [source, destination] of Object.entries(STRUCTURE_REDIRECTS)) {
    assert.equal(destinations.get(source), destination);
  }

  const sources = new Set(inventory.map(({ source }) => source));
  for (const { source, destination } of inventory) {
    const destinationPath = destination.split("#", 1)[0];
    assert.equal(
      sources.has(destinationPath),
      false,
      `${source} must redirect directly instead of chaining through ${destinationPath}`,
    );
  }
});

test("Terms routes have no redirects", () => {
  assert.deepEqual(
    inventory.filter(
      ({ source }) => source === "/t-c" || source.startsWith("/t-c/"),
    ),
    [],
  );
  assert.deepEqual(
    config.redirects.filter(
      ({ source }) => source === "/t-c" || source.startsWith("/t-c/"),
    ),
    [],
  );
});

test("redirect verification is committed in the final phase", () => {
  assert.deepEqual(phase, { phase: "final" });
});

test("every redirect inventory entry is verified", () => {
  const unverified = inventory.filter(({ verified }) => verified !== true);
  assert.equal(
    unverified.length,
    0,
    `Found ${unverified.length} false verified flags across ${inventory.length} redirects`,
  );
});

test("every operation-labelled Markdown/MDX link uses its exact coverage href", () => {
  const operationByLabel = new Map(
    coverage.operations.map((entry) => [
      `${entry.method.toUpperCase()} ${entry.path}`,
      entry,
    ]),
  );
  const linkPattern =
    /\[`(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE) (\/v3\/[^`\n]+)`\]\(([^)\s]+)\)/g;
  let linkCount = 0;

  for (const path of markdownFiles()) {
    const text = readProjectFile(path);
    for (const match of text.matchAll(linkPattern)) {
      linkCount += 1;
      const label = `${match[1]} ${match[2]}`;
      const entry = operationByLabel.get(label);
      assert.ok(entry, `${path} links unknown operation ${label}`);
      assert.equal(
        match[3],
        entry.href,
        `${path} must link ${label} to its exact coverage href`,
      );
    }
  }

  assert.ok(linkCount > 0, "expected operation-labelled Markdown/MDX links");
});

test("every webhook-labelled Markdown/MDX link uses its exact coverage href", () => {
  const webhookByName = new Map(
    coverage.webhooks.map((entry) => [entry.name, entry]),
  );
  const linkPattern =
    /\[`([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)`\]\(([^)\s]+)\)/g;
  let linkCount = 0;

  for (const path of markdownFiles()) {
    const text = readProjectFile(path);
    for (const match of text.matchAll(linkPattern)) {
      linkCount += 1;
      const entry = webhookByName.get(match[1]);
      assert.ok(entry, `${path} links unknown webhook ${match[1]}`);
      assert.equal(
        match[2],
        entry.href,
        `${path} must link ${match[1]} to its exact coverage href`,
      );
    }
  }

  assert.ok(linkCount > 0, "expected webhook-labelled Markdown/MDX links");
});

test("the pinned Mintlify generator emits every exact coverage href", () => {
  const pages = generatedOpenApiPages();
  const generatedByKey = new Map();
  for (const page of pages) {
    const key = generatedPageKey(page);
    assert.equal(generatedByKey.has(key), false, `duplicate generated page ${key}`);
    generatedByKey.set(key, page);
  }

  const expectedEntries = [
    ...coverage.operations.map((entry) => ({ kind: "operation", entry })),
    ...coverage.webhooks.map((entry) => ({ kind: "webhook", entry })),
  ];
  assert.equal(pages.length, expectedEntries.length);
  assert.deepEqual(
    [...generatedByKey.keys()].sort(),
    expectedEntries
      .map(({ kind, entry }) => coverageEntryKey(entry, kind))
      .sort(),
  );

  const mismatches = [];
  for (const { kind, entry } of expectedEntries) {
    const key = coverageEntryKey(entry, kind);
    const operation =
      kind === "webhook"
        ? openapi.webhooks?.[entry.name]?.post
        : openapi.paths?.[entry.path]?.[entry.method];
    const page = generatedByKey.get(key);
    const xMintHref = operation?.["x-mint"]?.href;
    if (xMintHref !== entry.href || page?.href !== entry.href) {
      mismatches.push({
        kind,
        name:
          kind === "webhook"
            ? entry.name
            : `${entry.method.toUpperCase()} ${entry.path}`,
        expected: entry.href,
        xMintHref: xMintHref ?? null,
        generatedHref: page?.href ?? null,
      });
    }
  }

  assert.deepEqual(mismatches, []);
});

test("every redirect destination resolves to a published or generated page", () => {
  const publishedRoutes = new Set(REQUIRED_PUBLISHED_PAGES.map(publishedRoute));
  const generatedRoutes = new Set(
    generatedOpenApiPages().map(({ href }) => href),
  );
  const implicitRoutes = new Set(["/api-reference"]);

  for (const { source, destination } of inventory) {
    const destinationPath = destination.split("#", 1)[0];
    assert.ok(
      publishedRoutes.has(destinationPath) ||
        generatedRoutes.has(destinationPath) ||
        implicitRoutes.has(destinationPath),
      `${source} redirects to unresolved destination ${destination}`,
    );
  }
});
