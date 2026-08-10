import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  APPROVED_REDIRECT_DESTINATIONS,
  CANONICAL_NAVIGATION_PAGES,
  EXPECTED_REDIRECT_SOURCES,
  FROZEN_MIGRATION_DECISIONS,
  FROZEN_SOURCE_PAGES,
  LOCALIZED_HOME_PAGES,
  LOCALIZED_NAVIGATION_PAGES,
  REQUIRED_NAVIGATION_PAGES,
  REQUIRED_PUBLISHED_PAGES,
  SOURCE_COMMIT,
  TRANSLATED_LOCALES,
  collectJsonStrings,
  pagePathToRoute,
  parseFrontmatter,
  parseMigrationLedger,
  parseRedirectVerificationPhase,
  selectPublishablePagePaths,
  sourcePathToRoute,
  validateFrontmatter,
  validateMigrationCoverage,
  validateNavigation,
  validatePublishedJsonStrings,
  validatePublishedPageInventory,
  validatePublishedText,
  validateRedirectInventory,
} from "../scripts/lib/docs-validation.mjs";

const docsCli = fileURLToPath(
  new URL("../scripts/verify-docs.mjs", import.meta.url),
);

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

function committedRedirectState() {
  return {
    inventory: JSON.parse(
      readFileSync("docs/redirect-inventory.json", "utf8"),
    ),
    marker: JSON.parse(
      readFileSync("docs/redirect-verification-phase.json", "utf8"),
    ),
  };
}

function knownRedirectDestinations() {
  return new Set([
    "/",
    ...REQUIRED_NAVIGATION_PAGES.map((page) => `/${page}`),
    "/api-reference/customers/post-v3-customers",
    "/api-reference/money-movement/get-v3-rates",
  ]);
}

function assertRedirectRepositoryState(marker, inventory) {
  const phase = parseRedirectVerificationPhase([], marker);
  const expectedVerified = phase === "final";

  assert.ok(
    inventory.every(({ verified }) => verified === expectedVerified),
    `every redirect must use verified: ${expectedVerified} in the ${phase} phase`,
  );
  assert.deepEqual(
    validateRedirectInventory(inventory, {
      expectedDestinations: APPROVED_REDIRECT_DESTINATIONS,
      expectedSources: EXPECTED_REDIRECT_SOURCES,
      knownDestinations: knownRedirectDestinations(),
      verificationPhase: phase,
    }),
    [],
  );

  return phase;
}

