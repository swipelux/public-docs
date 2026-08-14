import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join } from "node:path";

import {
  PREPARATION_VERSION,
  assertOpenApiCounts,
  buildCoverage,
  canonicalHash,
  compareCoverage,
  prepareOpenApi,
  verifyPreparedTransformations,
} from "./openapi.mjs";

export const OPENAPI_ARTIFACT_NAMES = Object.freeze([
  "openapi.json",
  "openapi-coverage.json",
  "openapi-provenance.json",
]);

const INSTALL_ORDER = OPENAPI_ARTIFACT_NAMES;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/;

export function byteHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function formattedJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertSha256(label, value) {
  if (!SHA256_PATTERN.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertWholeSecondTimestamp(label, value) {
  if (typeof value !== "string" || !value.endsWith(".000Z")) {
    throw new Error(`${label} must be a whole-second ISO-8601 timestamp`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a whole-second ISO-8601 timestamp`);
  }
}

function validateSourceMetadata(sourceMetadata) {
  if (sourceMetadata === undefined) return;
  if (
    typeof sourceMetadata !== "object" ||
    sourceMetadata === null ||
    Array.isArray(sourceMetadata)
  ) {
    throw new TypeError("OpenAPI source metadata must be an object");
  }
  if (
    typeof sourceMetadata.repository !== "string" ||
    sourceMetadata.repository.trim() === ""
  ) {
    throw new Error("OpenAPI source repository must be a non-empty string");
  }
  if (!COMMIT_SHA_PATTERN.test(sourceMetadata.commit)) {
    throw new Error("OpenAPI source commit must be a lowercase 40-character SHA");
  }
  if (
    typeof sourceMetadata.route !== "string" ||
    !sourceMetadata.route.startsWith("/")
  ) {
    throw new Error("OpenAPI source route must start with /");
  }
}

function validateOptions({
  sourcePath,
  expectedSourceSha256,
  expectedSourceBasename,
  expectedOutputSha256,
  expectedCoverageSha256,
  expectedTransformationsSha256,
  expectedCounts,
}) {
  if (typeof sourcePath !== "string" || !isAbsolute(sourcePath)) {
    throw new Error("OpenAPI source path must be absolute");
  }
  if (
    typeof expectedSourceBasename !== "string" ||
    expectedSourceBasename !== basename(expectedSourceBasename)
  ) {
    throw new Error("Expected OpenAPI source basename must be a basename");
  }
  assertSha256("Expected source SHA-256", expectedSourceSha256);
  assertSha256("Expected OpenAPI output SHA-256", expectedOutputSha256);
  assertSha256("Expected coverage SHA-256", expectedCoverageSha256);
  assertSha256(
    "Expected transformations SHA-256",
    expectedTransformationsSha256,
  );
  for (const name of ["paths", "operations", "schemas", "webhooks"]) {
    if (!Number.isInteger(expectedCounts?.[name]) || expectedCounts[name] < 0) {
      throw new Error(
        `Expected count for ${name} must be a non-negative integer`,
      );
    }
  }
}

function readJsonArtifact(directory, name) {
  const bytes = readFileSync(join(directory, name));
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

function assertTrustedHash(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(
      `Trusted ${label} mismatch: expected ${expected}, received ${actual}`,
    );
  }
}

function artifactTexts(artifactSet) {
  return {
    "openapi.json": artifactSet.openApiText,
    "openapi-coverage.json": artifactSet.coverageText,
    "openapi-provenance.json": artifactSet.provenanceText,
  };
}

export function buildOpenApiArtifactSet({
  sourcePath,
  sourceMetadata,
  expectedSourceSha256,
  expectedSourceBasename,
  deterministicTimestamp,
  expectedOutputSha256,
  expectedCoverageSha256,
  expectedTransformationsSha256,
  expectedCounts,
}) {
  validateSourceMetadata(sourceMetadata);
  validateOptions({
    sourcePath,
    expectedSourceSha256,
    expectedSourceBasename,
    expectedOutputSha256,
    expectedCoverageSha256,
    expectedTransformationsSha256,
    expectedCounts,
  });
  assertWholeSecondTimestamp(
    "Deterministic generation timestamp",
    deterministicTimestamp,
  );

  const sourceBytes = readFileSync(sourcePath);
  const actualSourceSha256 = byteHash(sourceBytes);
  if (actualSourceSha256 !== expectedSourceSha256) {
    throw new Error(
      `Source SHA-256 mismatch: expected ${expectedSourceSha256}, received ${actualSourceSha256}`,
    );
  }
  if (basename(sourcePath) !== expectedSourceBasename) {
    throw new Error(
      `OpenAPI source basename mismatch: expected ${expectedSourceBasename}, received ${basename(sourcePath)}`,
    );
  }

  const source = JSON.parse(sourceBytes.toString("utf8"));
  const { spec, transformations, preparedCoverage } = prepareOpenApi(
    source,
    actualSourceSha256,
    { expectedSourceSha256 },
  );
  const counts = assertOpenApiCounts(spec, expectedCounts);
  const openApiText = formattedJson(spec);
  const coverageText = formattedJson(preparedCoverage);
  const outputSha256 = byteHash(openApiText);
  const coverageSha256 = byteHash(coverageText);
  const transformationsSha256 = canonicalHash(transformations);

  assertTrustedHash(
    "OpenAPI output SHA-256",
    outputSha256,
    expectedOutputSha256,
  );
  assertTrustedHash(
    "coverage SHA-256",
    coverageSha256,
    expectedCoverageSha256,
  );
  assertTrustedHash(
    "transformation digest",
    transformationsSha256,
    expectedTransformationsSha256,
  );

  const provenance = {
    source: {
      basename: basename(sourcePath),
      sha256: actualSourceSha256,
      ...(sourceMetadata ?? {}),
    },
    output: {
      basename: "openapi.json",
      sha256: outputSha256,
    },
    coverage: {
      basename: "openapi-coverage.json",
      sha256: coverageSha256,
    },
    transformationsSha256,
    tool: {
      script: "scripts/prepare-openapi.mjs",
      version: PREPARATION_VERSION,
    },
    generatedAt: deterministicTimestamp,
    transformations,
  };

  return {
    counts,
    openApiText,
    coverageText,
    provenanceText: formattedJson(provenance),
    hashes: {
      source: actualSourceSha256,
      output: outputSha256,
      coverage: coverageSha256,
      transformations: transformationsSha256,
    },
  };
}

function compareReplayArtifact(name, expectedText, actualBytes) {
  const expectedBytes = Buffer.from(expectedText, "utf8");
  if (!expectedBytes.equals(actualBytes)) {
    throw new Error(`Strict source replay changed ${name}`);
  }
}

export function verifyOpenApiArtifacts({
  directory,
  sourcePath,
  expectedSourceMetadata,
  expectedSourceSha256,
  expectedSourceBasename,
  expectedOutputSha256,
  expectedCoverageSha256,
  expectedTransformationsSha256,
  expectedGeneratedAt,
  expectedCounts,
}) {
  validateSourceMetadata(expectedSourceMetadata);
  if (typeof directory !== "string" || !isAbsolute(directory)) {
    throw new Error("OpenAPI artifact directory must be absolute");
  }
  validateOptions({
    sourcePath: sourcePath ?? join(directory, expectedSourceBasename),
    expectedSourceSha256,
    expectedSourceBasename,
    expectedOutputSha256,
    expectedCoverageSha256,
    expectedTransformationsSha256,
    expectedCounts,
  });
  assertWholeSecondTimestamp(
    "Expected generation timestamp",
    expectedGeneratedAt,
  );

  const openApi = readJsonArtifact(directory, "openapi.json");
  const coverage = readJsonArtifact(directory, "openapi-coverage.json");
  const provenance = readJsonArtifact(
    directory,
    "openapi-provenance.json",
  ).value;

  if (provenance?.source?.sha256 !== expectedSourceSha256) {
    throw new Error("Provenance source SHA-256 does not match the approved source");
  }
  if (provenance?.source?.basename !== expectedSourceBasename) {
    throw new Error("Provenance source basename does not match the approved source");
  }
  if (expectedSourceMetadata !== undefined) {
    for (const [field, expected] of Object.entries(expectedSourceMetadata)) {
      if (provenance?.source?.[field] !== expected) {
        throw new Error(
          `Provenance source ${field} does not match the approved source`,
        );
      }
    }
  }
  if (provenance?.output?.basename !== "openapi.json") {
    throw new Error("Provenance output basename must be openapi.json");
  }
  if (provenance?.coverage?.basename !== "openapi-coverage.json") {
    throw new Error("Provenance coverage basename must be openapi-coverage.json");
  }

  const actualOutputSha256 = byteHash(openApi.bytes);
  assertTrustedHash(
    "OpenAPI output SHA-256",
    actualOutputSha256,
    expectedOutputSha256,
  );
  if (provenance.output.sha256 !== actualOutputSha256) {
    throw new Error(
      `OpenAPI output SHA-256 mismatch: expected ${provenance.output.sha256}, received ${actualOutputSha256}`,
    );
  }

  const actualCoverageSha256 = byteHash(coverage.bytes);
  assertTrustedHash(
    "coverage SHA-256",
    actualCoverageSha256,
    expectedCoverageSha256,
  );
  if (provenance.coverage.sha256 !== actualCoverageSha256) {
    throw new Error(
      `Coverage SHA-256 mismatch: expected ${provenance.coverage.sha256}, received ${actualCoverageSha256}`,
    );
  }

  const actualTransformationsSha256 = canonicalHash(
    provenance.transformations,
  );
  assertTrustedHash(
    "transformation digest",
    actualTransformationsSha256,
    expectedTransformationsSha256,
  );
  if (provenance.transformationsSha256 !== actualTransformationsSha256) {
    throw new Error("Provenance transformation digest does not match its records");
  }

  if (
    provenance?.tool?.script !== "scripts/prepare-openapi.mjs" ||
    provenance?.tool?.version !== PREPARATION_VERSION
  ) {
    throw new Error("Provenance tool version does not match the verifier");
  }
  if (provenance.generatedAt !== expectedGeneratedAt) {
    throw new Error(
      `Provenance generatedAt mismatch: expected ${expectedGeneratedAt}, received ${provenance.generatedAt}`,
    );
  }
  assertWholeSecondTimestamp("Provenance generatedAt", provenance.generatedAt);

  verifyPreparedTransformations(openApi.value, provenance.transformations);
  const counts = assertOpenApiCounts(openApi.value, expectedCounts);
  compareCoverage(coverage.value, buildCoverage(openApi.value));

  if (sourcePath !== undefined) {
    const replay = buildOpenApiArtifactSet({
      sourcePath,
      sourceMetadata: expectedSourceMetadata,
      expectedSourceSha256,
      expectedSourceBasename,
      deterministicTimestamp: expectedGeneratedAt,
      expectedOutputSha256,
      expectedCoverageSha256,
      expectedTransformationsSha256,
      expectedCounts,
    });
    const replayTexts = artifactTexts(replay);
    compareReplayArtifact(
      "openapi.json",
      replayTexts["openapi.json"],
      openApi.bytes,
    );
    compareReplayArtifact(
      "openapi-coverage.json",
      replayTexts["openapi-coverage.json"],
      coverage.bytes,
    );
    compareReplayArtifact(
      "openapi-provenance.json",
      replayTexts["openapi-provenance.json"],
      readFileSync(join(directory, "openapi-provenance.json")),
    );
  }

  return {
    counts,
    hashes: {
      output: actualOutputSha256,
      coverage: actualCoverageSha256,
      transformations: actualTransformationsSha256,
    },
  };
}

function writeStagedArtifacts(directory, artifactSet) {
  const texts = artifactTexts(artifactSet);
  for (const name of OPENAPI_ARTIFACT_NAMES) {
    writeFileSync(join(directory, name), texts[name], {
      encoding: "utf8",
      flag: "wx",
    });
  }
}

function rollbackArtifacts(outputDirectory, backupDirectory, originalFiles) {
  const errors = [];
  for (const name of INSTALL_ORDER) {
    const destinationPath = join(outputDirectory, name);
    try {
      if (originalFiles.has(name)) {
        renameSync(join(backupDirectory, name), destinationPath);
      } else {
        rmSync(destinationPath, { force: true });
      }
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, "Failed to roll back OpenAPI artifacts");
  }
}

function replaceArtifactSet({
  stagedDirectory,
  outputDirectory,
  installFile,
  verifyInstalled,
}) {
  const backupDirectory = mkdtempSync(
    join(outputDirectory, ".openapi-backup-"),
  );
  const originalFiles = new Set(
    OPENAPI_ARTIFACT_NAMES.filter((name) =>
      existsSync(join(outputDirectory, name)),
    ),
  );

  try {
    for (const name of originalFiles) {
      copyFileSync(
        join(outputDirectory, name),
        join(backupDirectory, name),
      );
    }

    try {
      for (const name of INSTALL_ORDER) {
        installFile(
          join(stagedDirectory, name),
          join(outputDirectory, name),
        );
      }
      verifyInstalled();
    } catch (error) {
      try {
        rollbackArtifacts(outputDirectory, backupDirectory, originalFiles);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          "OpenAPI artifact installation and rollback both failed",
        );
      }
      throw error;
    }
  } finally {
    rmSync(backupDirectory, { recursive: true, force: true });
  }
}

export function prepareOpenApiArtifacts({
  sourcePath,
  sourceMetadata,
  outputDirectory,
  expectedSourceSha256,
  expectedSourceBasename,
  deterministicTimestamp,
  expectedOutputSha256,
  expectedCoverageSha256,
  expectedTransformationsSha256,
  expectedCounts,
  installFile = renameSync,
}) {
  if (typeof outputDirectory !== "string" || !isAbsolute(outputDirectory)) {
    throw new Error("OpenAPI output directory must be absolute");
  }
  if (typeof installFile !== "function") {
    throw new TypeError("installFile must be a function");
  }

  const artifactSet = buildOpenApiArtifactSet({
    sourcePath,
    sourceMetadata,
    expectedSourceSha256,
    expectedSourceBasename,
    deterministicTimestamp,
    expectedOutputSha256,
    expectedCoverageSha256,
    expectedTransformationsSha256,
    expectedCounts,
  });
  mkdirSync(outputDirectory, { recursive: true });
  const stagedDirectory = mkdtempSync(
    join(outputDirectory, ".openapi-stage-"),
  );

  const verificationOptions = {
    directory: stagedDirectory,
    sourcePath,
    expectedSourceMetadata: sourceMetadata,
    expectedSourceSha256,
    expectedSourceBasename,
    expectedOutputSha256,
    expectedCoverageSha256,
    expectedTransformationsSha256,
    expectedGeneratedAt: deterministicTimestamp,
    expectedCounts,
  };

  try {
    writeStagedArtifacts(stagedDirectory, artifactSet);
    verifyOpenApiArtifacts(verificationOptions);
    replaceArtifactSet({
      stagedDirectory,
      outputDirectory,
      installFile,
      verifyInstalled() {
        verifyOpenApiArtifacts({
          ...verificationOptions,
          directory: outputDirectory,
        });
      },
    });
    return { counts: artifactSet.counts, hashes: artifactSet.hashes };
  } finally {
    rmSync(stagedDirectory, { recursive: true, force: true });
  }
}
