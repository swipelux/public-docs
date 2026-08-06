import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { readPage } from "./helpers/content.mjs";

const config = JSON.parse(readFileSync("docs.json", "utf8"));
const integrationTab = config.navigation.tabs.find(
  ({ tab }) => tab === "Integration Docs",
);
assert.ok(integrationTab, "Missing Integration Docs tab");

const PAGES = integrationTab.groups.flatMap(({ pages }) => pages);
const RETIRED_ROUTES = new Set([
  "/integration/environments",
  "/integration/errors",
  "/integration/pagination-and-sync",
  "/integration/request-safety",
  "/integration/using-the-api-reference",
  "/integration/onboarding/individuals",
  "/integration/onboarding/businesses",
  "/integration/onboarding/tasks-and-submissions",
  "/integration/onboarding/documents",
]);

const MAX_WORDS = new Map([
  ["integration/webhooks", 900],
  ["integration/api-reliability", 800],
  ["integration/sync-and-reconciliation", 800],
  ["integration/production-readiness", 800],
  ["integration/starter-kit", 500],
]);

const PROHIBITED_PATTERNS = [
  [/\bContract boundary\b/i, "legacy contract-boundary heading"],
  [/\bReplay writes safely\b/i, "legacy replay inventory heading"],
  [/\bGenerated event contracts\b/i, "generated event catalog heading"],
  [/\bopenapi(?:-coverage|-provenance)?\.json\b/i, "documentation-generation file"],
  [/\bx-mint\b/i, "documentation-generation metadata"],
  [/\bsource precedence\b|\bsource of truth\b/i, "source-precedence language"],
  [/\bprovider orchestration\b|\bprovider names?\b/i, "provider internals"],
  [/\binternal review\b|\breview-required\b|\bcontract-rewrite\b/i, "review internals"],
  [
    /\bdocumentation generation\b|\bgenerated (?:event contracts?|event reference|payload pages?)\b/i,
    "generation internals",
  ],
  [/\bmigration (?:mechanics|notes?)\b/i, "migration internals"],
  [/\bStage [A-D]\b|\bTask \d+\b/i, "implementation-stage language"],
];

function withoutFencedCode(text) {
  return text
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
}

function normalizeReferenceLabel(label) {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

function referenceDefinitions(text) {
  const definitions = new Map();
  for (const match of withoutFencedCode(text).matchAll(
    /^\s{0,3}\[([^\]]+)\]:[ \t]*(?:\n[ \t]+)?(?:<([^>]+)>|(\S+))/gm,
  )) {
    definitions.set(normalizeReferenceLabel(match[1]), match[2] ?? match[3]);
  }
  return definitions;
}

function linkUsages(text) {
  const source = withoutFencedCode(text);
  const definitions = referenceDefinitions(source);
  const usages = [
    ...[
      ...source.matchAll(/(?<!!)\[([^\]]+)\]\(\s*(?:<([^>]+)>|([^\s)]+))/g),
    ].map((match) => ({ label: match[1], href: match[2] ?? match[3] })),
    ...[
      ...source.matchAll(
        /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|\{\s*"([^"]+)"\s*\}|\{\s*'([^']+)'\s*\})/g,
      ),
    ].map((match) => ({
      label: "",
      href: match[1] ?? match[2] ?? match[3] ?? match[4],
    })),
  ];

  for (const match of source.matchAll(/(?<!!)\[([^\]]+)\]\[([^\]]*)\]/g)) {
    const reference = normalizeReferenceLabel(match[2] || match[1]);
    const href = definitions.get(reference);
    if (href) usages.push({ label: match[1], href });
  }

  return usages;
}

function links(text) {
  return [
    ...linkUsages(text).map(({ href }) => href),
    ...referenceDefinitions(text).values(),
  ];
}

