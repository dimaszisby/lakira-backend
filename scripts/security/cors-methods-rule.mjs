// Rule CFG-CORS-001 of the security delta (#260): with PATCH routes mounted, the CORS
// allow-methods list must include PATCH. Pure, so a unit test can run it on any input;
// security-delta-check.mjs reads the files.
//
// A text with no `methods: [...]` list at all is "no-methods-list", never a list without
// PATCH. The rule once read src/server.ts after ADR-0061 moved the CORS options out of it,
// and reported a missing PATCH on every run while it could see nothing.

const METHODS_LIST = /methods\s*:\s*\[(.*?)\]/s;
const PATCH_METHOD = /"PATCH"|'PATCH'/;
const PATCH_ROUTE = /\.patch\(/;

/**
 * @param {{ pipelineText: string, routerTexts: { path: string, text: string }[] }} input
 * @returns {{ status: "pass" | "missing-patch" | "no-methods-list", patchRouteFiles: string[] }}
 */
export const evaluateCorsMethodsRule = ({ pipelineText, routerTexts }) => {
  const patchRouteFiles = routerTexts
    .filter(({ text }) => PATCH_ROUTE.test(text))
    .map(({ path }) => path);

  const methods = pipelineText.match(METHODS_LIST);
  if (!methods) {
    return { status: "no-methods-list", patchRouteFiles };
  }
  if (patchRouteFiles.length > 0 && !PATCH_METHOD.test(methods[1])) {
    return { status: "missing-patch", patchRouteFiles };
  }
  return { status: "pass", patchRouteFiles };
};
