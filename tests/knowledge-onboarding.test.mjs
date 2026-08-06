import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import {
  SOURCE_COMMIT,
  collectNavigationPages,
  parseFrontmatter,
  parseMigrationLedger,
} from "../scripts/lib/docs-validation.mjs";
import { assertPages, readPage } from "./helpers/content.mjs";

const PAGES = [
  "knowledge-base/business-onboarding/overview",
  "knowledge-base/business-onboarding/entity-and-business-types",
  "knowledge-base/business-onboarding/document-requirements",
  "knowledge-base/business-onboarding/shareholders-ubos-and-control-persons",
  "knowledge-base/business-onboarding/kyb-workflow",
  "knowledge-base/business-onboarding/faq",
  "knowledge-base/individual-onboarding/overview",
  "knowledge-base/individual-onboarding/verification-levels",
  "knowledge-base/individual-onboarding/status-and-workflow",
  "knowledge-base/individual-onboarding/api-workflow",
];

const SOURCE_MAPPINGS = [
  {
    sourcePath: "content/business-onboarding/index.mdx",
    destination: "/knowledge-base/business-onboarding/overview",
    disposition: "preserved-policy",
    reviewState: "review-required",
  },
  {
    sourcePath: "content/business-onboarding/entity-types.mdx",
    destination: "/knowledge-base/business-onboarding/entity-and-business-types",
    disposition: "preserved-policy",
    reviewState: "review-required",
  },
  {
    sourcePath: "content/business-onboarding/documents.mdx",
    destination: "/knowledge-base/business-onboarding/document-requirements",
    disposition: "preserved-policy",
    reviewState: "review-required",
  },
  {
    sourcePath: "content/business-onboarding/shareholders.mdx",
    destination:
      "/knowledge-base/business-onboarding/shareholders-ubos-and-control-persons",
    disposition: "preserved-policy",
    reviewState: "review-required",
  },
  {
    sourcePath: "content/business-onboarding/workflow.mdx",
    destination: "/knowledge-base/business-onboarding/kyb-workflow",
    disposition: "preserved-policy",
    reviewState: "review-required",
  },
  {
    sourcePath: "content/business-onboarding/faq.mdx",
    destination: "/knowledge-base/business-onboarding/faq",
    disposition: "preserved-policy",
    reviewState: "review-required",
  },
  {
    sourcePath: "content/individual-onboarding/index.mdx",
    destination: "/knowledge-base/individual-onboarding/overview",
    disposition: "preserved-policy",
    reviewState: "review-required",
  },
  {
    sourcePath: "content/individual-onboarding/verification-levels.mdx",
    destination: "/knowledge-base/individual-onboarding/verification-levels",
    disposition: "preserved-policy",
    reviewState: "review-required",
  },
  {
    sourcePath: "content/individual-onboarding/status-workflow.mdx",
    destination: "/knowledge-base/individual-onboarding/status-and-workflow",
    disposition: "preserved-policy",
    reviewState: "review-required",
  },
  {
    sourcePath: "content/individual-onboarding/api-reference.mdx",
    destination: "/knowledge-base/individual-onboarding/api-workflow",
    disposition: "contract-rewrite",
    reviewState: "not-applicable",
  },
];

