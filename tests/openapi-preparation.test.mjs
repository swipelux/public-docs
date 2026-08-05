import test from "node:test";
import assert from "node:assert/strict";
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
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  SOURCE_SHA256,
  buildCoverage,
  canonicalHash,
  compareCoverage,
  compareSourceToPrepared,
  operationSlug,
  prepareOpenApi,
} from "../scripts/lib/openapi.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const artifactNames = [
  "openapi.json",
  "openapi-coverage.json",
  "openapi-provenance.json",
];
const fixtureExpectations = Object.freeze({
  sourceSha256:
    "b3b86c0a80dea1cbefb80737ba8669814c2a674566915e10967d282b572c2369",
  outputSha256:
    "016273cfd6173e122978e7a8b85851ad63dba7455d384165ebe8d7c50b7fc9fc",
  coverageSha256:
    "0e08e2512342a2468b6ac8573fdfb455f1be1006962a8f135788d76001af8db8",
  transformationsSha256:
    "151bf3ef3def2bc41a8605034745de46f8cfbb3e3f39b2101e1e7bb65101d95e",
  generatedAt: "2026-08-05T00:00:00.000Z",
  counts: Object.freeze({
    paths: 2,
    operations: 2,
    schemas: 2,
    webhooks: 2,
  }),
});

function byteHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function copyTrackedArtifacts(directory) {
  for (const name of artifactNames) {
    copyFileSync(join(projectRoot, name), join(directory, name));
  }
}

function writeFixtureSource(directory) {
  const sourcePath = join(directory, "fixture-source.json");
  const sourceText = `${JSON.stringify(makeFixture(), null, 2)}\n`;
  assert.equal(byteHash(sourceText), fixtureExpectations.sourceSha256);
  writeFileSync(sourcePath, sourceText);
  return sourcePath;
}

function fixtureArtifactOptions(sourcePath, outputDirectory) {
  return {
    sourcePath,
    outputDirectory,
    expectedSourceSha256: fixtureExpectations.sourceSha256,
    expectedSourceBasename: basename(sourcePath),
    deterministicTimestamp: fixtureExpectations.generatedAt,
    expectedOutputSha256: fixtureExpectations.outputSha256,
    expectedCoverageSha256: fixtureExpectations.coverageSha256,
    expectedTransformationsSha256:
      fixtureExpectations.transformationsSha256,
    expectedCounts: fixtureExpectations.counts,
  };
}

function operation(operationId, tag, responses = { "200": { description: "OK" } }) {
  return {
    operationId,
    tags: [tag],
    parameters: [
      {
        name: "limit",
        in: "query",
        schema: { type: "integer" },
      },
    ],
    responses,
  };
}

function webhook(name) {
  const legacy = {
    type: "object",
    required: ["type", "data", "createdAt"],
    properties: {
      type: { type: "string", const: name },
      data: { $ref: "#/components/schemas/Customer" },
      createdAt: { type: "integer" },
    },
  };
  const v3 = {
    type: "object",
    required: ["id", "type", "resource", "data"],
    properties: {
      id: { type: "string" },
      type: { type: "string", const: name },
      resource: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: { type: "string", const: "customer" },
        },
      },
      data: {
        type: "object",
        properties: {
          object: { $ref: "#/components/schemas/Customer" },
        },
      },
    },
  };

  return {
    post: {
      operationId: name,
      summary: name,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { oneOf: [legacy, v3] },
            examples: {
              legacy: { value: { type: name, createdAt: 1 } },
              v3: { value: { id: "evt_123", type: name } },
            },
          },
        },
      },
      responses: {
        "200": { description: "Accepted" },
      },
    },
  };
}

function makeFixture() {
  return {
    openapi: "3.1.0",
    info: { title: "Fixture API", version: "3.0.0" },
    servers: [{ url: "https://platform.example.com" }],
    security: [{ apiKey: [] }],
    paths: {
      "/v3/customers": {
        parameters: [
          {
            name: "X-Tenant",
            in: "header",
            schema: { type: "string" },
          },
        ],
        get: operation("listCustomerProfiles", "Customer Profiles", {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Customer" },
              },
            },
          },
          "400": {
            description: "Bad request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" },
              },
            },
          },
        }),
      },
      "/v3/customers/{customerId}/tasks": {
        post: operation(
          "createCustomerTaskSubmission",
          "Task submissions",
          { "201": { description: "Created" } },
        ),
      },
    },
    webhooks: {
      "customer.created": webhook("customer.created"),
      "customer.updated": webhook("customer.updated"),
    },
    components: {
      securitySchemes: {
        apiKey: { type: "apiKey", in: "header", name: "X-API-Key" },
        serviceToken: { type: "http", scheme: "bearer" },
        uploadToken: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        Customer: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        Error: {
          type: "object",
          properties: { message: { type: "string" } },
        },
      },
    },
  };
}

