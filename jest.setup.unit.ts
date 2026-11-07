import { jest } from "@jest/globals";
import { setImmediate } from "timers";
import { withTestEnv } from "./__tests__/helpers/env-test-utils.js";

global.setImmediate = setImmediate;
jest.setTimeout(10000);

beforeEach(async () => {
  await withTestEnv(async () => undefined);
});