const EXPECTED_HEADINGS = new Map([
  [
    "knowledge-base/business-onboarding/overview",
    [
      [2, "Business onboarding (KYB)"],
      [2, "What KYB covers"],
      [2, "Information reviewed"],
      [3, "Legal entity profile"],
      [3, "Ownership and control"],
      [3, "Documents and authority"],
      [3, "Business activity and risk"],
      [2, "Policy concepts and current tasks"],
      [2, "Implementation"],
    ],
  ],
  [
    "knowledge-base/business-onboarding/entity-and-business-types",
    [
      [2, "Entity and business classification concepts"],
      [2, "Business entity types"],
      [2, "Business types (industry)"],
      [2, "Source of funds"],
      [2, "Purpose of funds"],
      [2, "How to use these concepts"],
    ],
  ],
  [
    "knowledge-base/business-onboarding/document-requirements",
    [
      [2, "KYB document requirements"],
      [2, "Supported countries"],
      [2, "Current task and upload rules"],
      [2, "Document categories"],
      [3, "Certificate of incorporation"],
      [3, "Corporate structure"],
      [3, "Director structure"],
      [3, "Power of attorney"],
      [3, "Proof of address"],
      [2, "Other evidence categories"],
    ],
  ],
  [
    "knowledge-base/business-onboarding/shareholders-ubos-and-control-persons",
    [
      [2, "Shareholders, UBOs, and control persons"],
      [2, "Role distinctions"],
      [2, "UBO definition and threshold"],
      [2, "Who must be identified"],
      [2, "Ownership chains"],
      [2, "Evidence and current API resources"],
      [2, "Identity evidence"],
    ],
  ],
  [
    "knowledge-base/business-onboarding/kyb-workflow",
    [
      [2, "KYB workflow"],
      [2, "Current workflow sequence"],
      [3, "1. Create the business customer"],
      [3, "2. Maintain related parties"],
      [3, "3. Discover and request an eligible capability"],
      [3, "4. Read current tasks"],
      [3, "5. Upload documents requested by the current task"],
      [3, "6. Submit complete task answers"],
      [3, "7. Monitor current resources"],
      [2, "Enhanced due diligence (EDD) triggers"],
      [2, "Policy review outcomes"],
      [2, "Verification timeline"],
      [2, "Common rejection reasons"],
      [2, "Policy terms and API states"],
    ],
  ],
  [
    "knowledge-base/business-onboarding/faq",
    [
      [2, "Frequently asked questions"],
      [2, "Ownership and control"],
      [3, "What if a director owns less than 25%?"],
      [3, "Can the director completing KYB skip the power of attorney?"],
      [3, "What if my company is owned by another company?"],
      [3, "How do I add owners and control persons to a business customer?"],
      [2, "Documents"],
      [3, "Is corporate structure a document upload or resource data?"],
      [3, "What proof of address documents do you accept?"],
      [3, "What file formats are supported?"],
      [2, "Support"],
    ],
  ],
  [
    "knowledge-base/individual-onboarding/overview",
    [
      [2, "Individual onboarding (KYC)"],
      [2, "What KYC covers"],
      [2, "KYC verification levels"],
      [2, "Information collected"],
      [2, "Current implementation"],
      [2, "Support"],
    ],
  ],
  [
    "knowledge-base/individual-onboarding/verification-levels",
    [
      [2, "KYC verification levels"],
      [2, "Simplified KYC"],
      [3, "Required information"],
      [3, "When it is used"],
      [2, "Standard KYC"],
      [3, "Required documents"],
      [3, "Accepted ID documents"],
      [2, "Enhanced KYC (enhanced due diligence)"],
      [3, "Required documents"],
      [3, "Triggers for enhanced KYC"],
      [3, "Proof of address requirements"],
      [3, "Proof of funds requirements"],
      [2, "Policy tiers and current tasks"],
    ],
  ],
  [
    "knowledge-base/individual-onboarding/status-and-workflow",
    [
      [2, "Verification status and workflow"],
      [2, "Policy-facing review concepts"],
      [2, "Standard KYC review flow"],
      [2, "Enhanced KYC review flow"],
      [2, "Common rejection reasons"],
      [2, "Verification timeline"],
      [2, "Current API state vocabularies"],
      [2, "Events and current state"],
      [2, "Support"],
    ],
  ],
  [
    "knowledge-base/individual-onboarding/api-workflow",
    [
      [2, "Individual onboarding API workflow"],
      [2, "Workflow map"],
      [3, "1. Create the individual customer"],
      [3, "2. Discover and request an eligible capability"],
      [3, "3. Read the current capability and applications"],
      [3, "4. Fetch current task detail"],
      [3, "5. Complete hosted sessions or submit task answers"],
      [3, "6. Upload documents only when requested"],
      [3, "7. Refetch current resources"],
      [2, "Generated operation map"],
      [2, "Policy and implementation guidance"],
    ],
  ],
]);

const config = JSON.parse(readFileSync("docs.json", "utf8"));
const coverage = JSON.parse(readFileSync("openapi-coverage.json", "utf8"));
const openapi = JSON.parse(readFileSync("openapi.json", "utf8"));
const navigationPages = collectNavigationPages(config.navigation);
const tick = String.fromCharCode(96);

function pageFile(page) {
  return page + ".mdx";
}

function allPagesExist() {
  return PAGES.every((page) => existsSync(pageFile(page)));
}

function requirePages(t) {
  if (allPagesExist()) return true;
  t.skip("content assertions wait for the ten page-existence RED checks");
  return false;
}

function headingHierarchy(text) {
  const { body } = parseFrontmatter(text);
  return [...body.matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)].map((match) => [
    match[1].length,
    match[2],
  ]);
}

function sectionBody(text, heading) {
  const { body } = parseFrontmatter(text);
  const lines = body.replaceAll("\r\n", "\n").split("\n");
  const index = lines.findIndex((line) => {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    return match?.[2] === heading;
  });
  assert.notEqual(index, -1, "Missing section: " + heading);

  const level = /^#+/.exec(lines[index])[0].length;
  let end = lines.length;
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const match = /^(#{1,6})\s+/.exec(lines[cursor]);
    if (match && match[1].length <= level) {
      end = cursor;
      break;
    }
  }
  return lines.slice(index + 1, end).join("\n").trim();
}

function markdownListItems(text) {
  return text
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
}

function firstMarkdownTable(text) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const start = lines.findIndex((line) => /^\|.*\|$/.test(line));
  assert.notEqual(start, -1, "Expected a Markdown table");

  const tableLines = [];
  for (let index = start; index < lines.length; index += 1) {
    if (!/^\|.*\|$/.test(lines[index])) break;
    tableLines.push(lines[index]);
  }

  assert.ok(tableLines.length >= 3, "Expected a header, separator, and data row");
  assert.match(tableLines[1], /^\|(?:\s*:?-+:?\s*\|)+$/);
  return tableLines
    .filter((_, index) => index !== 1)
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
}

function assertContainsExactLines(label, text, expectedLines) {
  const lines = new Set(text.replaceAll("\r\n", "\n").split("\n"));
  for (const line of expectedLines) {
    assert.ok(lines.has(line), label + " is missing exact line: " + line);
  }
}

function generatedOperation(method, path) {
  const normalizedMethod = method.toLowerCase();
  const operation = coverage.operations.find(
    (candidate) =>
      candidate.method === normalizedMethod && candidate.path === path,
  );
  assert.ok(operation, method.toUpperCase() + " " + path + " missing from coverage");
  assert.ok(
    openapi.paths?.[path]?.[normalizedMethod],
    method.toUpperCase() + " " + path + " missing from OpenAPI",
  );
  return operation;
}

