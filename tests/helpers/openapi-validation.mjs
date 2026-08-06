import assert from "node:assert/strict";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const OPENAPI_SCHEMA_ID = "https://docs.swipelux.test/openapi.json";

function escapeJsonPointer(value) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function decodeJsonPointer(value) {
  return value.replaceAll("~1", "/").replaceAll("~0", "~");
}

function resolveReference(document, value) {
  let resolved = value;
  const visited = new Set();

  while (resolved?.$ref) {
    const reference = resolved.$ref;
    assert.match(reference, /^#\//, `Unsupported OpenAPI reference ${reference}`);
    assert.ok(!visited.has(reference), `Circular OpenAPI reference ${reference}`);
    visited.add(reference);
    resolved = reference
      .slice(2)
      .split("/")
      .map(decodeJsonPointer)
      .reduce((current, segment) => current?.[segment], document);
    assert.ok(resolved, `Missing OpenAPI reference ${reference}`);
  }

  return resolved;
}

function referencePointer(reference) {
  assert.match(reference, /^#\//, `Unsupported OpenAPI reference ${reference}`);
  return reference.slice(1);
}

function operationPointer(method, path) {
  return `/paths/${escapeJsonPointer(path)}/${method.toLowerCase()}`;
}

function validationResult(validate, value) {
  const valid = validate(value);
  return {
    valid,
    errors: valid ? [] : structuredClone(validate.errors ?? []),
  };
}

export function createOpenApiValidator(openapi) {
  const document = structuredClone(openapi);
  assert.match(document.openapi ?? "", /^3\.1\./, "Expected an OpenAPI 3.1 document");
  document.$id = OPENAPI_SCHEMA_ID;
  document.$schema = "https://json-schema.org/draft/2020-12/schema";

  const ajv = new Ajv2020({
    allErrors: true,
    logger: false,
    strict: false,
    validateFormats: true,
  });
  addFormats(ajv);
  ajv.addFormat("binary", true);
  ajv.addSchema(document);

  const validators = new Map();

  function operation(method, path) {
    const normalizedMethod = method.toLowerCase();
    const pathItem = document.paths?.[path];
    assert.ok(pathItem, `Missing OpenAPI path ${path}`);
    const operationObject = pathItem[normalizedMethod];
    assert.ok(
      operationObject,
      `Missing OpenAPI operation ${normalizedMethod.toUpperCase()} ${path}`,
    );
    return { normalizedMethod, operationObject, pathItem };
  }

  function compile(pointer) {
    if (!validators.has(pointer)) {
      validators.set(pointer, ajv.compile({ $ref: `${OPENAPI_SCHEMA_ID}#${pointer}` }));
    }
    return validators.get(pointer);
  }

  function requestBodyPointer(method, path, mediaType) {
    const { normalizedMethod, operationObject } = operation(method, path);
    assert.ok(
      operationObject.requestBody,
      `Missing request body for ${normalizedMethod.toUpperCase()} ${path}`,
    );
    const body = resolveReference(document, operationObject.requestBody);
    assert.ok(
      body.content?.[mediaType]?.schema,
      `Missing ${mediaType} request schema for ${normalizedMethod.toUpperCase()} ${path}`,
    );
    const bodyPointer = operationObject.requestBody.$ref
      ? referencePointer(operationObject.requestBody.$ref)
      : `${operationPointer(normalizedMethod, path)}/requestBody`;
    return `${bodyPointer}/content/${escapeJsonPointer(mediaType)}/schema`;
  }

  function parameterEntry(method, path, location, name) {
    const { normalizedMethod, operationObject, pathItem } = operation(method, path);
    const groups = [
      {
        parameters: pathItem.parameters ?? [],
        pointer: `/paths/${escapeJsonPointer(path)}/parameters`,
      },
      {
        parameters: operationObject.parameters ?? [],
        pointer: `${operationPointer(normalizedMethod, path)}/parameters`,
      },
    ];

    for (const group of groups) {
      for (const [index, rawParameter] of group.parameters.entries()) {
        const parameter = resolveReference(document, rawParameter);
        if (parameter?.in !== location || parameter?.name !== name) continue;
        assert.ok(
          parameter.schema,
          `${normalizedMethod.toUpperCase()} ${path} ${location} parameter ${name} has no schema`,
        );
        const pointer = rawParameter.$ref
          ? `${referencePointer(rawParameter.$ref)}/schema`
          : `${group.pointer}/${index}/schema`;
        return { parameter, pointer };
      }
    }

    return undefined;
  }

  function parameters(method, path) {
    const { operationObject, pathItem } = operation(method, path);
    return [...(pathItem.parameters ?? []), ...(operationObject.parameters ?? [])].map(
      (parameter) => resolveReference(document, parameter),
    );
  }

  return Object.freeze({
    requiredParameterNames(method, path, location) {
      return parameters(method, path)
        .filter((parameter) => parameter.in === location && parameter.required === true)
        .map((parameter) => parameter.name);
    },

    validateParameter(method, path, location, name, value) {
      const entry = parameterEntry(method, path, location, name);
      assert.ok(
        entry,
        `Missing ${location} parameter ${name} for ${method.toUpperCase()} ${path}`,
      );
      return validationResult(compile(entry.pointer), value);
    },

    validateRequestBody(method, path, value, mediaType = "application/json") {
      return validationResult(
        compile(requestBodyPointer(method, path, mediaType)),
        value,
      );
    },
  });
}
