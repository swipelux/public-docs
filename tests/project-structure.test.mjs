import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("pins the supported Node, npm, and Mintlify versions", () => {
  assert.equal(read(".nvmrc").trim(), "24.15.0");
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(
    {
      node: pkg.engines?.node,
      packageManager: pkg.packageManager,
    },
    {
      node: "24.15.x",
      packageManager: "npm@11.12.1",
    },
  );
  assert.equal(pkg.devDependencies.mint, "4.2.775");
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
});

test("locks the root Mintlify dependency to the supported version", () => {
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(lock.packages[""].devDependencies.mint, "4.2.775");
  assert.equal(lock.packages["node_modules/mint"].version, "4.2.775");
});

test("keeps Codex and Claude repository instructions synchronized", () => {
  assert.ok(existsSync("AGENTS.md"));
  assert.ok(existsSync("CLAUDE.md"));
  assert.equal(read("AGENTS.md"), read("CLAUDE.md"));
  for (const file of ["AGENTS.md", "CLAUDE.md"]) {
    const text = read(file);
    assert.match(text, /OpenAPI.*authoritative/i);
    assert.match(text, /v1.*v2.*must not/i);
    assert.match(text, /deployment branch.*main/i);
  }
});

test("excludes repository internals while publishing the OpenAPI contract", () => {
  const entries = new Set(
    read(".mintignore")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );

  for (const entry of [
    "docs/",
    "scripts/",
    "tests/",
    ".github/",
    ".agents/",
    "openapi-provenance.json",
    "openapi-coverage.json",
  ]) {
    assert.ok(entries.has(entry), `missing ${entry}`);
  }
  assert.ok(!entries.has("openapi.json"), "openapi.json must remain publishable");
});

test("ignores local agent and build artifacts", () => {
  const ignore = read(".gitignore");
  for (const entry of ["node_modules/", ".agents/", "skills-lock.json", ".DS_Store"]) {
    assert.ok(ignore.includes(entry), `missing ${entry}`);
  }
});