function generatedOperationLink(method, path) {
  const operation = generatedOperation(method, path);
  return (
    "[" +
    tick +
    method.toUpperCase() +
    " " +
    path +
    tick +
    "](" +
    operation.href +
    ")"
  );
}

function assertGeneratedLinks(label, text, operations) {
  for (const [method, path] of operations) {
    const expected = generatedOperationLink(method, path);
    assert.ok(text.includes(expected), label + " is missing " + expected);
  }
}

function linkedOperationLabels(text) {
  return [
    ...text.matchAll(
      /\[\`(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS|TRACE) (\/v3\/[^`]+)\`\]\(([^)]+)\)/g,
    ),
  ].map((match) => ({
    end: match.index + match[0].length,
    href: match[3],
    method: match[1].toLowerCase(),
    path: match[2],
    start: match.index,
  }));
}

function assertEveryOperationLabelIsCoverageLinked(label, text) {
  const links = linkedOperationLabels(text);
  const labels = [
    ...text.matchAll(
      /\`(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS|TRACE) (\/v3\/[^`]+)\`/g,
    ),
  ];

  for (const match of labels) {
    assert.ok(
      links.some(
        (link) =>
          match.index >= link.start &&
          match.index + match[0].length <= link.end,
      ),
      label + " has an unlinked operation label: " + match[0],
    );
  }

  for (const link of links) {
    assert.equal(
      link.href,
      generatedOperation(link.method, link.path).href,
      label +
        " links " +
        link.method.toUpperCase() +
        " " +
        link.path +
        " to the wrong href",
    );
  }
}

function normalizedDocumentFormats(fragment) {
  return fragment
    .replace(/\b(?:and|or)\b/gi, ",")
    .split(/[,/]/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.toUpperCase())
    .toSorted();
}

function contractDocumentFormats(upload) {
  const multipart = upload?.requestBody?.content?.["multipart/form-data"]?.schema;
  const description = multipart?.properties?.file?.description ?? "";
  const match = /Raw (.+?) file bytes/i.exec(description);
  assert.ok(match, "document upload contract must name accepted formats");
  return normalizedDocumentFormats(match[1]);
}

function publishedDocumentUploadClaims(text) {
  return [...text.matchAll(/accepts ([^.\n]+?) files up to (\d+) MB/gi)].map(
    (match) => ({
      formats: normalizedDocumentFormats(match[1]),
      maxSizeMb: Number(match[2]),
    }),
  );
}

function assertNoAffirmativeJsonEncoding(label, text) {
  const sentences = text
    .replaceAll("\r\n", "\n")
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    const mentionsAction = /\b(?:encode|encoded|encoding|wrap|wrapped|wrapping)\b/i.test(
      sentence,
    );
    const mentionsJson = /\bJSON\b/i.test(sentence);
    const mentionsPayload = /\b(?:file|document|bytes|string)\b/i.test(sentence);
    if (!mentionsAction || !mentionsJson || !mentionsPayload) continue;

    const negated =
      /\b(?:do|must|should|is|are|was|were)\s+not\b[^.!?]{0,40}\b(?:encode|encoded|encoding|wrap|wrapped|wrapping)\b/i.test(
        sentence,
      ) ||
      /\bnever\b[^.!?]{0,40}\b(?:encode|encoded|encoding|wrap|wrapped|wrapping)\b/i.test(
        sentence,
      ) ||
      /\bnot\b[^.!?]{0,30}\b(?:encode|encoded|encoding|wrap|wrapped|wrapping)\b/i.test(
        sentence,
      );
    assert.ok(negated, label + " contains affirmative JSON file encoding: " + sentence);
  }
}

function assertDocumentUploadGuidance(label, text, upload) {
  const content = upload?.requestBody?.content ?? {};
  const multipart = content["multipart/form-data"]?.schema;
  const file = multipart?.properties?.file;
  assert.equal(file?.format, "binary");
  assert.ok(multipart?.required?.includes("file"));

  const maxSize = /max (\d+) MB/i.exec(file.description)?.[1];
  assert.ok(maxSize, "document upload description must publish a size limit");
  const expectedMediaTypes = Object.keys(content).toSorted();
  const publishedMediaTypes = [
    ...new Set(
      [...text.matchAll(/\`([a-z][a-z0-9.+-]*\/[a-z0-9.+-]+)\`/gi)].map(
        (match) => match[1],
      ),
    ),
  ].toSorted();
  assert.deepEqual(
    publishedMediaTypes,
    expectedMediaTypes,
    label + " request media types must match OpenAPI",
  );
  assert.match(text, /raw file bytes/i);

  const claims = publishedDocumentUploadClaims(text);
  assert.ok(claims.length > 0, label + " must publish accepted file formats");
  const expectedFormats = contractDocumentFormats(upload);
  for (const claim of claims) {
    assert.deepEqual(
      claim.formats,
      expectedFormats,
      label + " format claim must match OpenAPI",
    );
    assert.equal(
      claim.maxSizeMb,
      Number(maxSize),
      label + " format claim size must match OpenAPI",
    );
  }

  const publishedSizes = [...text.matchAll(/\b(\d+)\s*MB\b/gi)].map((match) =>
    Number(match[1]),
  );
  assert.ok(publishedSizes.length > 0, label + " must publish the upload size");
  for (const publishedSize of publishedSizes) {
    assert.equal(
      publishedSize,
      Number(maxSize),
      label + " contains an upload size that differs from OpenAPI",
    );
  }

  assertNoAffirmativeJsonEncoding(label, text);
}

function enumValues(schemaName, propertyName) {
  const values =
    openapi.components?.schemas?.[schemaName]?.properties?.[propertyName]?.enum;
  assert.ok(
    Array.isArray(values) && values.length > 0,
    schemaName + "." + propertyName + " must define an enum",
  );
  return values;
}

function assertEnumValues(label, text, schemaName, propertyName) {
  for (const value of enumValues(schemaName, propertyName)) {
    assert.ok(
      text.includes(tick + value + tick),
      label + " is missing current " + schemaName + " value " + value,
    );
  }
}

for (const page of PAGES) {
  test("publishes " + page + " once with valid guarded frontmatter", () => {
    assertPages([page]);
    assert.equal(
      navigationPages.filter((candidate) => candidate === page).length,
      1,
      page + " must appear in navigation exactly once",
    );
  });
}

test("preserves the approved heading hierarchy for every onboarding page", (t) => {
  if (!requirePages(t)) return;
  for (const page of PAGES) {
    assert.deepEqual(
      headingHierarchy(readPage(page)),
      EXPECTED_HEADINGS.get(page),
      pageFile(page) + " must preserve the approved hierarchy",
    );
  }
});

test("binds every operation label to its exact coverage-derived href", (t) => {
  if (!requirePages(t)) return;
  for (const page of PAGES) {
    assertEveryOperationLabelIsCoverageLinked(pageFile(page), readPage(page));
  }
});

test("semantic operation-link checks reject one wrong duplicate href", () => {
  const readCustomer = generatedOperation(
    "get",
    "/v3/customers/{customerId}",
  );
  const createCustomer = generatedOperation("post", "/v3/customers");
  assert.notEqual(readCustomer.href, createCustomer.href);

  const duplicatedFixture =
    "[`GET /v3/customers/{customerId}`](" +
    createCustomer.href +
    ")\n" +
    "[`GET /v3/customers/{customerId}`](" +
    readCustomer.href +
    ")";
  assert.throws(
    () =>
      assertEveryOperationLabelIsCoverageLinked(
        "duplicated operation fixture",
        duplicatedFixture,
      ),
    /wrong href/,
  );
});

test("keeps every onboarding ledger row pinned to the frozen source decision", () => {
  const ledger = parseMigrationLedger(
    readFileSync("docs/content-migration-ledger.md", "utf8"),
  );

  for (const expected of SOURCE_MAPPINGS) {
    const matches = ledger.filter(
      (row) => row.sourcePath === expected.sourcePath,
    );
    assert.equal(matches.length, 1, expected.sourcePath + " must appear once");
    assert.deepEqual(
      {
        sourceCommit: matches[0].sourceCommit,
        destination: matches[0].destination,
        disposition: matches[0].disposition,
        reviewState: matches[0].reviewState,
      },
      {
        sourceCommit: SOURCE_COMMIT,
        destination: expected.destination,
        disposition: expected.disposition,
        reviewState: expected.reviewState,
      },
      expected.sourcePath + " must retain the approved migration state",
    );
  }
});

test("preserves business KYB scope without presenting legacy fields as current requests", (t) => {
  if (!requirePages(t)) return;
  const text = readPage("knowledge-base/business-onboarding/overview");

  assert.match(text, /KYB is required before a business customer can transact/i);
  assertContainsExactLines("business overview", text, [
    "- Legal entity formation, registration, tax, trading-name, and address information",
    "- Direct and indirect ownership, voting interests, control persons, directors, officers, and authorized signers",
    "- Formation, ownership, governance, authority, identity, and address evidence",
    "- Business activities, operating countries, expected volumes, source and purpose of funds, flow of funds, revenue, customer-funds handling, and compliance controls",
  ]);
  assert.match(
    text,
    /policy classification concepts, not a fixed set of current request values/i,
  );
  assert.ok(
    text.includes(
      "[business onboarding guide](/integration/onboarding/customers#business-customers)",
    ),
  );
});

test("preserves every entity, industry, source, and purpose classification concept", (t) => {
  if (!requirePages(t)) return;
  const text = readPage(
    "knowledge-base/business-onboarding/entity-and-business-types",
  );

  for (const concept of [
    "Limited Liability Company",
    "Corporation",
    "S Corporation",
    "C Corporation",
    "Partnership",
    "Limited Partnership",
    "Sole Proprietorship",
    "Nonprofit",
    "Trust",
    "Cooperative",
    "DAO",
    "Foundation",
    "Other",
    "Technology",
    "Finance",
    "Healthcare",
    "Retail",
    "E-Commerce",
    "Manufacturing",
    "Real Estate",
    "Consulting",
    "Hospitality",
    "Education",
    "Transportation",
    "Entertainment",
    "Agriculture",
    "Construction",
    "Professional Services",
    "Crypto/Web3",
    "Business Revenue",
    "Investment",
    "Loan",
    "Personal Savings",
    "Third Party Funds",
    "Grant",
    "Operations",
    "Payroll",
    "Vendor Payments",
    "Treasury Management",
    "International Transfers",
  ]) {
    assert.ok(text.includes(concept), "missing classification concept " + concept);
  }

  assert.match(text, /not current request\s+enums/i);
  assert.match(text, /current task requirements determine/i);
  assert.ok(
    text.includes(
      "[Capabilities and tasks](/integration/onboarding/capabilities-and-requirements#complete-current-tasks)",
    ),
  );

  assert.deepEqual(
    firstMarkdownTable(sectionBody(text, "Business entity types"))
      .slice(1)
      .map(([entityType]) => entityType),
    [
      "Limited Liability Company",
      "Corporation",
      "S Corporation",
      "C Corporation",
      "Partnership",
      "Limited Partnership",
      "Sole Proprietorship",
      "Nonprofit",
      "Trust",
      "Cooperative",
      "DAO",
      "Foundation",
      "Other",
    ],
  );
  assert.deepEqual(markdownListItems(sectionBody(text, "Business types (industry)")), [
    "Technology",
    "Finance",
    "Healthcare",
    "Retail",
    "E-Commerce",
    "Manufacturing",
    "Real Estate",
    "Consulting",
    "Hospitality",
    "Education",
    "Transportation",
    "Entertainment",
    "Agriculture",
    "Construction",
    "Professional Services",
    "Crypto/Web3",
    "Other",
  ]);
  assert.deepEqual(markdownListItems(sectionBody(text, "Source of funds")), [
    "Business Revenue",
    "Investment",
    "Loan",
    "Personal Savings",
    "Third Party Funds",
    "Grant",
    "Other",
  ]);
  assert.deepEqual(markdownListItems(sectionBody(text, "Purpose of funds")), [
    "Operations",
    "Payroll",
    "Vendor Payments",
    "Investment",
    "Treasury Management",
    "International Transfers",
    "Other",
  ]);
});

test("preserves business document categories, acceptance, recency, and signature rules", (t) => {
  if (!requirePages(t)) return;
  const text = readPage(
    "knowledge-base/business-onboarding/document-requirements",
  );

  assertContainsExactLines("business documents", text, [
    "US, GB, DE, FR, ES, IT, NL, BE, AT, CH, IE, PT, PL, SE, DK, NO, FI, LU, SG, HK, AU, NZ, CA, JP, KR, AE, IL, BR, MX, IN",
    "- Account for 100% of ownership",
    "- Identify all Ultimate Beneficial Owners (UBOs) who own 25% or more",
    "- Include ownership documents for parent entities when the business is entity-owned",
    "- Date and sign self-generated documents through a verified control person, lawyer, or third-party CPA",
    "- All directors and board members",
    "- All executive officers, including the CEO, CFO, COO, and President",
    "- All UBOs who own 25% or more",
    "- Anyone with significant control over the business",
    "- PO Box addresses",
    "- Virtual office addresses unless accompanied by physical-address evidence",
    "- Documents older than 90 days, except current valid lease agreements",
    "- Mobile phone bills",
    "- Insurance documents",
    "- Documents not addressed to the business legal name",
  ]);
  for (const evidence of [
    "Articles of Incorporation",
    "Certificate of Formation",
    "Partnership Agreement",
    "Business License",
    "Trust Deed",
    "Capitalization Table",
    "Shareholders' Agreement",
    "Shareholder Ledger",
    "Ownership Org Chart",
    "Signed Ownership Attestation",
    "Board Resolution",
    "Register of Directors",
    "Certificate of Incumbency",
    "Authorization Letter",
    "Bank Statement",
    "Utility Bill",
    "Government-Issued Letter",
    "Office Lease Agreement",
    "Commercial Rent Receipt",
  ]) {
    assert.ok(text.includes(evidence), "missing document evidence " + evidence);
  }
  assert.match(text, /Carta, AngelList, and Securitize/i);
  assert.match(text, /do not require an additional lawyer or CPA signature/i);

  assert.deepEqual(
    firstMarkdownTable(sectionBody(text, "Certificate of incorporation")),
    [
      ["Entity type", "Accepted evidence"],
      ["Corporation", "Articles of Incorporation or Certificate of Incorporation"],
      [
        "Limited Liability Company",
        "Articles of Organization or Certificate of Formation",
      ],
      ["Partnership", "Partnership Agreement or Certificate of Partnership"],
      ["Limited Partnership", "Certificate of Limited Partnership"],
      ["Sole Proprietorship", "Business License, DBA Filing, or Trade Name Registration"],
      [
        "Nonprofit",
        "Articles of Incorporation and IRS Determination Letter (501(c)(3))",
      ],
      ["Trust", "Trust Deed or Certificate of Trust"],
      ["Cooperative", "Articles of Incorporation or Bylaws"],
    ],
  );
  assert.deepEqual(firstMarkdownTable(sectionBody(text, "Corporate structure")), [
    ["Document type", "What it shows", "Signature rule"],
    [
      "Capitalization Table",
      "Owners and ownership percentages",
      "Signed unless issued by Carta, AngelList, or Securitize",
    ],
    [
      "Shareholders' Agreement",
      "Owners and ownership percentages",
      "No additional signature specified",
    ],
    ["Stock Certificates", "Shares issued to owners", "No additional signature specified"],
    ["Shareholder Ledger", "Internal ownership record", "Signed by a control person"],
    [
      "Operating Agreement",
      "Member interests in a limited liability company",
      "No additional signature specified",
    ],
    ["Membership Ledger", "Members and their interests", "Signed by a control person"],
    ["K-1 Forms", "Tax evidence of ownership shares", "No additional signature specified"],
    [
      "Ownership Org Chart",
      "Ownership chain and percentages",
      "Signed by a lawyer or third-party CPA",
    ],
    [
      "Signed Ownership Attestation",
      "UBOs and percentages",
      "Signed by a lawyer or third-party CPA",
    ],
  ]);
  assert.deepEqual(firstMarkdownTable(sectionBody(text, "Proof of address")), [
    ["Document type", "Requirements"],
    ["Bank Statement", "Issued within the last 90 days and addressed to the business"],
    [
      "Utility Bill",
      "Electricity, gas, water, or internet; issued within the last 90 days",
    ],
    [
      "Government-Issued Letter",
      "Tax notice, business-license renewal, or similar evidence issued within the last 90 days",
    ],
    ["Office Lease Agreement", "Current and valid; it can be older than 90 days"],
    ["Commercial Rent Receipt", "Issued within the last 90 days"],
  ]);
});

test("derives current document upload instructions from the authoritative contract", (t) => {
  const upload = openapi.paths?.["/v3/customers/{customerId}/documents"]?.post;

  if (!requirePages(t)) return;
  const documentRequirements = readPage(
    "knowledge-base/business-onboarding/document-requirements",
  );
  const faq = readPage("knowledge-base/business-onboarding/faq");
  assertGeneratedLinks("business document requirements", documentRequirements, [
    ["post", "/v3/customers/{customerId}/documents"],
  ]);
  assertGeneratedLinks("business onboarding FAQ", faq, [
    ["post", "/v3/customers/{customerId}/documents"],
  ]);
  assert.ok(
    documentRequirements.includes(
      "[Integration Documents guide](/integration/onboarding/capabilities-and-requirements#upload-documents)",
    ),
  );
  assert.match(documentRequirements, /current task can narrow/i);
  assertDocumentUploadGuidance(
    "business document requirements",
    documentRequirements,
    upload,
  );
  assertDocumentUploadGuidance("business onboarding FAQ", faq, upload);
  assertDocumentUploadGuidance(
    "all onboarding knowledge pages",
    PAGES.map((page) => readPage(page)).join("\n"),
    upload,
  );

  const narrowedUpload = structuredClone(upload);
  narrowedUpload.requestBody.content[
    "multipart/form-data"
  ].schema.properties.file.description =
    "Raw PDF file bytes (max 25 MB); not an encoded JSON string.";
  assert.throws(
    () =>
      assertDocumentUploadGuidance(
        "contract drift fixture",
        documentRequirements,
        narrowedUpload,
      ),
    /format claim must match OpenAPI/,
  );
  assert.throws(
    () =>
      assertDocumentUploadGuidance(
        "contradictory encoding fixture",
        documentRequirements +
          "\nEncode the document into a JSON string before upload.",
        upload,
      ),
    /affirmative JSON file encoding/,
  );
  assert.throws(
    () =>
      assertDocumentUploadGuidance(
        "JSON-wrapped bytes fixture",
        documentRequirements + "\nSend the file bytes wrapped in JSON.",
        upload,
      ),
    /affirmative JSON file encoding/,
  );
  assert.throws(
    () =>
      assertDocumentUploadGuidance(
        "wrong media type fixture",
        documentRequirements + "\nUse `application/json` for the upload.",
        upload,
      ),
    /request media types must match OpenAPI/,
  );
  assert.throws(
    () =>
      assertDocumentUploadGuidance(
        "wrong size fixture",
        documentRequirements.replace("25 MB", "30 MB"),
        upload,
      ),
    /size must match OpenAPI|differs from OpenAPI/,
  );
  assert.doesNotThrow(() =>
    assertDocumentUploadGuidance(
      "negated encoding fixture",
      documentRequirements +
        "\nDo not encode the file as JSON; send raw file bytes.",
      upload,
    ),
  );
});

test("preserves UBO thresholds, role distinctions, ownership chains, and dual evidence", (t) => {
  if (!requirePages(t)) return;
  const text = readPage(
    "knowledge-base/business-onboarding/shareholders-ubos-and-control-persons",
  );

  assert.match(
    text,
    /individual who directly or indirectly owns or controls 25% or more/i,
  );
  assert.match(text, /threshold is 25% in all supported countries/i);
  assertContainsExactLines("ownership roles", text, [
    "- A **direct owner** holds an interest in the business being onboarded.",
    "- A **UBO** is an individual reached through direct or indirect ownership or control at the policy threshold.",
    "- A **control person** directs or significantly influences the business, regardless of ownership percentage.",
    "- A **director** serves in a governance role.",
    "- An **authorized signer** has authority to act for the company.",
    "- Any individual who owns 25% or more",
    "- Control persons, regardless of ownership percentage",
    "- Directors with significant influence",
  ]);
  assert.match(text, /at least one control person/i);
  assert.match(text, /continue through every parent entity/i);
  assert.match(text, /account for 100% of ownership/i);
  assert.match(text, /resource facts and supporting document evidence may both be required/i);
  assertGeneratedLinks("ownership resources", text, [
    ["get", "/v3/customers/{customerId}/related-parties"],
    ["post", "/v3/customers/{customerId}/related-parties"],
    ["get", "/v3/customers/{customerId}/related-parties/{relatedPartyId}"],
    ["patch", "/v3/customers/{customerId}/related-parties/{relatedPartyId}"],
  ]);
});

test("uses the required current business sequence and preserves EDD, outcomes, timing, and rejection policy", (t) => {
  if (!requirePages(t)) return;
  const text = readPage("knowledge-base/business-onboarding/kyb-workflow");

  assertGeneratedLinks("business workflow", text, [
    ["post", "/v3/customers"],
    ["get", "/v3/customers/{customerId}"],
    ["get", "/v3/customers/{customerId}/related-parties"],
    ["post", "/v3/customers/{customerId}/related-parties"],
    ["patch", "/v3/customers/{customerId}/related-parties/{relatedPartyId}"],
    ["get", "/v3/customers/{customerId}/capabilities/supported"],
    ["post", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
    ["get", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
    [
      "get",
      "/v3/customers/{customerId}/capabilities/{capabilityId}/applications",
    ],
    ["get", "/v3/customers/{customerId}/tasks"],
    ["get", "/v3/customers/{customerId}/tasks/{taskId}"],
    ["post", "/v3/customers/{customerId}/documents"],
    ["post", "/v3/customers/{customerId}/tasks/{taskId}/submissions"],
  ]);
  assertContainsExactLines("KYB workflow", text, [
    "- High-risk jurisdictions",
    "- High-risk verticals, including gaming, trading, and crypto exchanges",
    "- Complex ownership structures",
    "- Expected monthly volume exceeding applicable thresholds",
    "- Operations involving sanctioned countries",
    "**Outcome:** KYB approval, conditional approval with caps, or rejection.",
    "| Document upload | Immediate |",
    "| Initial review | 1-2 business days |",
    "| Standard KYB | 2-5 business days |",
    "| EDD, if triggered | 5-10 business days |",
    "| Missing documents | Provide every document type requested by the current task |",
    "| Unclear or blurry documents | Provide higher-quality scans or images |",
    "| Mismatched information | Make sure the entity name matches across submitted evidence |",
    "| Incomplete ownership structure | Provide evidence that accounts for 100% of ownership |",
    "| Expired documents | Provide current, valid documents |",
  ]);
  assert.match(text, /typical policy estimates, not guaranteed API behavior/i);
  assert.match(text, /policy review outcomes, not current API status values/i);
  assertEnumValues("business workflow", text, "Capability", "status");
  assertEnumValues("business workflow", text, "Application", "status");
  assertEnumValues("business workflow", text, "Task", "status");
  assertEnumValues("business workflow", text, "SubmissionDetail", "outcome");
});

test("preserves business onboarding FAQ answers and support contacts with current mechanics", (t) => {
  if (!requirePages(t)) return;
  const text = readPage("knowledge-base/business-onboarding/faq");

  assert.match(text, /less than 25%[\s\S]{0,180}not a UBO/i);
  assert.match(text, /director role remains distinct/i);
  assert.match(text, /formal power of attorney may not be required/i);
  assert.match(text, /continue up the ownership chain/i);
  assert.match(text, /API\/resource facts and supporting evidence/i);
  assert.match(text, /Bank statements issued within the last 90 days/i);
  assert.match(text, /Office lease agreements that are current and valid/i);
  assert.match(text, /PO boxes, unsupported virtual-office-only evidence/i);
  assert.match(text, /compliance@swipelux\.com/);
  assertGeneratedLinks("business FAQ", text, [
    ["post", "/v3/customers/{customerId}/related-parties"],
    ["post", "/v3/customers/{customerId}/documents"],
  ]);
});

test("preserves individual KYC scope and all three policy levels", (t) => {
  if (!requirePages(t)) return;
  const text = readPage("knowledge-base/individual-onboarding/overview");

  assert.match(text, /complete KYC before they can transact/i);
  assert.match(
    text,
    /jurisdiction, transaction volume, risk assessment, and regulatory requirements/i,
  );
  assertContainsExactLines("individual overview", text, [
    "| Simplified | Name, surname, and date of birth | Approved low-value flows |",
    "| Standard | Government-issued ID and selfie/liveness check | Regular transactions within standard limits |",
    "| Enhanced | ID, selfie/liveness, proof of address, and proof of funds | High-value transactions or elevated-risk profiles |",
    "- Legal name and date of birth",
    "- Contact details",
    "- Residential address when required",
    "- Government-issued identity evidence and liveness evidence",
    "- Financial-profile information, including expected activity and source of funds, when required",
  ]);
  assert.match(text, /policy tiers, not current API status values/i);
  assert.ok(
    text.includes(
      "[individual onboarding guide](/integration/onboarding/customers#individual-customers)",
    ),
  );
});

test("preserves simplified, standard, and enhanced KYC requirements and triggers", (t) => {
  if (!requirePages(t)) return;
  const text = readPage(
    "knowledge-base/individual-onboarding/verification-levels",
  );

  assertContainsExactLines("verification levels", text, [
    "- First name",
    "- Last name",
    "- Date of birth",
    "- Transaction amounts are below applicable simplified thresholds",
    "- The customer is in a low-risk jurisdiction",
    "- Government-issued ID",
    "- Selfie or liveness check",
    "- Passport",
    "- Driver's license",
    "- National ID card",
    "- Everything required for Standard KYC",
    "- Proof of address",
    "- Proof of funds",
    "- Transaction volume exceeds standard thresholds",
    "- High-risk jurisdiction",
    "- Compliance-team flag based on risk assessment",
    "- Regulatory requirements",
    "| Bank statement | Issued within the last 90 days |",
    "| Utility bill | Electricity, gas, water, or internet; issued within the last 90 days |",
    "| Government-issued letter | Tax notice or official correspondence issued within the last 90 days |",
    "| Bank statements | Recent statements showing sufficient balance or income |",
    "| Pay stubs | Employment income verification |",
    "| Tax returns | Annual tax documentation |",
    "| Investment statements | Brokerage or retirement-account statements |",
  ]);
  assert.match(text, /compliance team may also contact the customer's registered email address/i);
  assert.match(text, /current task detail remains the source of truth/i);
});

test("preserves policy review concepts, rejection reasons, timelines, and separates API vocabularies", (t) => {
  if (!requirePages(t)) return;
  const text = readPage(
    "knowledge-base/individual-onboarding/status-and-workflow",
  );

  for (const state of [
    "not_started",
    "incomplete",
    "pending_verification",
    "under_review",
    "approved",
    "rejected",
  ]) {
    assert.ok(text.includes(tick + state + tick), "missing policy state " + state);
  }
  assert.match(
    text,
    /policy-facing review concepts describe the onboarding journey/i,
  );
  assert.match(text, /not current API enums, webhook values, or guaranteed transitions/i);
  assertContainsExactLines("individual status", text, [
    "| Document not readable | Provide a clear, high-resolution image |",
    "| Document expired | Provide a valid, non-expired identity document |",
    "| Face not matching | Make sure the selfie clearly matches the identity-document photo |",
    "| Incomplete information | Provide every item requested by the current task |",
    "| Suspicious activity | Contact support for manual review |",
    "| Document upload | Immediate |",
    "| Automated checks | 1-3 minutes |",
    "| Standard review | 1-24 hours |",
    "| Enhanced review | 1-3 business days |",
  ]);
  assert.match(text, /typical policy estimates, not guaranteed API behavior/i);
  assertEnumValues("individual status", text, "Capability", "status");
  assertEnumValues("individual status", text, "Application", "status");
  assertEnumValues("individual status", text, "Task", "status");
  assertEnumValues("individual status", text, "SubmissionDetail", "outcome");
  assert.match(text, /refetch the current customer, capability, application, and task resources/i);
  assert.ok(text.includes("[Webhooks](/integration/webhooks)"));
  assert.match(text, /compliance@swipelux\.com/);
  assert.match(text, /support@swipelux\.com/);
});

test("replaces the legacy individual API list with the exact current workflow map", (t) => {
  if (!requirePages(t)) return;
  const text = readPage("knowledge-base/individual-onboarding/api-workflow");

  assertGeneratedLinks("individual API workflow", text, [
    ["post", "/v3/customers"],
    ["get", "/v3/customers/{customerId}"],
    ["get", "/v3/customers/{customerId}/capabilities/supported"],
    ["post", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
    ["get", "/v3/customers/{customerId}/capabilities/{capabilityId}"],
    [
      "get",
      "/v3/customers/{customerId}/capabilities/{capabilityId}/applications",
    ],
    ["get", "/v3/customers/{customerId}/tasks"],
    ["get", "/v3/customers/{customerId}/tasks/{taskId}"],
    ["post", "/v3/customers/{customerId}/tasks/{taskId}/submissions"],
    [
      "get",
      "/v3/customers/{customerId}/tasks/{taskId}/submissions/{submissionId}",
    ],
    ["post", "/v3/customers/{customerId}/documents"],
  ]);
  assert.match(text, /first-party hosted session URLs/i);
  assert.match(text, /upload documents only when the current task asks/i);
  assert.match(text, /refetch[\s\S]{0,120}after each event or action/i);
  for (const link of [
    "[individual onboarding guide](/integration/onboarding/customers#individual-customers)",
    "[Capabilities and tasks](/integration/onboarding/capabilities-and-requirements#complete-current-tasks)",
    "[Integration Documents guide](/integration/onboarding/capabilities-and-requirements#upload-documents)",
  ]) {
    assert.ok(text.includes(link), "missing integration link " + link);
  }
});

test("keeps deprecated onboarding instructions out of all new pages", (t) => {
  if (!requirePages(t)) return;
  const text = PAGES.map((page) => readPage(page)).join("\n");

  for (const [pattern, label] of [
    [/(^|[^A-Za-z0-9])v[12](?=$|[^A-Za-z0-9])/i, "legacy API version"],
    [/customer\.verification_changed/i, "obsolete verification event"],
    [/base64/i, "obsolete encoded upload"],
    [/\b10\s*MB\b/i, "obsolete file-size limit"],
    [/platform\.swipelux\.com\/api-reference/i, "obsolete external API reference"],
    [/#tag\//i, "obsolete fragment API reference"],
    [/\x60(?:llc|s_corporation|c_corporation|e_commerce|business_revenue|vendor_payments|passport_front|id_card_front)\x60/i, "legacy enum code"],
    [/\b(?:entityTypeDescription|businessTypeDescription|requested_types|shareholderId|verificationStatus|verificationUrl)\b/, "legacy field name"],
  ]) {
    assert.doesNotMatch(text, pattern, label);
  }
});

test("keeps internal migration and review-state language out of public pages", (t) => {
  if (!requirePages(t)) return;
  const text = PAGES.map((page) => readPage(page)).join("\n");

  for (const [pattern, label] of [
    [/policy-owner review/i, "internal policy-owner review note"],
    [/review-required/i, "internal review-state value"],
    [/frozen policy source/i, "frozen-source migration note"],
    [/legacy policy catalog/i, "legacy migration note"],
    [/keep implementation mechanics/i, "internal implementation authoring note"],
    [
      /preserv(?:e|ed|ing)[^\n.]{0,60}\bpolicy\b/i,
      "policy migration wording",
    ],
  ]) {
    assert.doesNotMatch(text, pattern, label);
  }
});
