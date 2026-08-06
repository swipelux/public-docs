import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseDocument } from "yaml";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const workflowPath = resolve(projectRoot, ".github/workflows/docs.yml");
const read = (path) => readFileSync(resolve(projectRoot, path), "utf8");
const packageJson = JSON.parse(read("package.json"));

function loadWorkflow() {
  assert.ok(existsSync(workflowPath), ".github/workflows/docs.yml must exist");

  const document = parseDocument(read(".github/workflows/docs.yml"), {
    uniqueKeys: true,
  });
  assert.deepEqual(
    document.errors.map(({ message }) => message),
    [],
    "docs workflow must be valid YAML without duplicate keys",
  );
  return document.toJS();
}

function collectProperties(value, property, matches = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectProperties(item, property, matches));
    return matches;
  }
  if (!value || typeof value !== "object") return matches;
  if (Object.hasOwn(value, property)) matches.push(value[property]);
  Object.values(value).forEach((item) =>
    collectProperties(item, property, matches),
  );
  return matches;
}

test("runs one least-privilege documentation verification job", () => {
  assert.equal(
    packageJson.devDependencies?.yaml,
    "2.9.0",
    "the workflow test must declare its YAML parser directly",
  );

  const workflow = loadWorkflow();

  assert.deepEqual(Object.keys(workflow).sort(), [
    "jobs",
    "name",
    "on",
    "permissions",
  ]);
  assert.equal(workflow.name, "Docs");
  assert.deepEqual(workflow.on, {
    pull_request: null,
    push: { branches: ["main"] },
  });
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.deepEqual(collectProperties(workflow, "permissions"), [
    { contents: "read" },
  ]);

  assert.deepEqual(Object.keys(workflow.jobs), ["verify"]);
  const verify = workflow.jobs.verify;
  assert.deepEqual(Object.keys(verify).sort(), ["runs-on", "steps"]);
  assert.equal(verify["runs-on"], "ubuntu-latest");
  assert.equal(verify.steps.length, 4);

  const [checkout, setupNode, install, check] = verify.steps;
  assert.equal(checkout.uses, "actions/checkout@v4");
  assert.equal(setupNode.uses, "actions/setup-node@v4");
  assert.deepEqual(setupNode.with, {
    "node-version-file": ".nvmrc",
    cache: "npm",
  });
  assert.equal(install.run.trim(), "npm ci");
  assert.equal(check.run.trim(), "npm run check");

  assert.deepEqual(
    verify.steps.flatMap(({ uses }) => (uses ? [uses] : [])),
    ["actions/checkout@v4", "actions/setup-node@v4"],
  );
  assert.deepEqual(
    verify.steps.flatMap(({ run }) => (run ? [run.trim()] : [])),
    ["npm ci", "npm run check"],
  );
  assert.deepEqual(collectProperties(workflow, "secrets"), []);
  assert.deepEqual(collectProperties(workflow, "environment"), []);

  const workflowText = JSON.stringify(workflow);
  assert.doesNotMatch(workflowText, /\$\{\{\s*secrets\.|\bwrite\b/i);
  assert.doesNotMatch(
    workflowText,
    /\b(?:curl|wget)\b|https?:\/\/|\bdeploy(?:ment)?\b/i,
  );
});

test("documents final verification, deployment, and policy release gates", () => {
  const readme = read("README.md");

  for (const stalePattern of [
    /during the staged rebuild/i,
    /phase[^\n]{0,80}\bcurrent\b/i,
    /\bcurrent\b[^\n]{0,80}phase/i,
    /In Task 11,\s*after/i,
    /Task 11[^\n]{0,120}\bremains?\b/i,
    /Tasks 2 and 3 add/i,
    /Until then, use `npm test`/i,
    /\bTask 11\b/i,
  ]) {
    assert.doesNotMatch(readme, stalePattern);
  }

  assert.match(readme, /Redirect verification is complete/i);
  assert.match(readme, /committed[^\n]*phase[^\n]*`?final`?/i);
  assert.match(readme, /62 redirects[^\n]*verified/i);
  assert.match(readme, /\bnvm install\b/);
  assert.match(readme, /\bnvm use\b/);
  assert.match(readme, /\bnpm ci\b/);
  assert.match(
    readme,
    /npm run prepare:openapi -- "\/absolute\/path\/to\/api-source\.json"/,
  );
  assert.match(readme, /\bnpx mint dev\b/);
  assert.match(readme, /\bnpm run check\b/);
  assert.match(readme, /GitHub Actions[^\n]*`npm run check`/i);

  const deploymentBranchLink =
    "https://www.mintlify.com/docs/deploy/github#check-deployment-branch";
  assert.ok(readme.includes(deploymentBranchLink));
  assert.match(readme, /connected to Mintlify[^\n]*GitHub App/i);
  assert.match(readme, /production deployment branch is `main`/i);
  assert.match(
    readme,
    /Mintlify dashboard deployment branch must match `main`/i,
  );
  assert.match(
    readme,
    /merg(?:e|ing)[^\n]*`main`[^\n]*triggers? Mintlify production deployment/i,
  );

  assert.match(
    readme,
    /`review-required`[^\n]*accountable legal\/compliance approval/i,
  );
  assert.match(
    readme,
    /jurisdiction-source contradictions[^\n]*production-release blocker[^\n]*until resolved/i,
  );
});

test("rewrite planning metadata points the API reference redirect at a live operation", () => {
  const destination = "/api-reference/customers/post-v3-customers";
  const design = read("docs/specs/2026-08-05-developer-guides-rewrite-design.md");
  const plan = read("docs/plans/2026-08-05-developer-guides-rewrite.md");

  assert.ok(
    design.includes(
      `| \`/integration/using-the-api-reference\` | Redirect to \`${destination}\`. |`,
    ),
  );
  assert.ok(
    plan.includes(
      `"/integration/using-the-api-reference": "${destination}",`,
    ),
  );
});