function writeFixtureFile(root, relativePath, content) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function writeFixtureJson(root, relativePath, value) {
  writeFixtureFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createCompleteCliFixture({
  phase = "current",
  verified = false,
} = {}) {
  const fixture = mkdtempSync(join(tmpdir(), "docs-validation-"));
  writeFixtureFile(fixture, ".mintignore", readFileSync(".mintignore", "utf8"));

  for (const page of REQUIRED_PUBLISHED_PAGES) {
    const path = page === "index" ? "index.mdx" : `${page}.mdx`;
    writeFixtureFile(fixture, path, validPage());
  }

  writeFixtureJson(fixture, "docs.json", {
    name: "Swipelux docs",
    navigation: {
      tabs: [
        {
          tab: "Integration Docs",
          groups: [
            {
              group: "Published pages",
              pages: REQUIRED_NAVIGATION_PAGES,
            },
          ],
        },
        { tab: "API Reference", openapi: "openapi.json" },
      ],
    },
  });
  writeFixtureJson(fixture, "openapi.json", {});
  writeFixtureJson(fixture, "openapi-coverage.json", {
    operations: [
      { href: "/api-reference/customers/post-v3-customers" },
      { href: "/api-reference/money-movement/get-v3-rates" },
    ],
    webhooks: [],
  });
  writeFixtureJson(
    fixture,
    "docs/redirect-inventory.json",
    JSON.parse(readFileSync("docs/redirect-inventory.json", "utf8")).map(
      (entry) => ({ ...entry, verified }),
    ),
  );
  writeFixtureJson(fixture, "docs/redirect-verification-phase.json", {
    phase,
  });
  writeFixtureFile(
    fixture,
    "docs/content-migration-ledger.md",
    readFileSync("docs/content-migration-ledger.md", "utf8"),
  );

  return fixture;
}

function runDocsCli(fixture, args = [], options = {}) {
  return spawnSync(process.execPath, [docsCli, ...args], {
    cwd: fixture,
    encoding: "utf8",
    ...options,
  });
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
    ["title", "!!null # TODO"],
    ["title", "&empty # TODO"],
    ["description", '\"\" # TODO'],
    ["description", "'' # TODO"],
    ["description", '!!str ""'],
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

test("parses arrays and objects with Mintlify YAML semantics", () => {
  const parsed = parseFrontmatter(
    [
      "---",
      'title: "C# reference"',
      "description: Structured metadata.",
      "keywords: [accounts, transfers]",
      'metadata: {label: "Hash # value", priority: 2}',
      "---",
      "Body",
    ].join("\n"),
  );

  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.attributes, {
    title: "C# reference",
    description: "Structured metadata.",
    keywords: ["accounts", "transfers"],
    metadata: { label: "Hash # value", priority: 2 },
  });
});

test("rejects arrays and objects used as required frontmatter scalars", () => {
  for (const [field, value] of [
    ["title", "[Example]"],
    ["title", "{label: Example}"],
    ["description", "[Example]"],
    ["description", "{label: Example}"],
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

test("reports malformed YAML frontmatter deterministically", () => {
  const errors = validateFrontmatter(
    "integration/example.mdx",
    "---\ntitle: [broken\ndescription: Example\n---\nBody\n",
  );

  assert.deepEqual(errors, [
    "integration/example.mdx: invalid YAML frontmatter at line 2, column 1: missed comma between flow collection entries",
  ]);
});

test("scans decoded YAML strings in frontmatter", () => {
  const text = [
    "---",
    'title: "Mintlify \\u0053tarter Kit"',
    "description: Example description.",
    'metadata: {labels: ["safe", "Mintlify \\u0053tarter Kit"]}',
    "---",
    "Body",
  ].join("\n");
  const errors = [
    ...validateFrontmatter("integration/example.mdx", text),
    ...validatePublishedText("integration/example.mdx", text),
  ];

  assertHasError(errors, /frontmatter.*starter branding/i);
});

test("scans recursive YAML aliases deterministically", () => {
  const text = [
    "---",
    "title: Example",
    "description: Example description.",
    "metadata: &metadata",
    '  label: "Mintlify Starter Kit"',
    "  self: *metadata",
    "---",
    "Body",
  ].join("\n");

  const first = validateFrontmatter("integration/example.mdx", text);
  const second = validateFrontmatter("integration/example.mdx", text);

  assert.deepEqual(first, second);
  assertHasError(first, /frontmatter\/metadata\/label.*starter branding/i);
});

for (const [label, banned, pattern] of [
  [
    "v1 routes",
    "Call POST /v1/customers.",
    /prohibited legacy API v1\/v2 identifier/i,
  ],
  [
    "v2 routes",
    "Call GET /v2/customers.",
    /prohibited legacy API v1\/v2 identifier/i,
  ],
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

test("rejects internal documentation implementation details in Integration pages", () => {
  for (const value of [
    "openapi-coverage.json",
    "openapi-provenance.json",
    "x-mint.href",
    "the committed contract defines",
    "the generated schema says",
  ]) {
    const errors = validatePublishedText(
      "integration/example.mdx",
      validPage(value),
    );

    assertHasError(errors, /internal documentation implementation detail/i);
  }
});

test("allows internal documentation terms in planning files", () => {
  assert.deepEqual(
    validatePublishedText(
      "docs/plans/example.md",
      "openapi-coverage.json and x-mint.href",
    ),
    [],
  );
});

test("rejects standalone legacy API version identifiers and routes", () => {
  for (const legacyReference of [
    "API v1",
    "v1",
    "/v1",
    "/v1?x=1",
    "/v2#fragment",
    "/v1/",
    "/V2/customers",
  ]) {
    const errors = validatePublishedText(
      "integration/example.mdx",
      validPage(`Legacy reference: ${legacyReference}`),
    );

    assertHasError(errors, /prohibited legacy API v1\/v2 identifier/i);
  }
});

test("does not match legacy-version text inside longer alphanumeric tokens", () => {
  const text = validPage(
    "Allowed tokens: v10, v12beta, apiV1Client, servicev2api, and /v10/customers.",
  );

  assert.deepEqual(validatePublishedText("integration/example.mdx", text), []);
});

test("allows legacy API references only in the canonical migration guide", () => {
  const migrationPath = "api-reference/versioning/migrate-to-v3.mdx";
  const migrationText = [
    "---",
    "title: Migrate from API v1 or v2",
    "description: Map API v1 and v2 endpoints to v3.",
    "---",
    "",
    "Replace `POST /v1/customers` and `POST /v2/customers` with `POST /v3/customers`.",
  ].join("\n");

  assert.deepEqual(validateFrontmatter(migrationPath, migrationText), []);
  assert.deepEqual(validatePublishedText(migrationPath, migrationText), []);
  assert.deepEqual(
    validatePublishedText(`cn/${migrationPath}`, migrationText),
    [],
  );

  assertHasError(
    validatePublishedText(
      "api-reference/versioning/changelog.mdx",
      migrationText,
    ),
    /prohibited legacy API v1\/v2 identifier/i,
  );
  assertHasError(
    validatePublishedText(`unsupported/${migrationPath}`, migrationText),
    /prohibited legacy API v1\/v2 identifier/i,
  );
  assertHasError(
    validatePublishedText(
      migrationPath,
      validPage("Use https://wallet.swipelux.com during migration."),
    ),
    /deprecated wallet\.swipelux\.com host/i,
  );
});

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

test("rejects untagged code fences in lowercase Markdown pages", () => {
  const errors = validatePublishedText(
    "integration/example.md",
    validPage("```\nconst value = true;\n```"),
  );

  assertHasError(errors, /code fence.*language tag/i);
});

test("rejects untagged code fences in uppercase MDX pages", () => {
  const errors = validatePublishedText(
    "integration/example.MDX",
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

test("accepts literal list-item fences inside tagged Markdown examples", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("```md\n- ```\n```"),
  );

  assert.deepEqual(errors, []);
});

test("accepts literal list-item fences inside nested tagged MDX examples", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("- 1. ```mdx\n     - ```\n     ```"),
  );

  assert.deepEqual(errors, []);
});

test("does not use a new list item fence to close an existing fence", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("- ```js\n- ```"),
  );

  assertHasError(
    errors,
    /integration\/example\.mdx:7: code fence.*language tag/i,
  );
});

test("accepts backticks indented beyond an ordinary closing fence", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("```md\n    ```\n```"),
  );

  assert.deepEqual(errors, []);
});

test("accepts language-tagged code fences nested in Markdown list items", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("- ```js\n  const value = true;\n  ```"),
  );

  assert.deepEqual(errors, []);
});

