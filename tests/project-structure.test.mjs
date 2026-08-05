import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("pins the supported Node and Mintlify versions", () => {
  assert.equal(read(".nvmrc").trim(), "24.15.0");
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.devDependencies.mint, "4.2.775");
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
});

test("keeps Codex and Claude repository instructions synchronized", () => {
  assert.ok(existsSync("AGENTS.md"));
  assert.ok(existsSync("CLAUDE.md"));
  for (const file of ["AGENTS.md", "CLAUDE.md"]) {
    const text = read(file);
    assert.match(text, /OpenAPI.*authoritative/i);
    assert.match(text, /v1.*v2.*must not/i);
    assert.match(text, /deployment branch.*main/i);
  }
});

test("ignores local agent and build artifacts", () => {
  const ignore = read(".gitignore");
  for (const entry of ["node_modules/", ".agents/", "skills-lock.json", ".DS_Store"]) {
    assert.ok(ignore.includes(entry), `missing ${entry}`);
  }
});
