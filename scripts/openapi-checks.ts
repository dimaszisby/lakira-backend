/**
 * The structural checks `docs:openapi:validate` runs (api-tooling-residuals D-07).
 * See `validate-openapi.ts` for why a diff alone is not enough.
 */

type Json = unknown;

/** Every `$ref` string in the document, with a path to where it was found. */
const collectRefs = (node: Json, at: string, out: [string, string][]): void => {
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectRefs(item, `${at}[${i}]`, out));
    return;
  }
  if (node === null || typeof node !== "object") return;

  for (const [key, value] of Object.entries(node as Record<string, Json>)) {
    if (key === "$ref" && typeof value === "string") {
      out.push([value, at]);
      continue;
    }
    collectRefs(value, `${at}/${key}`, out);
  }
};

/** Walks a `#/a/b/c` pointer through the document. Returns undefined if absent. */
const resolvePointer = (doc: Json, ref: string): Json | undefined => {
  const segments = ref
    .slice(2)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));

  let cursor: Json = doc;
  for (const segment of segments) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, Json>)[segment];
    if (cursor === undefined) return undefined;
  }
  return cursor;
};

export type OpenApiCheckResult = {
  problems: string[];
  operationCount: number;
  refCount: number;
  schemaCount: number;
};

/**
 * Every structural check, on a parsed document. `validate-openapi.ts` reads the spec
 * and calls this; a unit test hands it a document that trips each check, since a
 * check nothing exercises can stop firing unnoticed (api-tooling-residuals D-07).
 */
export const validateOpenApiDocument = (
  doc: Record<string, Json>,
): OpenApiCheckResult => {
  const problems: string[] = [];

  // 1. Every $ref resolves, and none point outside this single-file document.
  const refs: [string, string][] = [];
  collectRefs(doc, "", refs);

  for (const [ref, at] of refs) {
    if (!ref.startsWith("#/")) {
      problems.push(
        `external $ref "${ref}" at ${at} — the spec must be self-contained`,
      );
      continue;
    }
    if (resolvePointer(doc, ref) === undefined) {
      problems.push(`dangling $ref "${ref}" at ${at}`);
    }
  }

  // 2. An operation id is optional — the generator writes none today — and unique
  //    when present, since a type generator that keys on ids would merge two
  //    operations sharing one (audit W7: the check could not fire on this spec, so a
  //    unit test proves it does).
  const paths = (doc.paths ?? {}) as Record<string, Record<string, Json>>;
  const seen = new Map<string, string>();
  let operationCount = 0;

  for (const [route, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (operation === null || typeof operation !== "object") continue;
      operationCount += 1;

      const op = operation as Record<string, Json>;

      // 3. An operation with no responses generates unusable client types.
      const responses = op.responses as Record<string, Json> | undefined;
      if (!responses || Object.keys(responses).length === 0) {
        problems.push(`${method.toUpperCase()} ${route} declares no responses`);
      }

      // 5. The app-wide limiter sits in front of every router, so every operation
      //    can answer 429. The generator adds the shared response; 40 of 47
      //    operations had none while each author was left to write it
      //    (SaaS-readiness caveat C3, audit-2026-10-10 V5). The Health probes run
      //    ahead of the limiter and are exempt (openapi-contract-polish D-01).
      const tags = Array.isArray(op.tags) ? op.tags : [];
      if (responses && !responses["429"] && !tags.includes("Health")) {
        problems.push(
          `${method.toUpperCase()} ${route} documents no 429 — the app-wide limiter can answer it on any operation`,
        );
      }

      // 6. express.json reads the body of every operation that has one, and can
      //    answer 413 and 415. The generator adds both (openapi-contract-polish
      //    D-03).
      if (responses && op.requestBody) {
        for (const status of ["413", "415"]) {
          if (!responses[status]) {
            problems.push(
              `${method.toUpperCase()} ${route} takes a body and documents no ${status} — the body parser can answer it`,
            );
          }
        }
      }

      const id = op.operationId;
      if (typeof id !== "string") continue;
      const previous = seen.get(id);
      if (previous) {
        problems.push(
          `duplicate operationId "${id}" on ${method.toUpperCase()} ${route} and ${previous}`,
        );
      } else {
        seen.set(id, `${method.toUpperCase()} ${route}`);
      }
    }
  }

  // 4. Every component schema must be reachable by $ref. An orphan is dead
  //    weight that downstream generators still turn into an exported type — and
  //    a plausible-looking one, which is worse than none. Seven had accumulated
  //    before this check existed, two of them error envelopes that had drifted
  //    from the real response shape.
  //
  //    This is exact rather than allowlisted because query-parameter schemas are
  //    no longer registered: `zod-to-openapi` inlines them into each operation
  //    either way, so registering them only ever added an unreferenced entry
  //    here. If a new orphan appears, it is genuinely unreachable.
  const schemas = ((doc.components ?? {}) as Record<string, Json>).schemas as
    | Record<string, Json>
    | undefined;

  if (schemas) {
    const referenced = new Set(refs.map(([ref]) => ref));
    for (const name of Object.keys(schemas)) {
      if (!referenced.has(`#/components/schemas/${name}`)) {
        problems.push(
          `unreferenced schema "${name}" — delete it, or $ref it from an operation`,
        );
      }
    }
  }

  // 7. A document with no operations describes no API; a generator would emit an
  //    empty client and every check above would pass vacuously (audit W7).
  if (operationCount === 0) {
    problems.push("the spec declares no operations");
  }

  return {
    problems,
    operationCount,
    refCount: refs.length,
    schemaCount: Object.keys(schemas ?? {}).length,
  };
};
