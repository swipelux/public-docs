#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join } from "node:path";

import {
  PREPARATION_VERSION,
  SOURCE_SHA256,
  assertExpectedOpenApiCounts,
  prepareOpenApi,
} from "./lib/openapi.mjs";

function byteHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function formattedJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function generationTimestamp() {
  if (process.env.SOURCE_DATE_EPOCH !== undefined) {
    const epoch = Number(process.env.SOURCE_DATE_EPOCH);
    if (!Number.isInteger(epoch) || epoch < 0) {
      throw new Error("SOURCE_DATE_EPOCH must be a non-negative integer");
    }
    return new Date(epoch * 1000).toISOString();
  }
  return new Date().toISOString();
}

function main() {
  const [sourcePath, ...extraArguments] = process.argv.slice(2);
  if (!sourcePath || extraArguments.length > 0 || !isAbsolute(sourcePath)) {
    throw new Error(
      "Usage: node scripts/prepare-openapi.mjs <absolute-source-path>",
    );
  }

  const sourceBytes = readFileSync(sourcePath);
  const actualSha = byteHash(sourceBytes);
  if (actualSha !== SOURCE_SHA256) {
    throw new Error(
      `Source SHA-256 mismatch: expected ${SOURCE_SHA256}, received ${actualSha}`,
    );
  }

  const source = JSON.parse(sourceBytes.toString("utf8"));
  const { spec, transformations, preparedCoverage } = prepareOpenApi(
    source,
    actualSha,
  );
  const counts = assertExpectedOpenApiCounts(spec);
  const openApiText = formattedJson(spec);
  const provenance = {
    source: {
      basename: basename(sourcePath),
      sha256: actualSha,
    },
    output: {
      basename: "openapi.json",
      sha256: byteHash(openApiText),
    },
    tool: {
      script: "scripts/prepare-openapi.mjs",
      version: PREPARATION_VERSION,
    },
    generatedAt: generationTimestamp(),
    transformations,
  };

  const outputDirectory = process.cwd();
  writeFileSync(join(outputDirectory, "openapi.json"), openApiText);
  writeFileSync(
    join(outputDirectory, "openapi-provenance.json"),
    formattedJson(provenance),
  );
  writeFileSync(
    join(outputDirectory, "openapi-coverage.json"),
    formattedJson(preparedCoverage),
  );

  console.log(
    `Prepared OpenAPI: ${counts.paths} paths, ${counts.operations} operations, ${counts.schemas} schemas, ${counts.webhooks} webhooks`,
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
