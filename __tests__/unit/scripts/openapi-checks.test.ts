import { describe, it, expect } from "@jest/globals";
import { validateOpenApiDocument } from "../../../scripts/openapi-checks.js";

// Kit api-tooling-residuals, D-07 (audit W7). The checks ran only against the real
// spec, which trips none of them, so a check that stopped firing would go unseen: the
// duplicate-operationId check could not fire at all, as no operation has an id. Each
// case below breaks the valid document one way and finds that check's problem.
const ok = { description: "OK" };
const limited = { description: "Too many requests" };

// Loose on purpose: each case reaches into it to break one thing.
const validDocument = (): Record<string, any> => ({
  openapi: "3.1.0",
  paths: {
    "/things": {
      get: {
        tags: ["Things"],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Thing" },
              },
            },
          },
          "429": limited,
        },
      },
      post: {
        tags: ["Things"],
        requestBody: { content: { "application/json": { schema: {} } } },
        responses: {
          "201": ok,
          "413": ok,
          "415": ok,
          "429": limited,
        },
      },
    },
    "/health": { get: { tags: ["Health"], responses: { "200": ok } } },
  },
  components: { schemas: { Thing: { type: "object" } } },
});

type Doc = Record<string, any>;

const problemsOf = (mutate: (doc: Doc) => void) => {
  const doc = validDocument() as Doc;
  mutate(doc);
  return validateOpenApiDocument(doc).problems;
};

describe("validateOpenApiDocument", () => {
  it("passes a valid document, and counts what it read", () => {
    const result = validateOpenApiDocument(validDocument());
    expect(result.problems).toEqual([]);
    expect(result.operationCount).toBe(3);
    expect(result.refCount).toBe(1);
    expect(result.schemaCount).toBe(1);
  });

  it.each<[string, (doc: Doc) => void, RegExp]>([
    [
      "a dangling $ref",
      (doc) => {
        doc.paths["/things"].get.responses["200"].content[
          "application/json"
        ].schema.$ref = "#/components/schemas/Missing";
      },
      /dangling \$ref "#\/components\/schemas\/Missing"/,
    ],
    [
      "an external $ref",
      (doc) => {
        doc.paths["/things"].post.requestBody.content[
          "application/json"
        ].schema = { $ref: "other.json#/Thing" };
      },
      /external \$ref "other.json#\/Thing"/,
    ],
    [
      "a duplicate operationId",
      (doc) => {
        doc.paths["/things"].get.operationId = "things";
        doc.paths["/things"].post.operationId = "things";
      },
      /duplicate operationId "things"/,
    ],
    [
      "an operation with no responses",
      (doc) => {
        doc.paths["/things"].get.responses = {};
      },
      /GET \/things declares no responses/,
    ],
    [
      "an operation with no 429",
      (doc) => {
        delete doc.paths["/things"].get.responses["429"];
      },
      /GET \/things documents no 429/,
    ],
    [
      "a body with no 413",
      (doc) => {
        delete doc.paths["/things"].post.responses["413"];
      },
      /POST \/things takes a body and documents no 413/,
    ],
    [
      "a body with no 415",
      (doc) => {
        delete doc.paths["/things"].post.responses["415"];
      },
      /POST \/things takes a body and documents no 415/,
    ],
    [
      "an unreferenced schema",
      (doc) => {
        doc.components.schemas.Orphan = { type: "string" };
      },
      /unreferenced schema "Orphan"/,
    ],
    [
      "no operations",
      (doc) => {
        doc.paths = {};
        doc.components.schemas = {};
      },
      /declares no operations/,
    ],
  ])("refuses %s", (_name, mutate, expected) => {
    expect(problemsOf(mutate)).toContainEqual(expect.stringMatching(expected));
  });

  it("exempts the Health probes from the 429, as they run ahead of the limiter", () => {
    expect(
      problemsOf((doc) => {
        doc.paths["/health"].get.responses = { "200": ok };
      }),
    ).toEqual([]);
  });
});
