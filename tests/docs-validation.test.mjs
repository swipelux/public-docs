import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPROVED_REDIRECT_DESTINATIONS,
  EXPECTED_REDIRECT_SOURCES,
  FROZEN_MIGRATION_DECISIONS,
  FROZEN_SOURCE_PAGES,
  REQUIRED_NAVIGATION_PAGES,
  REQUIRED_PUBLISHED_PAGES,
  SOURCE_COMMIT,
  parseMigrationLedger,
  parseRedirectVerificationPhase,
  selectPublishableMdxPaths,
  sourcePathToRoute,
  validateFrontmatter,
  validateMigrationCoverage,
  validateNavigation,
  validatePublishedJsonStrings,
  validatePublishedMdxInventory,
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

function redirect(
  source = "/old",
  destination = "/integration/overview",
  verified = false,
) {
  return {
    source,
    destination,
    reason: "Legacy route moved",
    verified,
  };
}

function committedLedger() {
  return parseMigrationLedger(
    readFileSync("docs/content-migration-ledger.md", "utf8"),
  );
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

test("rejects YAML-null and comment-only frontmatter values", () => {
  for (const [field, value] of [
    ["title", "# TODO"],
    ["title", "null # TODO"],
    ["title", "~"],
    ["description", '\"\" # TODO'],
    ["description", "'' # TODO"],
  ]) {
    const frontmatter = {
      title: "Example",
      description: "Example description.",
      [field]: value,
    };
    const errors = validateFrontmatter(
      "integration/example.mdx",
      `---\ntitle: ${frontmatter.title}\ndescription: ${frontmatter.description}\n---\n`,
    );

    assertHasError(errors, new RegExp(`missing ${field} frontmatter`, "i"));
  }
});

test("accepts quoted frontmatter values containing hash characters", () => {
  const text = [
    "---",
    'title: "C# and API # reference" # navigation title',
    "description: 'Use # fragments safely' # SEO description",
    "---",
    "",
  ].join("\n");

  assert.deepEqual(validateFrontmatter("integration/example.mdx", text), []);
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

test("rejects blockquoted untagged code fences", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("> ```\n> const value = true;\n> ```"),
  );

  assertHasError(errors, /code fence.*language tag/i);
});

test("rejects metadata-only untagged code fences", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage('``` {title="Example"}\nconst value = true;\n```'),
  );

  assertHasError(errors, /code fence.*language tag/i);
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

test("keeps the docs validation library free of ambient disk access", () => {
  const source = readFileSync(
    new URL("../scripts/lib/docs-validation.mjs", import.meta.url),
    "utf8",
  );
  const forbiddenReferences = [
    "node:fs",
    "node:path",
    "process.cwd",
    "existsSync",
    "readFileSync",
    "readdirSync",
    "statSync",
  ];

  assert.deepEqual(
    forbiddenReferences.filter((reference) => source.includes(reference)),
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

test("rejects duplicate OpenAPI references anywhere in navigation", () => {
  const config = navigationFixture();
  config.navigation.tabs[0].groups[0].openapi = "openapi.json";
  const errors = validateNavigation(config, {
    pageExists: () => true,
    requiredPages: ["integration/overview"],
  });

  assertHasError(errors, /exactly one openapi reference/i);
});

test("rejects OpenAPI navigation placed on another top-level tab", () => {
  const config = navigationFixture();
  delete config.navigation.tabs[1].openapi;
  config.navigation.tabs[0].openapi = "openapi.json";
  const errors = validateNavigation(config, {
    pageExists: () => true,
    requiredPages: ["integration/overview"],
  });

  assertHasError(errors, /top-level API Reference tab/i);
});

test("preserves false redirect verification in the current phase", () => {
  assert.deepEqual(
    validateRedirectInventory([redirect()], {
      expectedSources: ["/old"],
      knownDestinations: new Set(["/integration/overview"]),
    }),
    [],
  );
});

test("rejects true redirect verification in the current phase", () => {
  const errors = validateRedirectInventory(
    [redirect("/old", "/integration/overview", true)],
    {
      expectedSources: ["/old"],
      knownDestinations: new Set(["/integration/overview"]),
    },
  );

  assertHasError(errors, /verified must be false.*current phase/i);
});

test("requires true redirect verification in the final phase", () => {
  const options = {
    expectedSources: ["/old"],
    knownDestinations: new Set(["/integration/overview"]),
    verificationPhase: "final",
  };

  assert.deepEqual(
    validateRedirectInventory(
      [redirect("/old", "/integration/overview", true)],
      options,
    ),
    [],
  );
  assertHasError(
    validateRedirectInventory([redirect()], options),
    /verified must be true.*final phase/i,
  );
});

test("parses the explicit redirect verification CLI phase", () => {
  assert.equal(parseRedirectVerificationPhase([]), "current");
  assert.equal(
    parseRedirectVerificationPhase(["--redirect-phase=final"]),
    "final",
  );
  assert.throws(
    () => parseRedirectVerificationPhase(["--redirect-phase=release"]),
    /redirect phase.*current.*final/i,
  );
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

test("requires expected redirect destinations for every expected source", () => {
  const errors = validateRedirectInventory([redirect()], {
    expectedSources: ["/old"],
    expectedDestinations: {},
    knownDestinations: new Set(["/integration/overview"]),
  });

  assertHasError(errors, /expected destinations.*missing source \/old/i);
});

test("rejects unexpected keys in expected redirect destinations", () => {
  const errors = validateRedirectInventory([redirect()], {
    expectedSources: ["/old"],
    expectedDestinations: {
      "/old": "/integration/overview",
      "/extra": "/integration/overview",
    },
    knownDestinations: new Set(["/integration/overview"]),
  });

  assertHasError(errors, /expected destinations.*unexpected source \/extra/i);
});

test("filters only explicitly ignored MDX paths from publication", () => {
  const paths = selectPublishableMdxPaths(
    [
      "index.mdx",
      "quickstart.mdx",
      "integration/overview.mdx",
      "docs/specs/internal.mdx",
      "drafts/example.mdx",
      "integration/example.draft.mdx",
    ],
    ["docs/", "drafts/", "*.draft.mdx"],
  );

  assert.deepEqual(paths, [
    "index.mdx",
    "integration/overview.mdx",
    "quickstart.mdx",
  ]);
});

test("rejects every unexpected publishable MDX page", () => {
  const errors = validatePublishedMdxInventory(
    [
      "index.mdx",
      "integration/overview.mdx",
      "quickstart.mdx",
      "content/t-c/index.mdx",
      "integration/extra.mdx",
    ],
    { requiredPages: ["index", "integration/overview"] },
  );

  assertHasError(errors, /quickstart\.mdx.*unexpected publishable MDX page/i);
  assertHasError(
    errors,
    /content\/t-c\/index\.mdx.*unexpected publishable MDX page/i,
  );
  assertHasError(
    errors,
    /integration\/extra\.mdx.*unexpected publishable MDX page/i,
  );
});

test("documentation CLI discovers root-level unexpected MDX pages", () => {
  const fixture = mkdtempSync(join(tmpdir(), "docs-validation-"));
  const cli = fileURLToPath(
    new URL("../scripts/verify-docs.mjs", import.meta.url),
  );
  try {
    writeFileSync(join(fixture, ".mintignore"), "docs/\n");
    writeFileSync(join(fixture, "quickstart.mdx"), validPage());
    mkdirSync(join(fixture, "docs/plans"), { recursive: true });
    writeFileSync(
      join(fixture, "docs/plans/internal.mdx"),
      validPage(),
    );

    const result = spawnSync(process.execPath, [cli], {
      cwd: fixture,
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /quickstart\.mdx: unexpected publishable MDX page/i,
    );
    assert.doesNotMatch(result.stderr, /docs\/plans\/.*publishable MDX/i);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("scans decoded docs.json string values", () => {
  const config = JSON.parse(
    '{"name":"Mintlify \\u0053tarter Kit","route":"/v\\u0031/customers"}',
  );
  const errors = validatePublishedJsonStrings("docs.json", config);

  assertHasError(errors, /docs\.json#\/name.*starter branding/i);
  assertHasError(errors, /docs\.json#\/route.*prohibited \/v1\//i);
});

test("migration ledger parser validates the separator row", () => {
  const markdown = [
    "| Source path | Source commit | Destination | Disposition | Review state | Notes |",
    "| source | commit | destination | disposition | review | notes |",
  ].join("\n");

  assert.throws(() => parseMigrationLedger(markdown), /separator.*malformed/i);
});

test("migration ledger parser handles escaped pipes", () => {
  const markdown = [
    "| Source path | Source commit | Destination | Disposition | Review state | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
    `| \`content/index.mdx\` | \`${SOURCE_COMMIT}\` | \`/\` | \`contract-rewrite\` | \`not-applicable\` | Preserve A \\| B. |`,
  ].join("\n");

  assert.equal(parseMigrationLedger(markdown)[0].notes, "Preserve A | B.");
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
  assert.equal(REQUIRED_PUBLISHED_PAGES.length, 43);
  assert.equal(FROZEN_SOURCE_PAGES.length, 59);
  assert.equal(Object.keys(FROZEN_MIGRATION_DECISIONS).length, 59);
  assert.equal(EXPECTED_REDIRECT_SOURCES.length, 53);
  assert.equal(new Set(FROZEN_SOURCE_PAGES).size, FROZEN_SOURCE_PAGES.length);
  assert.equal(
    new Set(EXPECTED_REDIRECT_SOURCES).size,
    EXPECTED_REDIRECT_SOURCES.length,
  );
  assert.deepEqual(
    Object.keys(APPROVED_REDIRECT_DESTINATIONS).sort(),
    [...EXPECTED_REDIRECT_SOURCES].sort(),
  );
  assert.deepEqual(
    Object.entries(FROZEN_MIGRATION_DECISIONS)
      .filter(([, decision]) => decision.disposition === "omitted")
      .map(([sourcePath]) => sourcePath),
    [
      "content/t-c/creating-customer.mdx",
      "content/t-c/implementation.mdx",
      "content/t-c/incorporating-terms.mdx",
      "content/t-c/index.mdx",
      "content/t-c/updates.mdx",
    ],
  );
});

test("rejects mutation of an approved migration destination", () => {
  const ledger = committedLedger().map((row) => ({ ...row }));
  const row = ledger.find(
    ({ sourcePath }) => sourcePath === "content/reference/rates.mdx",
  );
  row.destination = "/integration/overview";

  assertHasError(
    validateMigrationCoverage(FROZEN_SOURCE_PAGES, ledger),
    /content\/reference\/rates\.mdx: destination must remain \/api-reference\/money-movement\/get-v3-rates/i,
  );
});

test("rejects downgrading an approved policy row to a contract rewrite", () => {
  const ledger = committedLedger().map((row) => ({ ...row }));
  const row = ledger.find(
    ({ sourcePath }) =>
      sourcePath === "content/compliance/travel-rule.mdx",
  );
  row.disposition = "contract-rewrite";
  row.reviewState = "not-applicable";

  const errors = validateMigrationCoverage(FROZEN_SOURCE_PAGES, ledger);
  assertHasError(
    errors,
    /content\/compliance\/travel-rule\.mdx: disposition must remain preserved-policy/i,
  );
  assertHasError(
    errors,
    /content\/compliance\/travel-rule\.mdx: review state must remain review-required/i,
  );
});

test("rejects omitting any approved non-Terms source page", () => {
  const ledger = committedLedger().map((row) => ({ ...row }));
  const row = ledger.find(
    ({ sourcePath }) => sourcePath === "content/index.mdx",
  );
  row.destination = "—";
  row.disposition = "omitted";

  assertHasError(
    validateMigrationCoverage(FROZEN_SOURCE_PAGES, ledger),
    /content\/index\.mdx: disposition must remain contract-rewrite/i,
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
  const ledger = committedLedger();
  const redirects = JSON.parse(
    readFileSync("docs/redirect-inventory.json", "utf8"),
  );

  assert.equal(ledger.length, 59);
  assert.deepEqual(
    validateMigrationCoverage(FROZEN_SOURCE_PAGES, ledger, { redirects }),
    [],
  );
});
