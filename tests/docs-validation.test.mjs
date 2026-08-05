import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  EXPECTED_REDIRECT_SOURCES,
  FROZEN_SOURCE_PAGES,
  REQUIRED_NAVIGATION_PAGES,
  SOURCE_COMMIT,
  parseMigrationLedger,
  sourcePathToRoute,
  validateFrontmatter,
  validateMigrationCoverage,
  validateNavigation,
  validatePublishedText,
  validateRedirectInventory,
} from "../scripts/lib/docs-validation.mjs";

function assertHasError(errors, pattern) {
  assert.ok(
    errors.some((error) => pattern.test(error)),
    `Expected an error matching ${pattern}, received:\n${errors.join("\n")}`,
  );
}

function validPage(body = "Published content.") {
  return `---\ntitle: Example\ndescription: Example description.\n---\n\n${body}\n`;
}

function navigationFixture(pages = ["integration/overview"]) {
  return {
    navigation: {
      tabs: [
        {
          tab: "Integration Docs",
          groups: [{ group: "Start", pages }],
        },
        { tab: "API Reference", openapi: "openapi.json" },
      ],
    },
  };
}

function redirect(source = "/old", destination = "/integration/overview") {
  return {
    source,
    destination,
    reason: "Legacy route moved",
    verified: false,
  };
}

test("requires title frontmatter", () => {
  const errors = validateFrontmatter(
    "integration/example.mdx",
    "---\ndescription: Example description.\n---\n",
  );

  assertHasError(errors, /missing title frontmatter/i);
});

test("requires description frontmatter", () => {
  const errors = validateFrontmatter(
    "integration/example.mdx",
    "---\ntitle: Example\n---\n",
  );

  assertHasError(errors, /missing description frontmatter/i);
});

test("accepts non-empty title and description frontmatter", () => {
  assert.deepEqual(
    validateFrontmatter("integration/example.mdx", validPage()),
    [],
  );
});

for (const [label, banned, pattern] of [
  ["v1 routes", "Call POST /v1/customers.", /\/v1\//i],
  ["v2 routes", "Call GET /v2/customers.", /\/v2\//i],
  ["the deprecated wallet host", "https://wallet.swipelux.com", /wallet\.swipelux\.com/i],
  ["starter branding", "Mintlify Starter Kit", /Mintlify Starter Kit/i],
]) {
  test(`rejects ${label} in published text`, () => {
    const errors = validatePublishedText(
      "integration/example.mdx",
      validPage(banned),
    );

    assertHasError(errors, pattern);
  });
}

test("rejects realistic live and sandbox secret keys", () => {
  for (const secret of [
    "sk.live.4E7mQ9zR2pX8vK6nT3wB5cY1aD0fHjLu",
    "sk.sbx.a8N2qR6vX1mK9pT4wC7yF3hJ5dL0sZbE",
  ]) {
    const errors = validatePublishedText(
      "integration/authentication.mdx",
      validPage(`Use ${secret} on your server.`),
    );
    assertHasError(errors, /real-looking secret/i);
  }
});

test("rejects Mintlify starter placeholder content", () => {
  const errors = validatePublishedText(
    "index.mdx",
    validPage("Ready to make this your own? Start by editing this page."),
  );

  assertHasError(errors, /starter placeholder content/i);
});

test("allows obvious secret formats and placeholders", () => {
  const text = validPage([
    "`sk.live.*` documents the live-key format.",
    "`sk.sbx.<your-api-key>` is a placeholder.",
    "`sk.live.YOUR_API_KEY` is a placeholder.",
    "`sk.sbx.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` is redacted.",
  ].join("\n"));

  assert.deepEqual(
    validatePublishedText("integration/authentication.mdx", text),
    [],
  );
});

test("rejects untagged code fences", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("```\nconst value = true;\n```"),
  );

  assertHasError(errors, /code fence.*language tag/i);
});

test("accepts language-tagged code fences", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("```js\nconst value = true;\n```"),
  );

  assert.deepEqual(errors, []);
});

test("allows historical version references in excluded specs and plans", () => {
  const historical = "The old examples used /v1/customers and /v2/customers.";

  assert.deepEqual(
    validatePublishedText("docs/specs/history.md", historical),
    [],
  );
  assert.deepEqual(
    validatePublishedText("docs/plans/migration.md", historical),
    [],
  );
});

test("recursively rejects navigation pages missing from disk", () => {
  const config = navigationFixture([
    "integration/overview",
    {
      group: "Nested",
      pages: ["integration/missing"],
    },
  ]);
  const errors = validateNavigation(config, {
    pageExists: (page) => page === "integration/overview",
    requiredPages: ["integration/overview", "integration/missing"],
  });

  assertHasError(errors, /navigation page integration\/missing.*missing from disk/i);
});

test("requires approved navigation pages exactly once", () => {
  const config = navigationFixture([
    "integration/overview",
    "integration/overview",
  ]);
  const errors = validateNavigation(config, {
    pageExists: () => true,
    requiredPages: ["integration/overview", "integration/quickstart"],
  });

  assertHasError(errors, /integration\/overview.*2 times/i);
  assertHasError(errors, /missing required navigation page integration\/quickstart/i);
});