test("canonicalHash sorts object keys recursively but preserves array order", () => {
  const left = {
    z: 1,
    nested: { b: 2, a: [{ y: 2, x: 1 }, "second"] },
  };
  const right = {
    nested: { a: [{ x: 1, y: 2 }, "second"], b: 2 },
    z: 1,
  };
  const reorderedArray = {
    nested: { a: ["second", { x: 1, y: 2 }], b: 2 },
    z: 1,
  };

  assert.equal(canonicalHash(left), canonicalHash(right));
  assert.notEqual(canonicalHash(left), canonicalHash(reorderedArray));
  assert.match(canonicalHash(left), /^[a-f0-9]{64}$/);
});

test("operationSlug creates stable tag and operation path segments", () => {
  assert.equal(
    operationSlug("Task submissions", "createCustomerTaskSubmission"),
    "task-submissions/create-customer-task-submission",
  );
  assert.equal(operationSlug("customer.created"), "customer-created");
});

test("rejects a source hash mismatch", () => {
  assert.throws(
    () => prepareOpenApi(makeFixture(), "wrong"),
    /source SHA-256/i,
  );
});

test("rejects non-v3 HTTP paths", () => {
  const bad = makeFixture();
  bad.paths["/v2/customers"] = {
    get: operation("legacyCustomers", "Customers"),
  };

  assert.throws(
    () => prepareOpenApi(bad, SOURCE_SHA256),
    /non-v3 path/i,
  );
});

test("rejects missing and duplicate operationIds", () => {
  const missing = makeFixture();
  delete missing.paths["/v3/customers"].get.operationId;
  assert.throws(
    () => prepareOpenApi(missing, SOURCE_SHA256),
    /missing operationId/i,
  );

  const duplicate = makeFixture();
  duplicate.paths["/v3/customers/{customerId}/tasks"].post.operationId =
    "listCustomerProfiles";
  assert.throws(
    () => prepareOpenApi(duplicate, SOURCE_SHA256),
    /duplicate operationId/i,
  );
});

test("removes only legacy customer webhook branches and keeps v3 examples", () => {
  const source = makeFixture();
  const original = structuredClone(source);
  const { spec, transformations } = prepareOpenApi(source, SOURCE_SHA256);

  for (const name of ["customer.created", "customer.updated"]) {
    const media =
      spec.webhooks[name].post.requestBody.content["application/json"];
    assert.equal(media.schema.oneOf, undefined);
    assert.equal(media.examples.legacy, undefined);
    assert.ok(media.examples.v3);
    assert.equal(media.schema.properties.type.const, name);
  }

  assert.deepEqual(source, original, "prepareOpenApi must not mutate the source");
  assert.deepEqual(
    transformations
      .filter((item) => item.pointer.includes("/webhooks/"))
      .map((item) => item.pointer)
      .sort(),
    [
      "/webhooks/customer.created/post/requestBody/content/application~1json/examples/legacy",
      "/webhooks/customer.created/post/requestBody/content/application~1json/schema",
      "/webhooks/customer.updated/post/requestBody/content/application~1json/examples/legacy",
      "/webhooks/customer.updated/post/requestBody/content/application~1json/schema",
    ],
  );
});

test("publishes only X-API-Key authentication", () => {
  const { spec } = prepareOpenApi(makeFixture(), SOURCE_SHA256);
  assert.deepEqual(Object.keys(spec.components.securitySchemes), ["apiKey"]);
  assert.deepEqual(spec.security, [{ apiKey: [] }]);
});

