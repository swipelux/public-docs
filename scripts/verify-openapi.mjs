#!/usr/bin/env node

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
import { verifyOpenApiArtifacts } from "./lib/openapi-artifacts.mjs";

function main() {
  const { counts } = verifyOpenApiArtifacts({
    directory: process.cwd(),
    sourcePath: process.env.OPENAPI_SOURCE_PATH,
    expectedSourceMetadata: {
      repository: SOURCE_REPOSITORY,
      commit: SOURCE_COMMIT,
      route: SOURCE_ROUTE,
    },
    expectedSourceSha256: SOURCE_SHA256,
    expectedSourceBasename: SOURCE_BASENAME,
    expectedOutputSha256: EXPECTED_OUTPUT_SHA256,
    expectedCoverageSha256: EXPECTED_COVERAGE_SHA256,
    expectedTransformationsSha256: EXPECTED_TRANSFORMATIONS_SHA256,
    expectedGeneratedAt: APPROVED_GENERATED_AT,
    expectedCounts: EXPECTED_OPENAPI_COUNTS,
  });

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