function assertCanonicalPublicLinks(label, text) {
  for (const href of links(text)) {
    if (!href.startsWith("/")) continue;
    const route = href.split(/[?#]/, 1)[0].replace(/\/$/, "");
    assert.equal(
      RETIRED_ROUTES.has(route),
      false,
      `${label} links directly to retired route ${route}`,
    );
    assert.doesNotMatch(
      route,
      /^\/v(?:1|2)(?:\/|$)|\/api-reference\/v(?:1|2)(?:\/|$)/i,
      `${label} links to a retired API version: ${route}`,
    );
  }
}

function assertJsonFileReferencesExist(label, text) {
  const references = [
    ...text.matchAll(
      /(?:^|[\s"'`=(])@((?:(?:(?:\.\.?\/)+)|\/)?[A-Za-z0-9][A-Za-z0-9._/-]*\.json)\b/g,
    ),
  ].map((match) => match[1]);

  for (const reference of references) {
    assert.equal(
      existsSync(reference),
      true,
      `${label} references undefined JSON file @${reference}`,
    );
  }
}

function body(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "");
}

function finalBlock(text) {
  const blocks = body(text).trim().split(/\n\s*\n/);
  let start = blocks.length - 1;
  while (start > 0 && isReferenceDefinitionBlock(blocks[start])) start -= 1;
  return blocks.slice(start).join("\n\n");
}

function isReferenceDefinitionBlock(block) {
  return block
    .trim()
    .split("\n")
    .every(
      (line) =>
        /^\s{0,3}\[[^\]]+\]:/.test(line) ||
        (/^[ \t]+/.test(line) && line.trim().length > 0),
    );
}

function hasActionableCanonicalLink(text) {
  const source = withoutFencedCode(text);
  const hasCanonicalLink = linkUsages(source).some(({ href }) =>
    /^\/(?:integration|api-reference)(?:[\/#?]|$)/.test(href),
  );
  if (!hasCanonicalLink) return false;

  const proseOutsideLinks = source
    .replace(/^#{1,6} .+$/gm, "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .replace(/\[[^\]]+\]\[[^\]]*\]/g, "")
    .replace(/^\s{0,3}\[[^\]]+\]:[ \t]*(?:\n[ \t]+)?(?:<[^>]+>|\S+).*$/gm, "")
    .replace(/<[^>]+>/g, "");
  if (!/[A-Za-z]{2,}/.test(proseOutsideLinks)) return false;

  const readableText = source
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/^\s{0,3}\[[^\]]+\]:[ \t]*(?:\n[ \t]+)?(?:<[^>]+>|\S+).*$/gm, "")
    .replace(/<[^>]+>/g, "");
  return /\b(?:add|apply|build|choose|complete|configure|connect|continue|create|follow|implement|inspect|issue|keep|monitor|open|persist|prepare|read|register|review|run|send|start|store|take|test|use|verify|wire)\b/i.test(
    readableText,
  );
}

function hasConcreteNextAction(text) {
  const visibleText = withoutFencedCode(text);
  const content = body(visibleText).trim();
  const tail = content.slice(Math.max(0, content.length - 1400));

  const nextHeading = [...tail.matchAll(/^## (?:Next step|Next: .+)$/gm)].at(-1);
  if (nextHeading) {
    const nextSection = tail.slice(nextHeading.index);
    if (hasActionableCanonicalLink(nextSection)) return true;
  }

  if (/<(?:CardGroup|Columns)\b[\s\S]*<\/(?:CardGroup|Columns)>\s*$/.test(tail)) {
    if (!hasActionableCanonicalLink(tail)) return false;
    return true;
  }

  return hasActionableCanonicalLink(finalBlock(visibleText));
}

test("derives every canonical Integration page from docs.json", () => {
  assert.equal(PAGES.length, 19, "Integration navigation must contain 19 pages");
  assert.equal(new Set(PAGES).size, 19, "Integration pages must be unique");
  for (const page of PAGES) assert.doesNotThrow(() => readPage(page));
});

test("editorial guards reject representative link, action, and JSON mutations", () => {
  assert.equal(
    hasConcreteNextAction("[Quickstart](/integration/quickstart)"),
    false,
    "A bare internal link is not an actionable next step",
  );
  assert.throws(
    () =>
      assertCanonicalPublicLinks(
        "reference-link mutation",
        "Read the [old guide][old].\n\n[old]: /integration/errors",
      ),
    { name: "AssertionError" },
  );
  for (const expression of [
    '<Card href={"/integration/errors"}>Old guide</Card>',
    "<Card href={'/integration/errors'}>Old guide</Card>",
  ]) {
    assert.throws(
      () => assertCanonicalPublicLinks("static MDX mutation", expression),
      { name: "AssertionError" },
    );
  }
  assert.equal(
    hasConcreteNextAction(
      "## Next step\n\n```md\nRun the [Quickstart](/integration/quickstart).\n```",
    ),
    false,
    "A link inside fenced code is not a next action",
  );
  assert.equal(
    hasConcreteNextAction(
      "{/* Continue with [Quickstart](/integration/quickstart). */}",
    ),
    false,
    "A link inside an MDX comment is not a next action",
  );
  assert.equal(
    hasConcreteNextAction(
      "{ /* Continue with [Quickstart](/integration/quickstart). */ }",
    ),
    false,
    "A link inside a spaced MDX comment is not a next action",
  );
  assert.doesNotThrow(() =>
    assertCanonicalPublicLinks(
      "commented route fixture",
      "{/* Read the [retired guide](/integration/errors). */}",
    ),
  );
  assert.equal(
    hasConcreteNextAction(
      "## Next step\n\nRead the guide.\n\n[guide]: /integration/quickstart",
    ),
    false,
    "An unused reference definition is not a next action",
  );
  assert.equal(
    hasConcreteNextAction(
      "## Next step\n\nContinue with the [Quickstart][guide].\n\n[guide]: /integration/quickstart",
    ),
    true,
    "A used reference link remains actionable",
  );
  assert.throws(
    () =>
      assertJsonFileReferencesExist(
        "JSON mutation",
        "curl --data @customer.json https://example.com",
      ),
    { name: "AssertionError" },
  );
  assert.throws(
    () =>
      assertJsonFileReferencesExist(
        "parent traversal JSON mutation",
        "curl --data @../../missing.json https://example.com",
      ),
    { name: "AssertionError" },
  );
  assert.doesNotThrow(() =>
    assertJsonFileReferencesExist("existing JSON fixture", "curl --data @docs.json"),
  );
  assert.equal(
    hasConcreteNextAction("Continue with the [Quickstart](/integration/quickstart)."),
    true,
    "Inline links remain actionable",
  );
  for (const card of [
    '<CardGroup><Card href="/integration/quickstart">Open Quickstart</Card></CardGroup>',
    "<CardGroup><Card href='/integration/quickstart'>Open Quickstart</Card></CardGroup>",
    '<CardGroup><Card href={"/integration/quickstart"}>Open Quickstart</Card></CardGroup>',
    "<CardGroup><Card href={'/integration/quickstart'}>Open Quickstart</Card></CardGroup>",
  ]) {
    assert.equal(
      hasConcreteNextAction(card),
      true,
      "Visible MDX hrefs remain actionable",
    );
  }
});

for (const page of PAGES) {
  test(`${page}.mdx contains only canonical public links and language`, () => {
    const text = readPage(page);

    assertCanonicalPublicLinks(`${page}.mdx`, text);

    for (const [pattern, label] of PROHIBITED_PATTERNS) {
      assert.doesNotMatch(text, pattern, `${page}.mdx contains ${label}`);
    }
    assertJsonFileReferencesExist(`${page}.mdx`, text);
    assert.doesNotMatch(
      text,
      /(^|[^A-Za-z0-9])v(?:1|2)(?=$|[^A-Za-z0-9])/i,
      `${page}.mdx contains a retired API version identifier`,
    );
  });

  test(`${page}.mdx ends with a concrete linked next action`, () => {
    const text = readPage(page);
    assert.equal(
      hasConcreteNextAction(text),
      true,
      `${page}.mdx must end with a linked next developer action`,
    );
  });

  const maximum = MAX_WORDS.get(page);
  if (maximum !== undefined) {
    test(`${page}.mdx stays below its maximum workflow length`, () => {
      const words = readPage(page).match(/\S+/g) ?? [];
      assert.ok(
        words.length <= maximum,
        `${page}.mdx has ${words.length} words; maximum is ${maximum}`,
      );
    });
  }
}
