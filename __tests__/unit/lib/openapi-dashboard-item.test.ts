import { describe, it, expect } from "@jest/globals";
import { getOpenApiDocumentation } from "@/lib/openapi/openapi-docs.js";

// Kit analytics-leftovers, D-01 (register row B-65): the spec's analytics responses
// list every field the repository sends, with the nullability it sends them with.
type Schema = {
  type?: string | string[];
  enum?: unknown[];
  format?: string;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  $ref?: string;
};

const schemas = () =>
  (getOpenApiDocumentation().components?.schemas ?? {}) as unknown as Record<
    string,
    Schema
  >;

const resolve = (schema: Schema): Schema => {
  if (!schema.$ref) return schema;
  return schemas()[schema.$ref.replace("#/components/schemas/", "")];
};

// OpenAPI 3.1: a nullable field's type is an array holding "null".
const isNullable = (schema: Schema) =>
  Array.isArray(schema.type) && schema.type.includes("null");

const dashboard = () => schemas().DashboardVisualizationResponse;
const item = () => resolve(dashboard().properties!.items.items!);

describe("the dashboard response in the spec", () => {
  it.each([
    ["lastLogAt", true],
    ["firstLogAt", true],
    ["totalLogs", false],
    ["latestValue", true],
    ["latestBucketStart", true],
    ["requestedRange", false],
    ["actualRange", false],
    ["fallbackRangeUsed", false],
    ["fallbackStrategy", true],
  ])("lists the item's %s, nullable: %p", (field, nullable) => {
    const property = item().properties?.[field];
    expect(property).toBeDefined();
    expect(item().required).toContain(field);
    expect(isNullable(resolve(property!))).toBe(nullable);
  });

  it("gives both ranges a start, an end and the bucket enum", () => {
    for (const field of ["requestedRange", "actualRange"]) {
      const range = resolve(item().properties![field]);
      expect(range.required).toEqual(
        expect.arrayContaining(["startISO", "endISO", "bucket"]),
      );
      expect(range.properties!.bucket.enum).toEqual([
        "1h",
        "1d",
        "1w",
        "1m",
        "1y",
      ]);
    }
  });

  it("names the one fallback strategy, or null", () => {
    expect(item().properties!.fallbackStrategy.enum).toEqual([
      "last_activity_window",
      null,
    ]);
  });

  it("lists meta's totalMetrics and fallbackMetrics, and sync's etagSeed", () => {
    const { meta, sync } = dashboard().properties!;
    expect(resolve(meta).required).toEqual(
      expect.arrayContaining(["totalMetrics", "fallbackMetrics"]),
    );
    expect(resolve(sync).required).toEqual(["etagSeed"]);
    expect(dashboard().required).toEqual(
      expect.arrayContaining(["items", "meta", "sync"]),
    );
  });

  it("lists the single-metric response's metricId and meta.fill", () => {
    const single = schemas().VisualizationResponse;
    expect(single.required).toContain("metricId");
    expect(resolve(single.properties!.meta).properties!.fill.enum).toEqual([
      "none",
      "zero",
      "nan",
    ]);
  });
});
