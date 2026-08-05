import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
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

const cliSource = process.env.OPENAPI_SOURCE_PATH;
test(
  "preparation and verification CLIs generate valid artifacts in a temp directory",
  { skip: !cliSource },
  () => {
    assert.ok(existsSync(cliSource), `missing OPENAPI_SOURCE_PATH: ${cliSource}`);
    const directory = mkdtempSync(join(tmpdir(), "swipelux-openapi-"));

    try {
      const prepareResult = spawnSync(
        process.execPath,
        [join(projectRoot, "scripts/prepare-openapi.mjs"), cliSource],
        { cwd: directory, encoding: "utf8" },
      );
      assert.equal(prepareResult.status, 0, prepareResult.stderr);
      assert.equal(
        prepareResult.stdout.trim(),
        "Prepared OpenAPI: 49 paths, 74 operations, 87 schemas, 12 webhooks",
      );

      const verifyResult = spawnSync(
        process.execPath,
        [join(projectRoot, "scripts/verify-openapi.mjs")],
        { cwd: directory, encoding: "utf8" },
      );
      assert.equal(verifyResult.status, 0, verifyResult.stderr);
      assert.equal(
        verifyResult.stdout.trim(),
        "OpenAPI verification passed: 74 operations, 12 webhooks",
      );

      const provenanceText = readFileSync(
        join(directory, "openapi-provenance.json"),
        "utf8",
      );
      const provenance = JSON.parse(provenanceText);
      assert.equal(provenance.source.basename, basename(cliSource));
      assert.equal(provenanceText.includes(cliSource), false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