test("requires the API Reference navigation to use openapi.json", () => {
  const config = navigationFixture();
  config.navigation.tabs[1].openapi = "legacy.yaml";
  const errors = validateNavigation(config, {
    pageExists: () => true,
    requiredPages: ["integration/overview"],
  });

  assertHasError(errors, /API Reference.*openapi\.json/i);
});

test("rejects redirects to unknown destinations", () => {
  const errors = validateRedirectInventory(
    [redirect("/old", "/unknown")],
    {
      expectedSources: ["/old"],
      knownDestinations: new Set(["/integration/overview"]),
    },
  );

  assertHasError(errors, /unknown destination \/unknown/i);
});

test("rejects duplicate redirect sources", () => {
  const errors = validateRedirectInventory(
    [redirect(), redirect()],
    {
      expectedSources: ["/old"],
      knownDestinations: new Set(["/integration/overview"]),
    },
  );

  assertHasError(errors, /duplicate redirect source \/old/i);
});

test("rejects source pages missing from the migration ledger", () => {
  const errors = validateMigrationCoverage(
    ["content/index.mdx", "content/get-started/index.mdx"],
    [
      {
        sourcePath: "content/index.mdx",
        sourceCommit: SOURCE_COMMIT,
        destination: "/",
        disposition: "contract-rewrite",
        reviewState: "not-applicable",
        notes: "Landing page rewrite.",
      },
    ],
  );

  assertHasError(errors, /missing migration ledger row.*get-started\/index\.mdx/i);
});

test("normalizes index source pages to public routes", () => {
  assert.equal(sourcePathToRoute("content/index.mdx"), "/");
  assert.equal(sourcePathToRoute("content/get-started/index.mdx"), "/get-started");
  assert.equal(
    sourcePathToRoute("content/reference/v3-reason-codes.mdx"),
    "/reference/v3-reason-codes",
  );
});

test("commits the complete approved page and frozen source inventories", () => {
  assert.equal(REQUIRED_NAVIGATION_PAGES.length, 42);
  assert.equal(FROZEN_SOURCE_PAGES.length, 59);
  assert.equal(EXPECTED_REDIRECT_SOURCES.length, 53);
  assert.equal(new Set(FROZEN_SOURCE_PAGES).size, FROZEN_SOURCE_PAGES.length);
  assert.equal(
    new Set(EXPECTED_REDIRECT_SOURCES).size,
    EXPECTED_REDIRECT_SOURCES.length,
  );
});

test("validates the committed redirect inventory", () => {
  const inventory = JSON.parse(
    readFileSync("docs/redirect-inventory.json", "utf8"),
  );
  const knownDestinations = new Set([
    "/",
    ...REQUIRED_NAVIGATION_PAGES.map((page) => `/${page}`),
    "/api-reference/money-movement/get-v3-rates",
  ]);

  assert.equal(inventory.length, 53);
  assert.deepEqual(
    validateRedirectInventory(inventory, {
      expectedSources: EXPECTED_REDIRECT_SOURCES,
      knownDestinations,
    }),
    [],
  );
});

test("keeps the approved legacy route destinations", () => {
  const inventory = JSON.parse(
    readFileSync("docs/redirect-inventory.json", "utf8"),
  );
  const destinations = new Map(
    inventory.map(({ source, destination }) => [source, destination]),
  );
  const coverage = JSON.parse(readFileSync("openapi-coverage.json", "utf8"));
  const rates = coverage.operations.find(
    ({ method, path }) => method === "get" && path === "/v3/rates",
  );

  assert.equal(destinations.get("/get-started"), "/integration/overview");
  assert.equal(
    destinations.get("/compliance/merchant-onboarding"),
    "/knowledge-base/business-onboarding/overview",
  );
  assert.equal(
    destinations.get("/individual-onboarding/api-reference"),
    "/integration/onboarding/individuals",
  );
  assert.equal(destinations.get("/concepts/accounts"), "/integration/accounts");
  assert.equal(destinations.get("/concepts/wallets"), "/integration/accounts");
  assert.equal(
    destinations.get("/concepts/recipients"),
    "/integration/recipients",
  );
  assert.equal(
    destinations.get("/concepts/quotes"),
    "/integration/quotes-and-transfers",
  );
  assert.equal(destinations.get("/concepts/webhooks"), "/integration/webhooks");
  assert.equal(destinations.get("/reference/rates"), rates.href);
  assert.equal(
    destinations.get("/reference/v3-reason-codes"),
    "/integration/errors",
  );
  assert.equal(
    destinations.get("/reference/webhooks"),
    "/integration/webhooks",
  );
  assert.equal(
    destinations.get("/reference/endpoint-map"),
    "/integration/using-the-api-reference",
  );
  assert.equal(
    inventory.some(({ source }) => source.startsWith("/t-c")),
    false,
  );
});

test("validates complete ledger and redirect coverage", () => {
  const ledger = parseMigrationLedger(
    readFileSync("docs/content-migration-ledger.md", "utf8"),
  );
  const redirects = JSON.parse(
    readFileSync("docs/redirect-inventory.json", "utf8"),
  );

  assert.equal(ledger.length, 59);
  assert.deepEqual(
    validateMigrationCoverage(FROZEN_SOURCE_PAGES, ledger, { redirects }),
    [],
  );
});
