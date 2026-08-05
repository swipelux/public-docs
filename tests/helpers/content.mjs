import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  validateFrontmatter,
  validatePublishedText,
} from "../../scripts/lib/docs-validation.mjs";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

function pagePath(page) {
  const normalized = page.replace(/^\//, "").replace(/\.mdx$/, "");
  return normalized === "" || normalized === "index"
    ? "index.mdx"
    : `${normalized}.mdx`;
}

export function readPage(page) {
  return readFileSync(resolve(projectRoot, pagePath(page)), "utf8");
}

export function assertFrontmatter(page, text = readPage(page)) {
  assert.deepEqual(validateFrontmatter(pagePath(page), text), []);
}

export function assertNoBannedText(page, text = readPage(page)) {
  assert.deepEqual(validatePublishedText(pagePath(page), text), []);
}

export function assertPages(pages) {
  for (const page of pages) {
    const path = resolve(projectRoot, pagePath(page));
    assert.ok(existsSync(path), `Missing page: ${pagePath(page)}`);
    const text = readFileSync(path, "utf8");
    assertFrontmatter(page, text);
    assertNoBannedText(page, text);
  }
}
