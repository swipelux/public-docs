#!/usr/bin/env node

import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { readFileSync } from "node:fs";

import {
  PREPARATION_VERSION,
  SOURCE_SHA256,
  assertExpectedOpenApiCounts,
  buildCoverage,
  compareCoverage,
  verifyPreparedTransformations,
} from "./lib/openapi.mjs";

function byteHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readArtifact(directory, name) {
  const bytes = readFileSync(join(directory, name));
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

function main() {
  const directory = process.cwd();
  const openApi = readArtifact(directory, "openapi.json");
  const provenance = readArtifact(directory, "openapi-provenance.json").value;
  const coverage = readArtifact(directory, "openapi-coverage.json").value;

  if (provenance?.source?.sha256 !== SOURCE_SHA256) {
    throw new Error("Provenance source SHA-256 does not match the approved source");
  }
  if (
    typeof provenance?.source?.basename !== "string" ||
    provenance.source.basename !== basename(provenance.source.basename)
  ) {
    throw new Error("Provenance source must contain a basename, not a path");
  }
  if (provenance?.output?.basename !== "openapi.json") {
    throw new Error("Provenance output basename must be openapi.json");
  }
  const actualOutputSha = byteHash(openApi.bytes);
  if (provenance?.output?.sha256 !== actualOutputSha) {
    throw new Error(
      `OpenAPI output SHA-256 mismatch: expected ${provenance?.output?.sha256}, received ${actualOutputSha}`,
    );
  }
  if (
    provenance?.tool?.script !== "scripts/prepare-openapi.mjs" ||
    provenance?.tool?.version !== PREPARATION_VERSION
  ) {
    throw new Error("Provenance tool version does not match the verifier");
  }
  const generatedAt = new Date(provenance.generatedAt);
  if (
    Number.isNaN(generatedAt.valueOf()) ||
    generatedAt.toISOString() !== provenance.generatedAt
  ) {
    throw new Error("Provenance generatedAt must be an ISO-8601 timestamp");
  }

  verifyPreparedTransformations(openApi.value, provenance.transformations);
  const counts = assertExpectedOpenApiCounts(openApi.value);
  compareCoverage(coverage, buildCoverage(openApi.value));

  console.log(
    `OpenAPI verification passed: ${counts.operations} operations, ${counts.webhooks} webhooks`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
