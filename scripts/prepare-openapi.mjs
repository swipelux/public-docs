#!/usr/bin/env node

import { isAbsolute } from "node:path";

import {
  APPROVED_GENERATED_AT,
  EXPECTED_COVERAGE_SHA256,
  EXPECTED_OPENAPI_COUNTS,
  EXPECTED_OUTPUT_SHA256,
  EXPECTED_TRANSFORMATIONS_SHA256,
  SOURCE_BASENAME,
  SOURCE_COMMIT,
  SOURCE_REPOSITORY,
  SOURCE_ROUTE,
  SOURCE_SHA256,
} from "./lib/openapi.mjs";
import { prepareOpenApiArtifacts } from "./lib/openapi-artifacts.mjs";

function main() {
  const [sourcePath, ...extraArguments] = process.argv.slice(2);
  if (!sourcePath || extraArguments.length > 0 || !isAbsolute(sourcePath)) {
    throw new Error(
      "Usage: node scripts/prepare-openapi.mjs <absolute-source-path>",
    );
  }

  const { counts } = prepareOpenApiArtifacts({
    sourcePath,
    sourceMetadata: {
      repository: SOURCE_REPOSITORY,
      commit: SOURCE_COMMIT,
      route: SOURCE_ROUTE,
    },
    outputDirectory: process.cwd(),
    expectedSourceSha256: SOURCE_SHA256,
    expectedSourceBasename: SOURCE_BASENAME,
    deterministicTimestamp: APPROVED_GENERATED_AT,
    expectedOutputSha256: EXPECTED_OUTPUT_SHA256,
    expectedCoverageSha256: EXPECTED_COVERAGE_SHA256,
    expectedTransformationsSha256: EXPECTED_TRANSFORMATIONS_SHA256,
    expectedCounts: EXPECTED_OPENAPI_COUNTS,
  });

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