test("rejects untagged code fences nested in Markdown list items", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("1. ```\n   const value = true;\n   ```"),
  );

  assertHasError(errors, /code fence.*language tag/i);
});

test("rejects metadata-only code fences nested in Markdown list items", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage('- ``` {title="Example"}\n  const value = true;\n  ```'),
  );

  assertHasError(errors, /code fence.*language tag/i);
});

test("accepts tagged code fences through multiple nested list containers", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("- 1. ```js\n     const value = true;\n     ```"),
  );

  assert.deepEqual(errors, []);
});

test("ends nested list-contained fences before nonblank dedented lines", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("- 1. ```js\n    const value = true;\n    ```"),
  );

  assertHasError(
    errors,
    /integration\/example\.mdx:8: code fence.*language tag/i,
  );
});

test("keeps unindented blank lines inside nested list-contained fences", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("- 1. ```js\n\n     const value = true;\n     ```"),
  );

  assert.deepEqual(errors, []);
});

test("rejects untagged code fences through multiple nested list containers", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("- 1. ```\n- 1. ```"),
  );

  assertHasError(errors, /code fence.*language tag/i);
});

test("rejects metadata-only fences through multiple nested list containers", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage('- 1. ``` {title="Example"}\n- 1. ```'),
  );

  assertHasError(errors, /code fence.*language tag/i);
});

test("rejects blockquoted fences through multiple nested list containers", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("> - 1. ```js\n> - 1. ```"),
  );

  assertHasError(errors, /code fence.*blockquoted/i);
});

test("rejects blockquoted untagged code fences", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("> ```\n> const value = true;\n> ```"),
  );

  assertHasError(errors, /code fence.*language tag/i);
});

