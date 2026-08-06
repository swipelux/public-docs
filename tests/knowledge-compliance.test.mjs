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
  "knowledge-base/compliance/overview",
  "knowledge-base/compliance/regulatory-perimeter",
  "knowledge-base/compliance/supported-business-models",
  "knowledge-base/compliance/jurisdictions-and-availability",
  "knowledge-base/compliance/transaction-limits",
  "knowledge-base/compliance/custody-and-wallet-controls",
  "knowledge-base/compliance/payment-methods",
  "knowledge-base/compliance/travel-rule",
  "knowledge-base/compliance/screening-and-monitoring",
  "knowledge-base/compliance/governance-retention-and-privacy",
];

const SOURCE_MAPPINGS = [
  [
    "content/compliance/index.mdx",
    "/knowledge-base/compliance/overview",
  ],
  [
    "content/compliance/general-information.mdx",
    "/knowledge-base/compliance/regulatory-perimeter",
  ],
  [
    "content/compliance/supported-verticals.mdx",
    "/knowledge-base/compliance/supported-business-models",
  ],
  [
    "content/compliance/jurisdiction-framework.mdx",
    "/knowledge-base/compliance/jurisdictions-and-availability",
  ],
  [
    "content/compliance/limits.mdx",
    "/knowledge-base/compliance/transaction-limits",
  ],
  [
    "content/compliance/wallet-architecture.mdx",
    "/knowledge-base/compliance/custody-and-wallet-controls",
  ],
  [
    "content/compliance/payment-methods.mdx",
    "/knowledge-base/compliance/payment-methods",
  ],
  [
    "content/compliance/travel-rule.mdx",
    "/knowledge-base/compliance/travel-rule",
  ],
  [
    "content/compliance/screening-monitoring.mdx",
    "/knowledge-base/compliance/screening-and-monitoring",
  ],
  [
    "content/compliance/governance.mdx",
    "/knowledge-base/compliance/governance-retention-and-privacy",
  ],
];

const EXPECTED_HEADINGS = new Map([
  [
    "knowledge-base/compliance/overview",
    [
      [2, "Compliance Reference"],
      [2, "Topics"],
      [3, "General Information"],
      [3, "Supported Verticals"],
      [3, "Jurisdiction Framework"],
      [3, "End-User Identity Verification (KYC)"],
      [3, "Wallet Architecture and Payouts"],
      [3, "Payment Methods"],
      [3, "Merchant Onboarding (KYB)"],
      [3, "Travel Rule Compliance"],
      [3, "Screening and Monitoring"],
      [3, "Governance and Roles"],
      [2, "Quick Reference"],
    ],
  ],
  [
    "knowledge-base/compliance/regulatory-perimeter",
    [
      [2, "General Information"],
      [3, "Regulatory Perimeter"],
      [3, "Compliance Responsibilities"],
    ],
  ],
  [
    "knowledge-base/compliance/supported-business-models",
    [
      [2, "Supported Verticals"],
      [3, "OK/Allowed"],
      [3, "Conditional (Enhanced Due Diligence)"],
      [3, "Prohibited (Rejected)"],
    ],
  ],
  [
    "knowledge-base/compliance/jurisdictions-and-availability",
    [
      [2, "Jurisdiction Framework"],
      [3, "End-User Eligibility Overview"],
      [4, "A. Fully Supported (EEA + CH)"],
      [4, "B. Global Coverage - Accepted With Enhanced Due Diligence"],
      [4, "C. No-Go Jurisdictions (Prohibited)"],
      [3, "Important"],
      [3, "Simple Clarification Matrix"],
      [3, "Sub-merchant Jurisdictional Matrix"],
      [4, "1. EEA+UK+CH"],
      [4, "2. APAC"],
      [4, "3. LATAM"],
      [4, "4. EMEA"],
      [4, "5. Sanctioned / Not Supported"],
      [3, "Disclaimer"],
    ],
  ],
  [
    "knowledge-base/compliance/transaction-limits",
    [
      [2, "Transaction Limits"],
      [3, "Individual Customers"],
      [3, "Business Customers"],
      [3, "Notes"],
    ],
  ],
  [
    "knowledge-base/compliance/custody-and-wallet-controls",
    [
      [2, "Wallet Architecture and Payouts"],
      [3, "Custodial MPC Wallets"],
      [3, "Non-Custodial Payouts (Self-Custody)"],
    ],
  ],
  [
    "knowledge-base/compliance/payment-methods",
    [
      [2, "Payment Methods"],
      [3, "Supported Pay-in Methods"],
      [3, "Supported Payout Methods"],
    ],
  ],
  [
    "knowledge-base/compliance/travel-rule",
    [[2, "Travel Rule Compliance"]],
  ],
  [
    "knowledge-base/compliance/screening-and-monitoring",
    [[2, "Screening and Monitoring"]],
  ],
  [
    "knowledge-base/compliance/governance-retention-and-privacy",
    [
      [2, "Governance and Roles"],
      [3, "Liability Matrix"],
      [3, "Responsibility Matrix"],
      [2, "Auditability & Retention"],
    ],
  ],
]);

const RISK_TIER_ITEMS = Object.freeze({
  "OK/Allowed": [
    "- **E-commerce & SaaS:** Payments for goods/services",
    "- **Web3 Infrastructure:** Non-custodial UI",
    "- **Other instruments that leverage blockchain technology on the UX/UI level**",
  ],
  "Conditional (Enhanced Due Diligence)": [
    "- **Licensed Gambling:** Must hold valid license (e.g. local authorizations on the target markets)",
    "- **Trading/CFD:** Must hold a financial investment license",
    "- **Wallet Orchestrators:** Must prove non-custodial, UX/UI-only status",
  ],
  "Prohibited (Rejected)": [
    "- **Unlicensed Gambling:** Any wagering without license",
    "- **Adult Content:** Pornography or sexually explicit services",
    "- **Privacy Coins/Mixers:** Monero, Tornado Cash, or obfuscation tools",
    "- **Shell Entities:** Entities with no physical presence",
    "- **Sanctioned jurisdictions:** Material exposure to sanctioned countries, regions and individuals",
  ],
});

