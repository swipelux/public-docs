import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

function links(text) {
  return [
    ...[...text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]),
    ...[...text.matchAll(/\bhref=(?:"([^"]+)"|'([^']+)')/g)].map(
      (match) => match[1] ?? match[2],
    ),
  ];
}

function body(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n/, "");
}

function finalBlock(text) {
  return body(text).trim().split(/\n\s*\n/).at(-1) ?? "";
}

function hasConcreteNextAction(text) {
  const content = body(text).trim();
  const tail = content.slice(Math.max(0, content.length - 1400));
  const internalLink = /\]\(\/(?:integration|api-reference)(?:[)/#?]|$)/;
  const cardLink = /\bhref="\/(?:integration|api-reference)(?:["/#?]|$)/;

  const nextHeading = [...tail.matchAll(/^## (?:Next step|Next: .+)$/gm)].at(-1);
  if (nextHeading) {
    const nextSection = tail.slice(nextHeading.index);
    if (internalLink.test(nextSection) || cardLink.test(nextSection)) return true;
  }

  if (
    /<(?:CardGroup|Columns)\b[\s\S]*<\/(?:CardGroup|Columns)>\s*$/.test(tail) &&
    cardLink.test(tail)
  ) {
    return true;
  }

  const last = finalBlock(text);
  return internalLink.test(last) || cardLink.test(last);
}

test("derives every canonical Integration page from docs.json", () => {
  assert.equal(new Set(PAGES).size, PAGES.length);
  assert.ok(PAGES.length > 0);
  for (const page of PAGES) assert.doesNotThrow(() => readPage(page));
});

for (const page of PAGES) {
  test(`${page}.mdx contains only canonical public links and language`, () => {
    const text = readPage(page);

    for (const href of links(text)) {
      if (!href.startsWith("/")) continue;
      const route = href.split(/[?#]/, 1)[0].replace(/\/$/, "");
      assert.equal(
        RETIRED_ROUTES.has(route),
        false,
        `${page}.mdx links directly to retired route ${route}`,
      );
      assert.doesNotMatch(
        route,
        /^\/v(?:1|2)(?:\/|$)|\/api-reference\/v(?:1|2)(?:\/|$)/i,
        `${page}.mdx links to a retired API version: ${route}`,
      );
    }

    for (const [pattern, label] of PROHIBITED_PATTERNS) {
      assert.doesNotMatch(text, pattern, `${page}.mdx contains ${label}`);
    }
    assert.doesNotMatch(
      text,
      /@(?:account|recipient|destination|quote|task-submission)\.json\b/i,
      `${page}.mdx references an undefined JSON file`,
    );
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