test("rejects blockquoted language-tagged code fences", () => {
  const errors = validatePublishedText(
    "integration/example.mdx",
    validPage("> ```js\n> const value = true;\n> ```"),
  );

  assertHasError(errors, /code fence.*blockquoted/i);
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

test("keeps uppercase page extensions in Mintlify navigation slugs", () => {
  const config = navigationFixture(["integration/overview.MDX"]);
  const errors = validateNavigation(config, {
    pageExists: (page) => page === "integration/overview.MDX",
    requiredPages: ["integration/overview"],
  });

  assertHasError(
    errors,
    /missing required navigation page integration\/overview/i,
  );
  assertHasError(
    errors,
    /unexpected navigation page integration\/overview\.MDX/i,
  );
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

test("resolves redirect verification from an exact CLI override or marker", () => {
  assert.equal(
    parseRedirectVerificationPhase([], { phase: "current" }),
    "current",
  );
  assert.equal(
    parseRedirectVerificationPhase([], { phase: "final" }),
    "final",
  );
  assert.equal(
    parseRedirectVerificationPhase(["--redirect-phase=current"]),
    "current",
  );
  assert.equal(
    parseRedirectVerificationPhase(["--redirect-phase=final"]),
    "final",
  );
});

test("rejects malformed redirect verification markers", () => {
  for (const marker of [
    undefined,
    null,
    [],
    {},
    { phase: "release" },
    { phase: "current", extra: true },
  ]) {
    assert.throws(
      () => parseRedirectVerificationPhase([], marker),
      /redirect verification phase marker.*phase.*current.*final/i,
    );
  }
});

test("rejects every unsupported redirect verification CLI form", () => {
  for (const args of [
    ["--redirect-phase="],
    ["--redirect-phase", "final"],
    ["--redirect-phaze=final"],
    ["--redirect-phase=final", "--redirect-phase=final"],
    ["final"],
  ]) {
    assert.throws(
      () => parseRedirectVerificationPhase(args, { phase: "current" }),
      /usage:.*--redirect-phase=current\|final/i,
    );
  }

  assert.throws(
    () => parseRedirectVerificationPhase(["--redirect-phase=release"]),
    /usage:.*--redirect-phase=current\|final/i,
  );
});

test("documentation CLI rejects malformed arguments before validation", () => {
  const fixture = mkdtempSync(join(tmpdir(), "docs-validation-"));
  try {
    for (const args of [
      ["--redirect-phase="],
      ["--redirect-phase", "final"],
      ["--redirect-phaze=final"],
      ["--redirect-phase=final", "--redirect-phase=current"],
      ["final"],
    ]) {
      const result = runDocsCli(fixture, args);

      assert.equal(result.status, 2, args.join(" "));
      assert.match(result.stderr, /^Argument error:.*usage:/is);
      assert.doesNotMatch(result.stderr, /ENOENT|Documentation verification/i);
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("documentation CLI rejects an invalid committed phase marker", () => {
  const fixture = createCompleteCliFixture();
  try {
    writeFixtureJson(fixture, "docs/redirect-verification-phase.json", {
      phase: "release",
    });
    const result = runDocsCli(fixture);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /^Redirect phase configuration error:.*phase.*current.*final/is,
    );
    assert.doesNotMatch(result.stderr, /Documentation verification failed/i);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("documentation CLI accepts false redirects with the current marker", () => {
  const fixture = createCompleteCliFixture({
    phase: "current",
    verified: false,
  });
  try {
    const result = runDocsCli(fixture);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Documentation verification passed/i);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("documentation CLI accepts all-true redirects with the final marker", () => {
  const fixture = createCompleteCliFixture({
    phase: "final",
    verified: true,
  });
  try {
    const result = runDocsCli(fixture);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Documentation verification passed/i);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("accepts the Task 11 final marker and all-true committed inventory", () => {
  const { inventory } = committedRedirectState();
  const finalInventory = inventory.map((entry) => ({
    ...entry,
    verified: true,
  }));

  assert.equal(
    assertRedirectRepositoryState({ phase: "final" }, finalInventory),
    "final",
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

test("does not treat bare /api-reference as an implicit destination", () => {
  const errors = validateRedirectInventory(
    [redirect("/old", "/api-reference")],
    {
      expectedSources: ["/old"],
      knownDestinations: new Set([
        "/api-reference/customers/post-v3-customers",
      ]),
    },
  );

  assertHasError(errors, /unknown destination \/api-reference/i);
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

test("filters explicitly ignored page paths from publication", () => {
  const paths = selectPublishablePagePaths(
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

test("discovers Markdown pages case-insensitively with Mintlify categories", () => {
  const paths = selectPublishablePagePaths(
    [
      "guide.md",
      "rogue.MDX",
      "nested/reference.Md",
      "README.md",
      "LICENSE.MD",
      "component.jsx",
    ],
    [],
  );

  assert.deepEqual(paths, ["guide.md", "nested/reference.Md", "rogue.MDX"]);
});

test("applies Mintlify default ignores to discovered pages", () => {
  const paths = selectPublishablePagePaths(
    [
      ".git/rogue.mdx",
      ".github/rogue.md",
      ".agents/rogue.MDX",
      "node_modules/package/rogue.mdx",
      "integration/overview.mdx",
    ],
    [],
  );

  assert.deepEqual(paths, ["integration/overview.mdx"]);
});

test("uses gitignore negation and nested re-inclusion semantics", () => {
  const paths = selectPublishablePagePaths(
    [
      "index.mdx",
      "integration/overview.mdx",
      "integration/onboarding/businesses.mdx",
      "knowledge-base/overview.mdx",
    ],
    ["*.mdx", "!integration/**"],
  );

  assert.deepEqual(paths, [
    "integration/onboarding/businesses.mdx",
    "integration/overview.mdx",
  ]);
});

test("uses lowercase Markdown extensions for Mintlify page routes", () => {
  assert.equal(pagePathToRoute("index.md"), "index");
  assert.equal(
    pagePathToRoute("integration/overview.mdx"),
    "integration/overview",
  );
  assert.deepEqual(
    validatePublishedPageInventory(["index.md", "integration/overview.mdx"], {
      requiredPages: ["index", "integration/overview"],
    }),
    [],
  );
});

test("keeps uppercase page extensions in Mintlify page routes", () => {
  assert.equal(pagePathToRoute("index.MD"), "index.MD");
  assert.equal(
    pagePathToRoute("integration/overview.MDX"),
    "integration/overview.MDX",
  );

  const errors = validatePublishedPageInventory(
    ["index.MD", "integration/overview.MDX"],
    { requiredPages: ["index", "integration/overview"] },
  );

  assertHasError(errors, /index\.mdx: missing required published page/i);
  assertHasError(
    errors,
    /integration\/overview\.mdx: missing required published page/i,
  );
  assertHasError(errors, /index\.MD: unexpected publishable page/i);
  assertHasError(
    errors,
    /integration\/overview\.MDX: unexpected publishable page/i,
  );
});

test("rejects every unexpected publishable page", () => {
  const errors = validatePublishedPageInventory(
    [
      "index.mdx",
      "integration/overview.mdx",
      "quickstart.mdx",
      "rogue.md",
      "rogue.MDX",
      "content/t-c/index.mdx",
      "integration/extra.mdx",
    ],
    { requiredPages: ["index", "integration/overview"] },
  );

  assertHasError(errors, /quickstart\.mdx.*unexpected publishable page/i);
  assertHasError(
    errors,
    /content\/t-c\/index\.mdx.*unexpected publishable page/i,
  );
  assertHasError(
    errors,
    /integration\/extra\.mdx.*unexpected publishable page/i,
  );
  assertHasError(errors, /rogue\.md.*unexpected publishable page/i);
  assertHasError(errors, /rogue\.MDX.*unexpected publishable page/i);
});

test("documentation CLI discovers root-level unexpected Markdown pages", () => {
  const fixture = mkdtempSync(join(tmpdir(), "docs-validation-"));
  try {
    writeFileSync(join(fixture, ".mintignore"), "docs/\n");
    writeFileSync(join(fixture, "quickstart.mdx"), validPage());
    writeFileSync(join(fixture, "rogue.md"), validPage());
    writeFileSync(join(fixture, "rogue.MDX"), validPage());
    mkdirSync(join(fixture, "docs/plans"), { recursive: true });
    writeFileSync(
      join(fixture, "docs/plans/internal.mdx"),
      validPage(),
    );
    writeFixtureJson(fixture, "docs/redirect-verification-phase.json", {
      phase: "current",
    });

    const result = runDocsCli(fixture);

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /quickstart\.mdx: unexpected publishable page/i,
    );
    assert.match(result.stderr, /rogue\.md: unexpected publishable page/i);
    assert.match(result.stderr, /rogue\.MDX: unexpected publishable page/i);
    assert.doesNotMatch(result.stderr, /docs\/plans\/.*publishable page/i);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("documentation CLI scans decoded frontmatter values", () => {
  const fixture = createCompleteCliFixture();
  try {
    writeFixtureFile(
      fixture,
      "index.mdx",
      [
        "---",
        'title: "Mintlify \\u0053tarter Kit"',
        "description: Example description.",
        "---",
        "Body",
      ].join("\n"),
    );
    const result = runDocsCli(fixture);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /index\.mdx#frontmatter.*starter branding/i);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("documentation CLI rejects directory symlinks without following them", () => {
  const fixture = createCompleteCliFixture();
  try {
    symlinkSync(".", join(fixture, "cycle"), "dir");
    const result = runDocsCli(fixture, [], { timeout: 2_000 });

    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /cycle: symbolic link entries are not supported/i,
    );
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
  assertHasError(
    errors,
    /docs\.json#\/route.*prohibited legacy API v1\/v2 identifier/i,
  );
});

test("collects shared strings without following recursive object cycles", () => {
  const shared = { label: "Mintlify Starter Kit" };
  const value = { first: shared, second: shared };
  value.self = value;
  shared.parent = value;

  assert.deepEqual(collectJsonStrings(value), [
    { pointer: "/first/label", value: "Mintlify Starter Kit" },
    { pointer: "/second/label", value: "Mintlify Starter Kit" },
  ]);
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
  assert.equal(CANONICAL_NAVIGATION_PAGES.length, 38);
  assert.equal(TRANSLATED_LOCALES.length, 16);
  assert.equal(LOCALIZED_HOME_PAGES.length, 16);
  assert.equal(LOCALIZED_NAVIGATION_PAGES.length, 608);
  assert.equal(REQUIRED_NAVIGATION_PAGES.length, 646);
  assert.equal(REQUIRED_PUBLISHED_PAGES.length, 663);
  assert.equal(FROZEN_SOURCE_PAGES.length, 59);
  assert.equal(Object.keys(FROZEN_MIGRATION_DECISIONS).length, 59);
  assert.equal(EXPECTED_REDIRECT_SOURCES.length, 67);
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
  const { inventory, marker } = committedRedirectState();

  assert.equal(inventory.length, 67);
  assert.ok(["current", "final"].includes(marker.phase));
  assert.equal(assertRedirectRepositoryState(marker, inventory), marker.phase);
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
    destinations.get("/get-started/api-reference"),
    "/api-reference/customers/post-v3-customers",
  );
  assert.equal(
    destinations.get("/compliance/merchant-onboarding"),
    "/knowledge-base/business-onboarding/overview",
  );
  assert.equal(
    destinations.get("/individual-onboarding/api-reference"),
    "/integration/onboarding/customers#individual-customers",
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
    "/api-reference/introduction#handle-errors",
  );
  assert.equal(
    destinations.get("/reference/webhooks"),
    "/integration/webhooks",
  );
  assert.equal(
    destinations.get("/reference/endpoint-map"),
    "/api-reference/customers/post-v3-customers",
  );
  assert.equal(
    destinations.get("/integration/using-the-api-reference"),
    "/api-reference/customers/post-v3-customers",
  );
  assert.equal(
    inventory.some(({ source }) => source.startsWith("/t-c")),
    false,
  );
});

test("keeps generic-reference migration rows on the customer-creation entry point", () => {
  const ledger = committedLedger();
  for (const sourcePath of [
    "content/get-started/api-reference.mdx",
    "content/reference/endpoint-map.mdx",
  ]) {
    const expectedDestination = "/api-reference/customers/post-v3-customers";
    assert.equal(
      FROZEN_MIGRATION_DECISIONS[sourcePath].destination,
      expectedDestination,
    );
    const row = ledger.find((entry) => entry.sourcePath === sourcePath);
    assert.equal(row?.destination, expectedDestination);
    assert.match(row?.notes ?? "", /customer-creation API Reference entry point/i);
  }
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
