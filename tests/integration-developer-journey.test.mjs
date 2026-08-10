import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { getDefaultNavigation } from "../scripts/lib/docs-validation.mjs";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(read("docs.json"));

const INTEGRATION_GROUPS = [
  {
    group: "Get started",
    pages: [
      "integration/overview",
      "integration/quickstart",
      "integration/authentication",
      "integration/sandbox",
    ],
  },
  {
    group: "Onboard customers",
    pages: [
      "integration/onboarding/customers",
      "integration/onboarding/capabilities-and-requirements",
    ],
  },
  {
    group: "Build money flows",
    pages: [
      "integration/common-flows",
      "integration/accounts",
      "integration/issue-bank-account",
      "integration/recipients",
      "integration/receive-funds",
      "integration/send-funds",
      "integration/quotes-and-transfers",
    ],
  },
  {
    group: "Launch",
    pages: ["integration/webhooks", "integration/go-live"],
  },
];

const INTEGRATION_PAGES = INTEGRATION_GROUPS.flatMap(({ pages }) => pages);
const RETIRED_FILES = [
  "integration/rules.mdx",
  "integration/api-reliability.mdx",
  "integration/sync-and-reconciliation.mdx",
  "integration/production-readiness.mdx",
  "integration/starter-kit.mdx",
];
const RETIRED_ROUTES = [
  "/integration/rules",
  "/integration/api-reliability",
  "/integration/sync-and-reconciliation",
  "/integration/production-readiness",
  "/integration/starter-kit",
];

function page(route) {
  return read(`${route}.mdx`);
}

test("publishes the approved 15-page Integration journey", () => {
  const integration = getDefaultNavigation(config.navigation).tabs.find(
    ({ tab }) => tab === "Integration Docs",
  );
  assert.deepEqual(integration?.groups, INTEGRATION_GROUPS);
  assert.equal(INTEGRATION_PAGES.length, 15);

  for (const route of INTEGRATION_PAGES) {
    assert.equal(existsSync(`${route}.mdx`), true, `${route}.mdx must exist`);
  }
  for (const path of RETIRED_FILES) {
    assert.equal(existsSync(path), false, `${path} must be retired`);
  }
});

test("publishes API Reference overview and versioning before generated endpoints", () => {
  const reference = getDefaultNavigation(config.navigation).tabs.find(
    ({ tab }) => tab === "API Reference",
  );
  assert.deepEqual(reference, {
    tab: "API Reference",
    groups: [
      { group: "Overview", pages: ["api-reference/introduction"] },
      {
        group: "Versioning",
        icon: "code-branch",
        pages: [
          "api-reference/versioning/migrate-to-v3",
          "api-reference/versioning/changelog",
        ],
      },
      { group: "Endpoints", openapi: "openapi.json", pages: [] },
    ],
  });

  const text = page("api-reference/introduction");
  for (const value of [
    "Idempotency-Key",
    "Idempotency-Replayed",
    "application/problem+json",
    "errors[].pointer",
    "X-Request-Id",
    "correlationId",
  ]) {
    assert.match(text, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("homepage and overview lead with outcomes and the product demo", () => {
  const homepage = read("index.mdx");
  assert.match(homepage, /^title: "Build with Swipelux"$/m);
  for (const title of [
    "Start integrating",
    "Explore API",
    "Compliance and onboarding",
    "Receive funds",
    "Send funds",
    "Issue a bank account",
  ]) {
    assert.match(homepage, new RegExp(`title=["']${title}["']`));
  }
  assert.match(
    homepage,
    /<Card\b(?=[^>]*title=["']Issue a bank account["'])(?=[^>]*icon=["']building-columns["'])[^>]*>/,
  );
  assert.match(homepage, /https:\/\/demo\.swipelux\.com/);
  assert.match(homepage, /https:\/\/github\.com\/swipelux\/neobank-starter/);

  const overview = page("integration/overview");
  assert.match(overview, /```mermaid/);
  assert.match(overview, /Create customer[\s\S]*Activate capability[\s\S]*Complete open tasks/i);
  assert.match(overview, /https:\/\/demo\.swipelux\.com/);
  assert.match(overview, /product|UI reference/i);
  assert.doesNotMatch(overview, /^## Core resources$/m);
});

test("onboarding and sandbox use capability and task readiness only", () => {
  const onboarding = [
    page("integration/onboarding/customers"),
    page("integration/onboarding/capabilities-and-requirements"),
    page("integration/sandbox"),
  ].join("\n");

  assert.match(
    page("integration/onboarding/capabilities-and-requirements"),
    /^title: "Capabilities and tasks"$/m,
  );
  assert.match(onboarding, /openTaskIds|open tasks/i);
  assert.doesNotMatch(onboarding, /customer verification state/i);
  assert.doesNotMatch(
    page("integration/sandbox"),
    /\/v3\/sandbox\/customers\/\{customerId\}\/verification/,
  );
});

test("webhooks document authenticated at-least-once processing", () => {
  const text = page("integration/webhooks");
  for (const value of [
    "svix-id",
    "svix-timestamp",
    "svix-signature",
    "raw request body",
    "at least once",
    "duplicate",
    "delayed",
    "out of order",
    "durable inbox",
    "return `2xx`",
    "refetch",
    "manual replay",
  ]) {
    assert.match(text, new RegExp(value, "i"));
  }
  assert.doesNotMatch(text, /contact Swipelux before subscribing/i);
  assert.doesNotMatch(text, /\/integration\/sync-and-reconciliation/);
});

test("Go live explains production-space business KYB and controlled launch", () => {
  const text = page("integration/go-live");
  assert.match(text, /Create a production space/i);
  assert.match(text, /KYB tab/i);
  assert.match(text, /https:\/\/www\.swipelux\.app\/kyb/);
  assert.match(text, /your business|integrating business/i);
  assert.match(text, /after[^.]{0,100}(?:approved|verified)[^.]{0,120}(?:create|creating)[^.]{0,80}customers?[^.]{0,80}transactions?/i);
  assert.match(text, /separate[^.]{0,120}(?:credentials|configuration|resource IDs|webhook)/i);
  assert.match(text, /low-value|controlled smoke test/i);
  assert.match(text, /owner/i);
  assert.match(text, /stop condition/i);
  assert.match(text, /gradually/i);
});

test("canonical pages never link to retired Integration routes", () => {
  for (const route of ["index", "api-reference/introduction", ...INTEGRATION_PAGES]) {
    const text = page(route);
    for (const retired of RETIRED_ROUTES) {
      assert.doesNotMatch(
        text,
        new RegExp(`${retired.replaceAll("/", "\\/")}(?:[#?)"']|$)`),
        `${route}.mdx links to retired route ${retired}`,
      );
    }
  }
});