const JURISDICTION_TABLES = [
  [
    ["Merchant Incorporation", "End-User Location", "Status", "Notes"],
    ["USA", "USA", "Not Allowed", "We do not hold US Money Transmitter Licenses"],
    ["USA", "Global* / EU / UK", "Allowed", "Sub-merchants must strictly geoblock US IP addresses"],
    ["EU / EEA", "USA", "Not Allowed", "Swipelux cannot service US residents or citizens"],
    ["EU / EEA", "Global* / EU / UK", "Allowed", "Standard flow"],
    ["UK / Canada", "Global* / EU / UK", "Allowed", "Standard flow"],
    ["APAC / LATAM", "Global* / EU / UK", "Allowed", "Standard flow (e.g. India, Brazil)"],
    ["Any Jurisdiction", "Prohibited List", "Not Allowed", "Sanctions screening applies to all users"],
  ],
  [
    ["End-User Region", "Open Banking", "Cards", "Crypto Rails", "Local Licensing Required?", "Final Status"],
    ["EEA", "Yes", "Yes", "Yes", "No", "Fully Supported"],
    ["UK", "Yes", "Yes", "Yes", "No", "Fully Supported"],
    ["Switzerland", "N/A", "Yes", "Yes", "No", "Fully Supported"],
  ],
  [
    ["Country (APAC End-User)", "Open Banking", "Cards", "Crypto Rails", "Local Licensing Impact", "Final Support"],
    ["Taiwan", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Bhutan", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Maldives", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["India", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Sri Lanka", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Brunei", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Cambodia", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Indonesia", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Malaysia", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Philippines", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Thailand", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Singapore", "N/A", "Yes", "Yes", "No", "Fully Supported"],
    ["Vietnam", "N/A", "Yes", "Yes", "No", "Allowed"],
  ],
  [
    ["Country (LATAM End-User)", "Open Banking", "Cards", "Crypto Rails", "Licensing Required?", "Final Support"],
    ["Argentina", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Bolivia", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Brazil", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Chile", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Colombia", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Costa Rica", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Dominican Republic", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["El Salvador", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Guatemala", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Honduras", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Belize", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Mexico", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Panama*", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Paraguay", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Peru", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Uruguay", "N/A", "Yes", "Yes", "No", "Allowed"],
  ],
  [
    ["Country / Sub-Region", "Open Banking", "Cards", "Crypto Rails", "Local Licensing Required?", "Final Status"],
    ["Albania", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Andorra", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Israel", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Gibraltar", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Georgia", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["UAE", "N/A", "Yes", "Yes", "No (VARA not triggered by orchestration)", "Allowed"],
    ["Saudi Arabia", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Qatar", "N/A", "No", "No (crypto banned)", "N/A", "Not Allowed"],
    ["Jordan", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Kenya", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["South Africa", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Nigeria", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Morocco", "N/A", "Yes", "Yes", "No", "Allowed"],
    ["Algeria", "N/A", "Yes", "No (crypto restricted)", "Yes", "Allowed - No Crypto"],
    ["Turkey", "N/A", "Yes", "Yes", "No", "Allowed"],
  ],
  [
    ["Country", "OB", "Cards", "Crypto", "Final"],
    ["Russia", "No", "No", "No", "Not Supported"],
    ["Belarus", "No", "No", "No", "Not Supported"],
    ["Iran", "No", "No", "No", "Not Supported"],
    ["Syria", "No", "No", "No", "Not Supported"],
    ["North Korea", "No", "No", "No", "Not Supported"],
    ["Cuba", "No", "No", "No", "Not Supported"],
    ["Venezuela", "No", "No", "No", "Not Supported"],
    ["Yemen, Sudan, South Sudan", "No", "No", "No", "Not Supported"],
    ["Haiti, Nicaragua", "No", "No", "No", "Not Supported"],
  ],
];

const LIMIT_TABLES = [
  [
    ["Limit Type", "KYC Standard", "KYC Enhanced"],
    ["Per Transaction", "$10,000", "$50,000"],
    ["Daily", "$50,000", "$100,000"],
    ["Monthly", "$100,000", "$250,000"],
  ],
  [
    ["Limit Type", "Amount"],
    ["Per Transaction", "$30,000"],
    ["Daily", "$100,000"],
    ["Monthly", "$500,000"],
  ],
];

const LIABILITY_TABLE = [
  [
    ["Responsibility", "Swipelux (VASP)", "Sub-Merchant"],
    ["Crypto Custody", "Responsible", "Not permitted"],
    ["Blockchain Execution", "Responsible", "Not permitted"],
    ["User Verification (KYC)", "Responsible (Direct or Reliance)", "Responsible for UX Handoff"],
    ["Sanctions Screening", "Responsible (All Users)", "Responsible for own staff"],
    ["Geoblocking", "Enforces via IP/KYC", "Must implement at UI level"],
    ["Licensing", "VASP License only", "Sector License (e.g., Gaming)"],
  ],
];

const JURISDICTION_EXACT_LINES = [
  "End-users may onboard with a passport, national ID, or EU residence permit.",
  "Driver's licences and paper IDs may be accepted with increased manual review.",
  "EEA Countries (EU + EFTA): Austria, Belgium, Bulgaria, Croatia, Cyprus, Czech Republic, Denmark, Estonia, Finland, France, Germany, Greece, Hungary, Ireland, Italy, Latvia, Lithuania, Luxembourg, Malta, Netherlands, Poland, Portugal, Romania, Slovakia, Slovenia, Spain, Sweden, Iceland, Liechtenstein, Norway.",
  "**Additionally accepted:** Switzerland (adequate AML/CTF regulatory environment).",
  "End-users from these jurisdictions may be accepted with additional KYC steps, stricter document rules, and potential video verification based on transaction thresholds.",
  "**Accepted:** Taiwan, India, Sri Lanka, Bhutan, Maldives, Indonesia, Malaysia, Brunei, Cambodia, Philippines*, Singapore, Thailand, Vietnam*, etc.",
  "**Accepted:** Argentina, Bolivia, Brazil, Chile, Colombia, Costa Rica, Dominican Republic, El Salvador, Guatemala, Honduras, Belize, Mexico, Panama*, Paraguay, Peru, Uruguay.",
  "**Accepted:** Albania*, Algeria, Andorra, Angola, Bahrain, Israel, Gibraltar*, Georgia, Kenya, Kuwait, Oman, Qatar*, Saudi Arabia, South Africa*, Turkiye*, UAE*, etc.",
  "- Passport OR National ID (paper IDs require passport)",
  "- Proof of Address: utility bill, bank statement, internet bill",
  "- Proof of Address required",
  "- High-risk jurisdictions flagged with (*) require EDD at onboarding",
  "Swipelux does not onboard end-users from jurisdictions classified as:",
  "- FATF Blacklist",
  "- EU AMLD Article 9(2) high-risk third countries with inadequate AML/CTF measures",
  "- OFAC-sanctioned countries",
  "- Internal high-risk jurisdictions (Ecuador, Haiti, Nicaragua, certain overseas territories)",
  "**List Includes:** Afghanistan, DPRK, Iran, Syria, Yemen, Uganda, Vanuatu, Guyana, Russia, Belarus, Cuba, Venezuela, Nicaragua, Somalia, Sudan, Zimbabwe, Burma, CAR, DRC, Ethiopia, Libya, Mali, Lebanon, etc.",
  "**Reason:** Regulatory restrictions under EU AMLD, OFAC sanctions, and Swipelux risk appetite.",
  "- Jurisdiction rules apply to end-users, not only to merchant incorporation",
  "- Local verification rules, such as proof of address, video interview, and document type, depend on the user's country of nationality and residence",
  "- Swipelux screens all users using sanctions, PEP lists, and risk-based AML controls",
  "- Users from prohibited jurisdictions cannot access Swipelux services, even via VPN or offshore entities",
  "1. Local regulations governing crypto transactions and fiat pay-in or payout activity",
  "2. Card scheme and acquiring-bank restrictions",
  "3. Sanctions and AML/CTF obligations",
  "4. Swipelux's internal risk appetite",
  "Crypto Rails refer to pay-in and payout activity performed by Swipelux as a regulated VASP, including custody, conversion, and blockchain transfers initiated or executed by Swipelux.",
  "  - Geo-blocking of certain end-users",
  "  - Rail-specific restrictions (e.g., cards disabled, crypto disabled)",
  "  - Enhanced due diligence",
  "  - Legal opinions or regulatory confirmations",
];

const MONITORING_ITEMS = [
  "- **Sanctions/PEP:** Daily and event-triggered screening, including signup and profile changes",
  "- **Blockchain Analytics:** Deposit and withdrawal screening for exposure to mixers, darknet markets, and sanctioned entities",
  "- **Transaction Monitoring:** Real-time detection of structuring, velocity anomalies, and fraud patterns",
  "- **Case Escalation:** High-risk alerts undergo manual review and may result in SAR/ISR filings",
];

const MONITORING_SCOPE_LINE =
  "Swipelux performs continuous AML/CTF monitoring across customers, wallets, and transactions:";

const JURISDICTION_REVIEW_NOTE =
  "Source conflicts require policy-owner resolution: Qatar appears accepted-with-EDD and Not Allowed; country-star EDD markings are inconsistent across narrative and matrices; Global* is undefined.";

const RELATED_API_WORKFLOW_LINES = new Map([
  [
    "knowledge-base/compliance/travel-rule",
    "Related API workflows: [recipients](/integration/recipients) and [send funds](/integration/send-funds).",
  ],
  [
    "knowledge-base/compliance/screening-and-monitoring",
    "Related API workflows: [individual onboarding](/integration/onboarding/customers#individual-customers) and [business onboarding](/integration/onboarding/customers#business-customers).",
  ],
  [
    "knowledge-base/compliance/governance-retention-and-privacy",
    "Related API workflows: [individual onboarding](/integration/onboarding/customers#individual-customers) and [business onboarding](/integration/onboarding/customers#business-customers).",
  ],
]);

const config = JSON.parse(readFileSync("docs.json", "utf8"));
const openapi = JSON.parse(readFileSync("openapi.json", "utf8"));
const navigationPages = collectNavigationPages(config.navigation);

function pageFile(page) {
  return `${page}.mdx`;
}

function allPagesExist() {
  return PAGES.every((page) => existsSync(pageFile(page)));
}

function requirePages(t) {
  if (allPagesExist()) return true;
  t.skip("content assertions wait for the ten page-existence RED checks");
  return false;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
  assert.notEqual(index, -1, `Missing section: ${heading}`);

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

function markdownTables(text) {
  const { body } = parseFrontmatter(text);
  const lines = body.replaceAll("\r\n", "\n").split("\n");
  const tables = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim().startsWith("|")) continue;
    const block = [];
    while (index < lines.length && lines[index].trim().startsWith("|")) {
      block.push(lines[index].trim());
      index += 1;
    }
    index -= 1;

    const rows = block.map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
    assert.ok(
      rows.length >= 2 && rows[1].every((cell) => /^:?-{3,}:?$/.test(cell)),
      `Malformed Markdown table: ${block[0]}`,
    );
    tables.push([rows[0], ...rows.slice(2)]);
  }

  return tables;
}

function assertContainsExactLines(label, text, expectedLines) {
  const lines = new Set(text.replaceAll("\r\n", "\n").split("\n"));
  for (const line of expectedLines) {
    assert.ok(lines.has(line), `${label} is missing exact source line: ${line}`);
  }
}

function assertRiskTiers(label, text) {
  for (const [heading, expectedItems] of Object.entries(RISK_TIER_ITEMS)) {
    const section = sectionBody(text, heading);
    const actualItems = section
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "));
    assert.deepEqual(
      actualItems,
      expectedItems,
      `${label} must preserve the exact ${heading} category values`,
    );
  }
}

function assertJurisdictionDisclaimer(label, text) {
  const disclaimer = sectionBody(text, "Disclaimer");
  assert.match(disclaimer, /high-level overview[\s\S]{0,120}not exhaustive/i, label);
  assert.match(
    disclaimer,
    /ability to provide services[\s\S]{0,120}depends on/i,
    label,
  );
  assert.match(
    disclaimer,
    /countries and rules[\s\S]{0,100}may change at any time/i,
    label,
  );
  assert.match(
    disclaimer,
    /may accept or decline any merchant or end-user[\s\S]{0,180}regulatory, technical, or risk-based considerations/i,
    label,
  );
  assert.match(disclaimer, /Final onboarding decisions[\s\S]{0,120}sole discretion/i, label);
  assert.doesNotMatch(disclaimer, /guaranteed|exhaustive coverage|will accept/i, label);
}

function assertLimits(label, text) {
  assert.deepEqual(markdownTables(text), LIMIT_TABLES, label);
  assert.match(text, /limits based on customer type, verification level, and risk review/i, label);
  assert.match(text, /Limits can vary as risk information changes/i, label);
  assertContainsExactLines(label, text, [
    "Limits may be adjusted based on risk scoring in accordance with our AML policy. Factors that may affect limits include:",
    "For questions about specific limits or limit adjustments, contact the compliance team.",
  ]);
  for (const factor of [
    "- Transaction history and patterns",
    "- Geographic considerations",
    "- Business type and industry",
    "- Overall risk assessment",
  ]) {
    assert.ok(text.includes(factor), `${label} is missing ${factor}`);
  }
}

function assertCustodyPolicy(label, text) {
  assert.match(text, /segregated MPC wallet address managed by Swipelux/i, label);
  assert.match(text, /holds stablecoins after conversion or before payout/i, label);
  assert.match(text, /does not pay yield on stablecoin balances held in custody/i, label);
  assert.match(text, /withdraw stablecoins to verified personal wallets/i, label);
  assert.match(text, /enforces ownership proof when accepting terms and conditions/i, label);
  assert.match(
    text,
    /does not support payouts to unhosted wallets that fail blockchain risk screening/i,
    label,
  );
  assert.doesNotMatch(
    text,
    /Swipelux pays? yield|guaranteed yield|unscreened wallets are allowed/i,
    label,
  );
}

function assertDirectUserPayoutScope(label, text) {
  assert.match(
    text,
    /Payouts can only be sent to a bank account in the exact legal name of the verified KYC user/i,
    label,
  );
  assert.match(text, /Third-party payouts are not supported in this flow/i, label);
  assert.match(
    text,
    /exact-name restriction[\s\S]{0,100}direct-user bank payout flow/i,
    label,
  );
  assert.match(
    text,
    /does not (?:replace|remove|eliminate)[\s\S]{0,120}separate v3 recipient-destination flow[\s\S]{0,160}\[Recipients\]\(\/integration\/recipients\)/i,
    label,
  );
  assert.doesNotMatch(
    text,
    /all (?:fiat |bank )?payouts[\s\S]{0,120}exact legal name|recipient destinations? must use the customer's exact legal name/i,
    label,
  );
}

function assertTravelRulePolicy(label, text) {
  assert.match(
    text,
    /applies FATF Recommendation 16 controls when transfers exceed the applicable local threshold/i,
    label,
  );
  assert.match(
    text,
    /VASP-to-VASP:[\s\S]{0,100}identifies the counterparty VASP[\s\S]{0,140}transmits Originator\/Beneficiary data[\s\S]{0,100}TRISA\/Notabene/i,
    label,
  );
  for (const branch of [
    "- (a) Swipelux collects required Originator/Beneficiary information",
    "- (b) No data is transmitted since no receiving VASP exists",
    "- (c) Transfers may be blocked if blockchain analytics indicate high-risk exposure",
  ]) {
    assert.ok(text.includes(branch), `${label} is missing Travel Rule branch ${branch}`);
  }
  assert.doesNotMatch(text, /unhosted wallets[\s\S]{0,120}always transmit data/i, label);
}

function assertMonitoringPolicy(label, text) {
  assertContainsExactLines(label, text, [MONITORING_SCOPE_LINE, ...MONITORING_ITEMS]);
}

function payoutDestinationContract(spec) {
  const quoteOperation = spec.paths?.["/v3/quotes"]?.post;
  const quoteSchema =
    quoteOperation?.requestBody?.content?.["application/json"]?.schema;
  const destinationId = quoteSchema?.properties?.destinationId;
  const prefixKinds = new Map(
    [...(destinationId?.description ?? "").matchAll(
      /`([a-z]+_)` identifies (?:an? )?([^.;]+?)(?= and `|[.;])/g,
    )].map((match) => [match[1], match[2].trim()]),
  );
  const collectionPath =
    spec.paths?.[
      "/v3/customers/{customerId}/recipients/{recipientId}/destinations"
    ];
  const detailPath =
    spec.paths?.[
      "/v3/customers/{customerId}/recipients/{recipientId}/destinations/{destinationId}"
    ];

  return {
    collectionPath,
    destinationId,
    detailPath,
    prefixKinds,
    quoteOperation,
    quoteSchema,
  };
}

function assertGovernancePolicy(label, text) {
  assert.deepEqual(markdownTables(text), LIABILITY_TABLE, label);
  assertContainsExactLines(label, text, [
    "- **Swipelux:** custody, blockchain execution, KYC/KYB, monitoring, Travel Rule, sanctions",
    "- **Sub-merchant:** user journey design, geoblocking, vertical licensing, marketing compliance, prevention of unsolicited US targeting",
  ]);
  assert.match(
    text,
    /Sub-merchants never hold, control, or access user assets or private keys/i,
    label,
  );
  assert.match(text, /retains user identity and transactional data for 5 years/i, label);
  assert.match(
    text,
    /Data subject deletion requests do not apply to AML-mandated records/i,
    label,
  );
  assert.match(text, /stores all data within compliant EU infrastructure aligned with GDPR/i, label);
}

for (const page of PAGES) {
  test(`publishes ${page} once with valid guarded frontmatter`, () => {
    assertPages([page]);
    assert.equal(
      navigationPages.filter((candidate) => candidate === page).length,
      1,
      `${page} must appear in navigation exactly once`,
    );
  });
}

test("preserves the exact source heading hierarchy for every mapped page", (t) => {
  if (!requirePages(t)) return;
  for (const page of PAGES) {
    assert.deepEqual(
      headingHierarchy(readPage(page)),
      EXPECTED_HEADINGS.get(page),
      `${pageFile(page)} must preserve its source heading hierarchy`,
    );
  }
});

test("keeps every compliance ledger row pinned to the approved source and release gate", () => {
  const ledger = parseMigrationLedger(
    readFileSync("docs/content-migration-ledger.md", "utf8"),
  );

  for (const [sourcePath, destination] of SOURCE_MAPPINGS) {
    const matches = ledger.filter((row) => row.sourcePath === sourcePath);
    assert.equal(matches.length, 1, `${sourcePath} must appear exactly once`);
    assert.deepEqual(
      {
        sourceCommit: matches[0].sourceCommit,
        destination: matches[0].destination,
        disposition: matches[0].disposition,
        reviewState: matches[0].reviewState,
      },
      {
        sourceCommit: SOURCE_COMMIT,
        destination,
        disposition: "preserved-policy",
        reviewState: "review-required",
      },
      `${sourcePath} must retain the approved compliance migration state`,
    );
  }
});

test("tracks the jurisdiction source conflicts for policy-owner resolution only in the ledger", (t) => {
  const ledger = parseMigrationLedger(
    readFileSync("docs/content-migration-ledger.md", "utf8"),
  );
  const row = ledger.find(
    ({ sourcePath }) =>
      sourcePath === "content/compliance/jurisdiction-framework.mdx",
  );

  assert.ok(row, "jurisdiction-framework ledger row must exist");
  assert.equal(row.notes, JURISDICTION_REVIEW_NOTE);

  if (!requirePages(t)) return;
  for (const page of PAGES) {
    assert.doesNotMatch(
      readPage(page),
      /Qatar appears accepted-with-EDD and Not Allowed|country-star EDD markings are inconsistent across narrative and matrices|Global\* is undefined/i,
      `${pageFile(page)} must not expose internal policy-owner review targets`,
    );
  }
});

test("overview separates onboarding policy topics from implementation workflows", (t) => {
  if (!requirePages(t)) return;
  const text = readPage("knowledge-base/compliance/overview");
  const links = [
    ["General Information", "/knowledge-base/compliance/regulatory-perimeter"],
    ["Supported Verticals", "/knowledge-base/compliance/supported-business-models"],
    ["Jurisdiction Framework", "/knowledge-base/compliance/jurisdictions-and-availability"],
    ["Transaction Limits", "/knowledge-base/compliance/transaction-limits"],
    ["KYC Verification", "/knowledge-base/individual-onboarding/overview"],
    [
      "Individual onboarding API workflow",
      "/integration/onboarding/customers#individual-customers",
    ],
    ["Wallet Architecture", "/knowledge-base/compliance/custody-and-wallet-controls"],
    ["Payment Methods", "/knowledge-base/compliance/payment-methods"],
    ["Merchant Onboarding", "/knowledge-base/business-onboarding/overview"],
    [
      "Business onboarding API workflow",
      "/integration/onboarding/customers#business-customers",
    ],
    ["Travel Rule", "/knowledge-base/compliance/travel-rule"],
    ["Screening and Monitoring", "/knowledge-base/compliance/screening-and-monitoring"],
    ["Governance", "/knowledge-base/compliance/governance-retention-and-privacy"],
  ];

  for (const [label, href] of links) {
    assert.match(
      text,
      new RegExp(`\\[${escapeRegExp(label)}(?: ->)?\\]\\(${escapeRegExp(href)}\\)`),
      `overview must link ${label} to ${href}`,
    );
  }

  for (const topic of [
    {
      heading: "End-User Identity Verification (KYC)",
      implementationHref:
        "/integration/onboarding/customers#individual-customers",
      implementationLabel: "Individual onboarding API workflow",
      policyHref: "/knowledge-base/individual-onboarding/overview",
      policyLabel: "KYC Verification",
    },
    {
      heading: "Merchant Onboarding (KYB)",
      implementationHref:
        "/integration/onboarding/customers#business-customers",
      implementationLabel: "Business onboarding API workflow",
      policyHref: "/knowledge-base/business-onboarding/overview",
      policyLabel: "Merchant Onboarding",
    },
  ]) {
    const section = sectionBody(text, topic.heading);
    assert.match(
      section,
      new RegExp(
        `\\*\\*\\[${escapeRegExp(topic.policyLabel)} ->\\]\\(${escapeRegExp(topic.policyHref)}\\)\\*\\*`,
      ),
      `${topic.heading} must make the policy page the primary link`,
    );
    assert.match(
      section,
      new RegExp(
        `\\*\\*Implementation:\\*\\* \\[${escapeRegExp(topic.implementationLabel)}\\]\\(${escapeRegExp(topic.implementationHref)}\\)`,
      ),
      `${topic.heading} must label its API workflow separately`,
    );
    assert.doesNotMatch(
      section,
      new RegExp(
        `\\*\\*\\[${escapeRegExp(topic.policyLabel)} ->\\]\\(${escapeRegExp(topic.implementationHref)}\\)\\*\\*`,
      ),
      `${topic.heading} must not conflate policy and implementation links`,
    );
  }

  assertContainsExactLines("overview", text, [
    "- KYC, sanctions, PEP screening",
    "- Wallet screening, blockchain execution",
    "- Crypto custody and exchange",
    "- Travel Rule compliance",
    "- Marketing compliance",
    "- UX geoblocking",
    "- Sector-specific licensing",
    "- User journey design",
  ]);
});

test("preserves the regulatory perimeter and source responsibility split", (t) => {
  if (!requirePages(t)) return;
  const text = readPage("knowledge-base/compliance/regulatory-perimeter");
  assert.match(text, /Swipelux OU is an EU-licensed Virtual Asset Service Provider \(VASP\)/i);
  assert.match(
    text,
    /regulated crypto activity[\s\S]{0,160}wallet creation[\s\S]{0,80}crypto custody[\s\S]{0,80}exchange[\s\S]{0,80}blockchain execution/i,
  );
  assertContainsExactLines("regulatory perimeter", text, [
    "- control UX/UI and user acquisition",
    "- connect users to Swipelux payment infrastructure",
    "- never hold, control, or access private keys",
    "- never custody funds or execute blockchain transactions",
    "- **Swipelux:** KYC, sanctions, PEP screening, wallet screening, blockchain execution",
    "- **Sub-merchant:** marketing compliance, UX geoblocking, sector-specific licensing",
  ]);
  assert.match(
    text,
    /not required to obtain VASP\/CASP licenses[\s\S]{0,160}unless their own local sector licensing requires it[\s\S]{0,100}gambling or CFD licensing/i,
  );
});

test("preserves all allowed, conditional, and prohibited risk-tier values", (t) => {
  if (!requirePages(t)) return;
  assertRiskTiers(
    "supported business models",
    readPage("knowledge-base/compliance/supported-business-models"),
  );
});

test("preserves jurisdiction categories, exact matrices, conditions, and disclaimers", (t) => {
  if (!requirePages(t)) return;
  const text = readPage("knowledge-base/compliance/jurisdictions-and-availability");
  assert.deepEqual(markdownTables(text), JURISDICTION_TABLES);
  assertContainsExactLines("jurisdiction framework", text, JURISDICTION_EXACT_LINES);
  assertJurisdictionDisclaimer("jurisdiction disclaimer", text);
});

test("preserves every individual and business transaction-limit figure", (t) => {
  if (!requirePages(t)) return;
  assertLimits(
    "transaction limits",
    readPage("knowledge-base/compliance/transaction-limits"),
  );
});

test("preserves segregated custody, no-yield, and self-custody controls", (t) => {
  if (!requirePages(t)) return;
  assertCustodyPolicy(
    "custody and wallet controls",
    readPage("knowledge-base/compliance/custody-and-wallet-controls"),
  );
});

test("preserves payment rails while scoping exact-name restrictions to direct-user payouts", (t) => {
  if (!requirePages(t)) return;
  const text = readPage("knowledge-base/compliance/payment-methods");
  assertContainsExactLines("payment methods", text, [
    "1. **Fiat deposits (User -> Swipelux)**",
    "   - Open Banking: Instant SEPA / Faster Payments",
    "   - Card Acquiring: Visa/Mastercard (subject to MCC restrictions)",
    "2. **Crypto deposits (User -> Swipelux)**",
    "   - Users may deposit supported assets such as USDC directly into their segregated MPC wallet. Wallets are screened by a third-party service provider.",
    "3. **Third-Party Aggregators**",
    "   - Swipelux supports orchestrated settlement from licensed third-party partners. Swipelux acts as the wallet provider and final settlement agent in these flows.",
    "- **Flow:** Stablecoin -> Swipelux Liquidity -> Fiat Conversion -> User Bank Account",
    "- **Rule:** Payouts can only be sent to a bank account in the exact legal name of the verified KYC user. Third-party payouts are not supported in this flow.",
  ]);
  assertDirectUserPayoutScope("payment methods", text);
});

test("grounds the payout qualifier in the committed v3 destination contract", (t) => {
  if (!requirePages(t)) return;
  const contract = payoutDestinationContract(openapi);

  assert.ok(contract.quoteOperation, "OpenAPI must define POST /v3/quotes");
  assert.ok(
    contract.quoteSchema?.required?.includes("destinationId"),
    "POST /v3/quotes must require destinationId",
  );
  assert.match(
    contract.destinationId?.pattern ?? "",
    /acc\|dst/,
    "quote destinationId must accept both account and recipient-destination IDs",
  );
  assert.equal(contract.prefixKinds.get("acc_"), "account");
  assert.equal(contract.prefixKinds.get("dst_"), "recipient destination");

  const quoteExamples = Object.values(
    contract.quoteOperation.requestBody.content["application/json"].examples,
  ).map(({ value }) => value?.destinationId);
  assert.ok(
    quoteExamples.some((destinationId) => destinationId?.startsWith("acc_")),
    "quote examples must include an account destination",
  );
  assert.ok(
    quoteExamples.some((destinationId) => destinationId?.startsWith("dst_")),
    "quote examples must include a recipient destination",
  );

  assert.match(
    contract.collectionPath?.post?.description ?? "",
    /bank or wallet payout destination to a recipient/i,
    "recipient destination creation must model a separate payout destination",
  );
  assert.match(
    contract.collectionPath?.post?.description ?? "",
    /Use Accounts for customer-owned destinations/i,
    "recipient destination creation must distinguish customer-owned accounts",
  );
  assert.match(
    contract.collectionPath?.get?.description ?? "",
    /recipient-owned bank and wallet payout destinations/i,
    "recipient destination listing must preserve recipient ownership",
  );
  assert.match(
    contract.detailPath?.get?.description ?? "",
    /recipient bank or wallet payout destination/i,
    "recipient destination detail must preserve the third-party destination model",
  );

  assertDirectUserPayoutScope(
    "contract-backed payment methods",
    readPage("knowledge-base/compliance/payment-methods"),
  );
});

test("preserves both Travel Rule branches and all unhosted-wallet controls", (t) => {
  if (!requirePages(t)) return;
  assertTravelRulePolicy(
    "Travel Rule",
    readPage("knowledge-base/compliance/travel-rule"),
  );
});

test("preserves every screening and monitoring category", (t) => {
  if (!requirePages(t)) return;
  assertMonitoringPolicy(
    "screening and monitoring",
    readPage("knowledge-base/compliance/screening-and-monitoring"),
  );
});

test("preserves the responsibility matrix, five-year retention, deletion, and privacy claims", (t) => {
  if (!requirePages(t)) return;
  assertGovernancePolicy(
    "governance, retention, and privacy",
    readPage("knowledge-base/compliance/governance-retention-and-privacy"),
  );
});

test("uses current Integration Docs links without turning policy pages into API reference", (t) => {
  if (!requirePages(t)) return;
  const expectedLinks = new Map([
    ["knowledge-base/compliance/overview", ["/knowledge-base/individual-onboarding/overview", "/integration/onboarding/customers#individual-customers", "/knowledge-base/business-onboarding/overview", "/integration/onboarding/customers#business-customers"]],
    ["knowledge-base/compliance/regulatory-perimeter", ["/integration/onboarding/customers#individual-customers", "/integration/onboarding/customers#business-customers", "/integration/accounts"]],
    ["knowledge-base/compliance/supported-business-models", ["/integration/onboarding/customers#business-customers"]],
    ["knowledge-base/compliance/jurisdictions-and-availability", ["/integration/onboarding/customers#individual-customers", "/integration/receive-funds", "/integration/send-funds"]],
    ["knowledge-base/compliance/transaction-limits", ["/integration/onboarding/customers#individual-customers", "/integration/onboarding/customers#business-customers"]],
    ["knowledge-base/compliance/custody-and-wallet-controls", ["/integration/accounts", "/integration/send-funds"]],
    ["knowledge-base/compliance/payment-methods", ["/integration/receive-funds", "/integration/send-funds", "/integration/recipients"]],
    ["knowledge-base/compliance/travel-rule", ["/integration/recipients", "/integration/send-funds"]],
    ["knowledge-base/compliance/screening-and-monitoring", ["/integration/onboarding/customers#individual-customers", "/integration/onboarding/customers#business-customers"]],
    ["knowledge-base/compliance/governance-retention-and-privacy", ["/integration/onboarding/customers#individual-customers", "/integration/onboarding/customers#business-customers"]],
  ]);

  for (const page of PAGES) {
    const text = readPage(page);
    for (const href of expectedLinks.get(page)) {
      assert.ok(text.includes(`](${href})`), `${pageFile(page)} must link ${href}`);
    }

    assert.doesNotMatch(text, /^\s*import\s/m, `${pageFile(page)} must remove Fumadocs imports`);
    assert.doesNotMatch(text, /fumadocs|<Callout\b|<Cards?\b/i, `${pageFile(page)} must remove Fumadocs mechanics`);
    assert.doesNotMatch(text, /\/api-reference\/|\/v3\/|\b(?:GET|POST|PUT|PATCH|DELETE)\s+\//i, `${pageFile(page)} must remain policy-level`);
    assert.doesNotMatch(text, /```|<ParamField\b|<ResponseField\b|<RequestExample\b|<ResponseExample\b/i, `${pageFile(page)} must not become API reference`);
    assert.doesNotMatch(text, /\]\(\/(?:compliance|individual-onboarding|business-onboarding)(?:\/|\))/i, `${pageFile(page)} must not use obsolete routes`);
    assert.doesNotMatch(text, /dashboard/i, `${pageFile(page)} must not claim unsupported dashboards`);
    assert.doesNotMatch(
      text,
      /review-required|\bTODO\b|\bTBD\b|\bdraft\b|unresolved review|internal review state|pending legal review/i,
      `${pageFile(page)} must not expose internal review state`,
    );

    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      const href = match[1];
      if (!href.startsWith("/")) continue;
      assert.doesNotMatch(href, /\.mdx?(?:$|[#?])/, `${pageFile(page)} link must omit extensions: ${href}`);
      assert.doesNotMatch(href, /\s/, `${pageFile(page)} link must be a valid root-relative path: ${href}`);
    }
  }

});

for (const [page, expectedLine] of RELATED_API_WORKFLOW_LINES) {
  test(`${page} narrowly labels related API workflows`, (t) => {
    if (!requirePages(t)) return;
    const text = readPage(page);
    assert.ok(
      text.includes(expectedLine),
      `${pageFile(page)} must narrowly label related API workflows`,
    );
    assert.doesNotMatch(
      text,
      /For implementation guidance/i,
      `${pageFile(page)} must not imply Integration Docs define the compliance control`,
    );
  });
}

test("polarity fixtures reject critical compliance-policy inversions", () => {
  const riskFixture = Object.entries(RISK_TIER_ITEMS)
    .map(([heading, items]) => `### ${heading}\n\n${items.join("\n")}`)
    .join("\n\n");
  assert.doesNotThrow(() => assertRiskTiers("risk fixture", riskFixture));
  assert.throws(
    () =>
      assertRiskTiers(
        "risk inversion",
        riskFixture.replace(
          RISK_TIER_ITEMS["OK/Allowed"][0],
          RISK_TIER_ITEMS["Prohibited (Rejected)"][0],
        ),
      ),
    /OK\/Allowed category values/,
  );

  const disclaimerFixture = `### Disclaimer

This jurisdiction matrix is a high-level overview and is not exhaustive.

Swipelux's ability to provide services in a specific jurisdiction depends on local conditions.

The countries and rules may change at any time.

Swipelux may accept or decline any merchant or end-user based on regulatory, technical, or risk-based considerations.

Final onboarding decisions are made at Swipelux's sole discretion.`;
  assert.doesNotThrow(() => assertJurisdictionDisclaimer("disclaimer fixture", disclaimerFixture));
  assert.throws(
    () =>
      assertJurisdictionDisclaimer(
        "exhaustive fixture",
        disclaimerFixture.replace("is not exhaustive", "guarantees exhaustive coverage"),
      ),
    /exhaustive fixture/,
  );

  const jurisdictionSubstantiveLines = [
    "End-users may onboard with a passport, national ID, or EU residence permit.",
    "Driver's licences and paper IDs may be accepted with increased manual review.",
    "End-users from these jurisdictions may be accepted with additional KYC steps, stricter document rules, and potential video verification based on transaction thresholds.",
    "Swipelux does not onboard end-users from jurisdictions classified as:",
    "Crypto Rails refer to pay-in and payout activity performed by Swipelux as a regulated VASP, including custody, conversion, and blockchain transfers initiated or executed by Swipelux.",
  ];
  const jurisdictionFixture = jurisdictionSubstantiveLines.join("\n");
  assertContainsExactLines(
    "jurisdiction substantive fixture",
    jurisdictionFixture,
    jurisdictionSubstantiveLines,
  );
  assert.throws(
    () =>
      assertContainsExactLines(
        "jurisdiction onboarding inversion",
        jurisdictionFixture.replace(
          "may be accepted with additional KYC steps",
          "are accepted without additional KYC steps",
        ),
        jurisdictionSubstantiveLines,
      ),
    /jurisdiction onboarding inversion/,
  );

  const limitsFixture = LIMIT_TABLES.map((table) => {
    const header = `| ${table[0].join(" | ")} |`;
    const separator = `| ${table[0].map(() => "---").join(" | ")} |`;
    const rows = table.slice(1).map((row) => `| ${row.join(" | ")} |`);
    return [header, separator, ...rows].join("\n");
  }).join("\n\n");
  const limitsPolicyFixture = `Swipelux applies limits based on customer type, verification level, and risk review. Limits can vary as risk information changes.

${limitsFixture}

Limits may be adjusted based on risk scoring in accordance with our AML policy. Factors that may affect limits include:

- Transaction history and patterns
- Geographic considerations
- Business type and industry
- Overall risk assessment

For questions about specific limits or limit adjustments, contact the compliance team.`;
  assert.doesNotThrow(() => assertLimits("limits fixture", limitsPolicyFixture));
  assert.throws(
    () => assertLimits("mutated limits", limitsPolicyFixture.replace("$10,000", "$100,000")),
    /mutated limits/,
  );
  assert.throws(
    () =>
      assertLimits(
        "AML qualifier inversion",
        limitsPolicyFixture.replace(
          "in accordance with our AML policy",
          "without regard to our AML policy",
        ),
      ),
    /AML qualifier inversion/,
  );
  assert.throws(
    () =>
      assertLimits(
        "compliance escalation omission",
        limitsPolicyFixture.replace(
          "contact the compliance team",
          "contact customer support",
        ),
      ),
    /compliance escalation omission/,
  );

  const custodyFixture = `Each user session is assigned a segregated MPC wallet address managed by Swipelux. It holds stablecoins after conversion or before payout. Swipelux does not pay yield on stablecoin balances held in custody. Users may withdraw stablecoins to verified personal wallets. Swipelux enforces ownership proof when accepting terms and conditions. Swipelux does not support payouts to unhosted wallets that fail blockchain risk screening.`;
  assert.doesNotThrow(() => assertCustodyPolicy("custody fixture", custodyFixture));
  assert.throws(
    () => assertCustodyPolicy("yield inversion", custodyFixture.replace("does not pay yield", "pays yield")),
    /yield inversion/,
  );
  assert.throws(
    () =>
      assertCustodyPolicy(
        "screening inversion",
        custodyFixture.replace(
          "does not support payouts to unhosted wallets that fail blockchain risk screening",
          "supports payouts to unscreened wallets",
        ),
      ),
    /screening inversion/,
  );

  const payoutFixture = `Payouts can only be sent to a bank account in the exact legal name of the verified KYC user. Third-party payouts are not supported in this flow.

The exact-name restriction applies to the direct-user bank payout flow. It does not replace the separate v3 recipient-destination flow described in [Recipients](/integration/recipients).`;
  assert.doesNotThrow(() => assertDirectUserPayoutScope("payout fixture", payoutFixture));
  assert.throws(
    () =>
      assertDirectUserPayoutScope(
        "recipient inversion",
        payoutFixture.replace(
          "It does not replace the separate v3 recipient-destination flow",
          "All payouts and recipient destinations must use the customer's exact legal name",
        ),
      ),
    /recipient inversion/,
  );

  const travelFixture = `Swipelux applies FATF Recommendation 16 controls when transfers exceed the applicable local threshold.

- **VASP-to-VASP:** Swipelux identifies the counterparty VASP and transmits Originator/Beneficiary data via protocol (TRISA/Notabene)
- **Unhosted Wallets:**
  - (a) Swipelux collects required Originator/Beneficiary information
  - (b) No data is transmitted since no receiving VASP exists
  - (c) Transfers may be blocked if blockchain analytics indicate high-risk exposure`;
  assert.doesNotThrow(() => assertTravelRulePolicy("Travel Rule fixture", travelFixture));
  assert.throws(
    () =>
      assertTravelRulePolicy(
        "unhosted inversion",
        travelFixture.replace(
          "No data is transmitted since no receiving VASP exists",
          "Unhosted wallets always transmit data to a receiving VASP",
        ),
      ),
    /Travel Rule branch/,
  );

  const monitoringFixture = `${MONITORING_SCOPE_LINE}\n\n${MONITORING_ITEMS.join("\n")}`;
  assert.doesNotThrow(() => assertMonitoringPolicy("monitoring fixture", monitoringFixture));
  assert.throws(
    () =>
      assertMonitoringPolicy(
        "screening cadence inversion",
        monitoringFixture.replace("Daily and event-triggered", "Annual"),
      ),
    /screening cadence inversion/,
  );
  assert.throws(
    () =>
      assertMonitoringPolicy(
        "monitoring scope inversion",
        monitoringFixture.replace(
          "across customers, wallets, and transactions",
          "across transactions only",
        ),
      ),
    /monitoring scope inversion/,
  );

  const liabilityFixture = [
    `| ${LIABILITY_TABLE[0][0].join(" | ")} |`,
    `| ${LIABILITY_TABLE[0][0].map(() => "---").join(" | ")} |`,
    ...LIABILITY_TABLE[0].slice(1).map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
  const governanceFixture = `${liabilityFixture}

- **Swipelux:** custody, blockchain execution, KYC/KYB, monitoring, Travel Rule, sanctions
- **Sub-merchant:** user journey design, geoblocking, vertical licensing, marketing compliance, prevention of unsolicited US targeting

Sub-merchants never hold, control, or access user assets or private keys.

Swipelux retains user identity and transactional data for 5 years. Data subject deletion requests do not apply to AML-mandated records. Swipelux stores all data within compliant EU infrastructure aligned with GDPR.`;
  assert.doesNotThrow(() => assertGovernancePolicy("governance fixture", governanceFixture));
  assert.throws(
    () =>
      assertGovernancePolicy(
        "custody responsibility inversion",
        governanceFixture.replace(
          "| Crypto Custody | Responsible | Not permitted |",
          "| Crypto Custody | Not permitted | Responsible |",
        ),
      ),
    /custody responsibility inversion/,
  );
  assert.throws(
    () => assertGovernancePolicy("retention inversion", governanceFixture.replace("5 years", "1 year")),
    /retention inversion/,
  );
  assert.throws(
    () =>
      assertGovernancePolicy(
        "deletion inversion",
        governanceFixture.replace(
          "deletion requests do not apply to AML-mandated records",
          "deletion requests immediately erase AML-mandated records",
        ),
      ),
    /deletion inversion/,
  );

  const perimeterFixture = `- control UX/UI and user acquisition
- connect users to Swipelux payment infrastructure
- never hold, control, or access private keys
- never custody funds or execute blockchain transactions
- **Swipelux:** KYC, sanctions, PEP screening, wallet screening, blockchain execution
- **Sub-merchant:** marketing compliance, UX geoblocking, sector-specific licensing`;
  assertContainsExactLines("perimeter fixture", perimeterFixture, perimeterFixture.split("\n"));
  assert.throws(
    () =>
      assertContainsExactLines(
        "responsibility inversion",
        perimeterFixture.replace(
          "**Swipelux:** KYC, sanctions, PEP screening, wallet screening, blockchain execution",
          "**Sub-merchant:** KYC, sanctions, PEP screening, wallet screening, blockchain execution",
        ),
        perimeterFixture.split("\n"),
      ),
    /responsibility inversion/,
  );
});