test("rejects deleting security schemes referenced globally or by operations", () => {
  const globalReference = makeFixture();
  globalReference.security = [{ serviceToken: [] }];
  assert.throws(
    () => prepareOpenApi(globalReference, SOURCE_SHA256),
    /serviceToken.*global security requirement/i,
  );

  const operationReference = makeFixture();
  operationReference.paths["/v3/customers"].get.security = [
    { uploadToken: [] },
  ];
  assert.throws(
    () => prepareOpenApi(operationReference, SOURCE_SHA256),
    /uploadToken.*GET \/v3\/customers/i,
  );
});

test("assigns stable unique endpoint hrefs and coverage-only webhook hrefs", () => {
  const { spec, preparedCoverage } = prepareOpenApi(
    makeFixture(),
    SOURCE_SHA256,
  );

  assert.equal(
    spec.paths["/v3/customers"].get["x-mint"].href,
    "/api-reference/customer-profiles/list-customer-profiles",
  );
  assert.equal(
    spec.paths["/v3/customers/{customerId}/tasks"].post["x-mint"].href,
    "/api-reference/task-submissions/create-customer-task-submission",
  );
  assert.equal(
    spec.webhooks["customer.created"].post["x-mint"],
    undefined,
  );
  assert.deepEqual(
    preparedCoverage.webhooks.map(({ name, href }) => ({ name, href })),
    [
      {
        name: "customer.created",
        href: "/api-reference/webhooks/customer-created",
      },
      {
        name: "customer.updated",
        href: "/api-reference/webhooks/customer-updated",
      },
    ],
  );

  const hrefs = [
    ...preparedCoverage.operations.map((entry) => entry.href),
    ...preparedCoverage.webhooks.map((entry) => entry.href),
  ];
  assert.equal(new Set(hrefs).size, hrefs.length);
  assert.doesNotThrow(() =>
    compareCoverage(preparedCoverage, buildCoverage(spec)),
  );
});

test("assigns href groups independently of source tag order", () => {
  const first = makeFixture();
  first.paths["/v3/customers"].get.tags = ["Zeta group", "Alpha group"];
  const second = structuredClone(first);
  second.paths["/v3/customers"].get.tags.reverse();

  const firstHref = prepareOpenApi(first, SOURCE_SHA256).spec.paths[
    "/v3/customers"
  ].get["x-mint"].href;
  const secondHref = prepareOpenApi(second, SOURCE_SHA256).spec.paths[
    "/v3/customers"
  ].get["x-mint"].href;

  assert.equal(firstHref, secondHref);
  assert.equal(
    firstHref,
    "/api-reference/alpha-group/list-customer-profiles",
  );
});

test("rejects duplicate generated hrefs", () => {
  const bad = makeFixture();
  bad.paths["/v3/customers/{customerId}/tasks"].post.tags = [
    "Customer Profiles",
  ];
  bad.paths["/v3/customers/{customerId}/tasks"].post.operationId =
    "list-customer-profiles";

  assert.throws(
    () => prepareOpenApi(bad, SOURCE_SHA256),
    /duplicate generated href/i,
  );
});

test("rejects dangling internal refs", () => {
  const bad = makeFixture();
  bad.paths["/v3/customers"].get.responses["200"].content[
    "application/json"
  ].schema.$ref = "#/components/schemas/Missing";

  assert.throws(
    () => prepareOpenApi(bad, SOURCE_SHA256),
    /dangling internal.*ref/i,
  );
});

test("resolves percent-encoded internal JSON Pointer fragments", () => {
  const source = makeFixture();
  source.components.schemas["Customer Record"] = {
    type: "object",
    properties: { id: { type: "string" } },
  };
  source.paths["/v3/customers"].get.responses["200"].content[
    "application/json"
  ].schema.$ref =
    "#%2Fcomponents%2Fschemas%2FCustomer%20Record";

  assert.doesNotThrow(() => prepareOpenApi(source, SOURCE_SHA256));

  source.paths["/v3/customers"].get.responses["200"].content[
    "application/json"
  ].schema.$ref = "#%2Fcomponents%2Fschemas%2FMissing";
  assert.throws(
    () => prepareOpenApi(source, SOURCE_SHA256),
    /dangling internal.*ref/i,
  );
});

test("rejects invalid JSON Pointer tilde escapes in internal refs", () => {
  const source = makeFixture();
  source.paths["/v3/customers"].get.responses["200"].content[
    "application/json"
  ].schema.$ref = "#/components/schemas/Customer~2Record";

  assert.throws(
    () => prepareOpenApi(source, SOURCE_SHA256),
    /invalid JSON pointer escape.*~2/i,
  );
});

test("buildCoverage returns sorted exact operation, webhook, and schema entries", () => {
  const { spec } = prepareOpenApi(makeFixture(), SOURCE_SHA256);
  const coverage = buildCoverage(spec);

  assert.deepEqual(
    coverage.operations.map(({ method, path, operationId, href }) => ({
      method,
      path,
      operationId,
      href,
    })),
    [
      {
        method: "get",
        path: "/v3/customers",
        operationId: "listCustomerProfiles",
        href: "/api-reference/customer-profiles/list-customer-profiles",
      },
      {
        method: "post",
        path: "/v3/customers/{customerId}/tasks",
        operationId: "createCustomerTaskSubmission",
        href: "/api-reference/task-submissions/create-customer-task-submission",
      },
    ],
  );
  assert.deepEqual(
    coverage.components.map((entry) => entry.name),
    ["Customer", "Error"],
  );
  assert.equal(coverage.webhooks.length, 2);
  for (const collection of Object.values(coverage)) {
    for (const entry of collection) assert.match(entry.hash, /^[a-f0-9]{64}$/);
  }
});

test("buildCoverage uses locale-independent lexical sorting", () => {
  const { spec } = prepareOpenApi(makeFixture(), SOURCE_SHA256);
  spec.components.schemas = {
    alpha: { type: "string" },
    Zed: { type: "string" },
  };

  assert.deepEqual(
    buildCoverage(spec).components.map((entry) => entry.name),
    ["Zed", "alpha"],
  );
});

test("compareCoverage names the changed canonical collection", () => {
  const coverage = buildCoverage(
    prepareOpenApi(makeFixture(), SOURCE_SHA256).spec,
  );

  for (const collection of ["operations", "webhooks", "components"]) {
    const changed = structuredClone(coverage);
    changed[collection][0].hash = "0".repeat(64);
    assert.throws(
      () => compareCoverage(coverage, changed),
      new RegExp(`${collection} coverage changed`, "i"),
    );
  }

  const missingOperations = structuredClone(coverage);
  delete missingOperations.operations;
  assert.throws(
    () => compareCoverage(coverage, missingOperations),
    /operations coverage changed/i,
  );
});

test("compareSourceToPrepared enforces exact retained semantics", () => {
  const source = makeFixture();
  const { spec, transformations } = prepareOpenApi(source, SOURCE_SHA256);

  assert.doesNotThrow(() =>
    compareSourceToPrepared(source, spec, transformations),
  );

  const cases = [
    {
      message: /path-method-operationId set changed/i,
      mutate(value) {
        value.paths["/v3/customers"].get.operationId = "renamedOperation";
      },
    },
    {
      message: /servers changed/i,
      mutate(value) {
        value.servers[0].url = "https://other.example.com";
      },
    },
    {
      message: /parameters changed/i,
      mutate(value) {
        value.paths["/v3/customers"].parameters[0].name = "X-Other";
      },
    },
    {
      message: /response codes changed/i,
      mutate(value) {
        delete value.paths["/v3/customers"].get.responses["400"];
      },
    },
    {
      message: /component schema names changed/i,
      mutate(value) {
        delete value.components.schemas.Error;
      },
    },
    {
      message: /internal refs changed/i,
      mutate(value) {
        value.paths["/v3/customers"].get.responses["200"].content[
          "application/json"
        ].schema.$ref = "#/components/schemas/Error";
      },
    },
    {
      message: /outside recorded transformation pointers/i,
      mutate(value) {
        value.paths["/v3/customers"].get.summary = "Unexpected rewrite";
      },
    },
  ];

  for (const { message, mutate } of cases) {
    const changed = structuredClone(spec);
    mutate(changed);
    assert.throws(
      () => compareSourceToPrepared(source, changed, transformations),
      message,
    );
  }
});

test("compareSourceToPrepared rejects unexpected transformation pointers", () => {
  const source = makeFixture();
  const { spec, transformations } = prepareOpenApi(source, SOURCE_SHA256);
  const unexpected = [
    ...transformations,
    {
      pointer: "/info/title",
      reason: "Unexpected rewrite",
      beforeHash: canonicalHash(source.info.title),
      afterHash: canonicalHash(spec.info.title),
    },
  ];

  assert.throws(
    () => compareSourceToPrepared(source, spec, unexpected),
    /unexpected transformation pointer/i,
  );
});

test("verification rejects a mutated OpenAPI artifact with an updated self-hash", () => {
  const directory = mkdtempSync(join(tmpdir(), "swipelux-openapi-tamper-"));

  try {
    copyTrackedArtifacts(directory);
    const openApiPath = join(directory, "openapi.json");
    const provenancePath = join(directory, "openapi-provenance.json");
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8"));
    const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));

    openApi.info.description = "Self-attested mutation";
    const openApiText = `${JSON.stringify(openApi, null, 2)}\n`;
    provenance.output.sha256 = byteHash(openApiText);
    writeFileSync(openApiPath, openApiText);
    writeFileSync(
      provenancePath,
      `${JSON.stringify(provenance, null, 2)}\n`,
    );

    const verifyResult = spawnSync(
      process.execPath,
      [join(projectRoot, "scripts/verify-openapi.mjs")],
      { cwd: directory, encoding: "utf8" },
    );
    assert.notEqual(verifyResult.status, 0, verifyResult.stdout);
    assert.match(verifyResult.stderr, /trusted OpenAPI output SHA-256/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("verification rejects self-attested transformation metadata", () => {
  const directory = mkdtempSync(join(tmpdir(), "swipelux-openapi-transform-"));

  try {
    copyTrackedArtifacts(directory);
    const provenancePath = join(directory, "openapi-provenance.json");
    const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
    provenance.transformations[0].beforeHash = "0".repeat(64);
    provenance.transformationsSha256 = canonicalHash(
      provenance.transformations,
    );
    writeFileSync(
      provenancePath,
      `${JSON.stringify(provenance, null, 2)}\n`,
    );

    const verifyResult = spawnSync(
      process.execPath,
      [join(projectRoot, "scripts/verify-openapi.mjs")],
      { cwd: directory, encoding: "utf8" },
    );
    assert.notEqual(verifyResult.status, 0, verifyResult.stdout);
    assert.match(verifyResult.stderr, /trusted transformation digest/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("verification rejects an untrusted coverage artifact encoding", () => {
  const directory = mkdtempSync(join(tmpdir(), "swipelux-openapi-coverage-"));

  try {
    copyTrackedArtifacts(directory);
    const coveragePath = join(directory, "openapi-coverage.json");
    const provenancePath = join(directory, "openapi-provenance.json");
    const coverage = JSON.parse(readFileSync(coveragePath, "utf8"));
    const coverageText = `${JSON.stringify(coverage)}\n`;
    const provenance = JSON.parse(readFileSync(provenancePath, "utf8"));
    provenance.coverage.sha256 = byteHash(coverageText);
    writeFileSync(coveragePath, coverageText);
    writeFileSync(
      provenancePath,
      `${JSON.stringify(provenance, null, 2)}\n`,
    );

    const verifyResult = spawnSync(
      process.execPath,
      [join(projectRoot, "scripts/verify-openapi.mjs")],
      { cwd: directory, encoding: "utf8" },
    );
    assert.notEqual(verifyResult.status, 0, verifyResult.stdout);
    assert.match(verifyResult.stderr, /trusted coverage SHA-256/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("prepares, verifies, and replays deterministic fixture artifacts", async () => {
  const { prepareOpenApiArtifacts, verifyOpenApiArtifacts } = await import(
    "../scripts/lib/openapi-artifacts.mjs"
  );
  const directory = mkdtempSync(join(tmpdir(), "swipelux-openapi-e2e-"));

  try {
    const sourcePath = writeFixtureSource(directory);
    const firstOutput = join(directory, "first");
    const secondOutput = join(directory, "second");
    mkdirSync(firstOutput);
    mkdirSync(secondOutput);

    const first = prepareOpenApiArtifacts(
      fixtureArtifactOptions(sourcePath, firstOutput),
    );
    const second = prepareOpenApiArtifacts(
      fixtureArtifactOptions(sourcePath, secondOutput),
    );
    assert.deepEqual(first.counts, fixtureExpectations.counts);
    assert.deepEqual(second.counts, fixtureExpectations.counts);

    const verified = verifyOpenApiArtifacts({
      ...fixtureArtifactOptions(sourcePath, firstOutput),
      directory: firstOutput,
      sourcePath,
      expectedGeneratedAt: fixtureExpectations.generatedAt,
    });
    assert.deepEqual(verified.counts, fixtureExpectations.counts);

    for (const name of artifactNames) {
      assert.deepEqual(
        readFileSync(join(firstOutput, name)),
        readFileSync(join(secondOutput, name)),
        `${name} must regenerate byte-identically`,
      );
    }

    const provenanceText = readFileSync(
      join(firstOutput, "openapi-provenance.json"),
      "utf8",
    );
    const provenance = JSON.parse(provenanceText);
    assert.equal(provenance.generatedAt, fixtureExpectations.generatedAt);
    assert.equal(provenance.source.basename, basename(sourcePath));
    assert.equal(provenanceText.includes(sourcePath), false);

    writeFileSync(
      sourcePath,
      `${readFileSync(sourcePath, "utf8")} `,
    );
    assert.throws(
      () =>
        verifyOpenApiArtifacts({
          ...fixtureArtifactOptions(sourcePath, firstOutput),
          directory: firstOutput,
          sourcePath,
          expectedGeneratedAt: fixtureExpectations.generatedAt,
        }),
      /source SHA-256 mismatch/i,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("artifact preparation requires an explicit whole-second timestamp", async () => {
  const { prepareOpenApiArtifacts } = await import(
    "../scripts/lib/openapi-artifacts.mjs"
  );
  const directory = mkdtempSync(join(tmpdir(), "swipelux-openapi-time-"));

  try {
    const sourcePath = writeFixtureSource(directory);
    const outputDirectory = join(directory, "artifacts");
    const options = fixtureArtifactOptions(sourcePath, outputDirectory);

    assert.throws(
      () =>
        prepareOpenApiArtifacts({
          ...options,
          deterministicTimestamp: undefined,
        }),
      /whole-second ISO-8601 timestamp/i,
    );
    assert.throws(
      () =>
        prepareOpenApiArtifacts({
          ...options,
          deterministicTimestamp: "2026-08-05T00:00:00.123Z",
        }),
      /whole-second ISO-8601 timestamp/i,
    );
    assert.equal(existsSync(outputDirectory), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("production preparation CLI rejects a wrong-hash fixture", () => {
  const directory = mkdtempSync(join(tmpdir(), "swipelux-openapi-cli-"));

  try {
    const sourcePath = writeFixtureSource(directory);
    const prepareResult = spawnSync(
      process.execPath,
      [join(projectRoot, "scripts/prepare-openapi.mjs"), sourcePath],
      { cwd: directory, encoding: "utf8" },
    );
    assert.notEqual(prepareResult.status, 0, prepareResult.stdout);
    assert.match(prepareResult.stderr, /source SHA-256 mismatch/i);
    for (const name of artifactNames) {
      assert.equal(existsSync(join(directory, name)), false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("mid-install failure rolls back the complete tracked artifact set", async () => {
  const { prepareOpenApiArtifacts } = await import(
    "../scripts/lib/openapi-artifacts.mjs"
  );
  const directory = mkdtempSync(join(tmpdir(), "swipelux-openapi-rollback-"));

  try {
    const sourcePath = writeFixtureSource(directory);
    const outputDirectory = join(directory, "artifacts");
    mkdirSync(outputDirectory);
    copyTrackedArtifacts(outputDirectory);
    const original = Object.fromEntries(
      artifactNames.map((name) => [
        name,
        readFileSync(join(outputDirectory, name)),
      ]),
    );
    let injected = false;

    assert.throws(
      () =>
        prepareOpenApiArtifacts({
          ...fixtureArtifactOptions(sourcePath, outputDirectory),
          installFile(stagedPath, destinationPath) {
            if (
              !injected &&
              basename(destinationPath) === "openapi-coverage.json"
            ) {
              injected = true;
              throw new Error("injected mid-install failure");
            }
            renameSync(stagedPath, destinationPath);
          },
        }),
      /injected mid-install failure/i,
    );
    assert.equal(injected, true);

    for (const name of artifactNames) {
      assert.deepEqual(readFileSync(join(outputDirectory, name)), original[name]);
    }

    const verifyResult = spawnSync(
      process.execPath,
      [join(projectRoot, "scripts/verify-openapi.mjs")],
      { cwd: outputDirectory, encoding: "utf8" },
    );
    assert.equal(verifyResult.status, 0, verifyResult.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
