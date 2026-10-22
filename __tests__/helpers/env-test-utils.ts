import { loadEnvOrExit, resetEnvCacheForTesting } from "@/config/envManager.js";

type EnvOverrides = Partial<Record<string, string | undefined>>;

type WithTestEnvOptions = {
  overrides?: EnvOverrides;
  skipDbLifecycle?: boolean;
};

export async function withTestEnv<T>(
  fn: () => Promise<T> | T,
  options: WithTestEnvOptions = {},
): Promise<T> {
  const previousValues: Record<string, string | undefined> = {};
  const { overrides = {}, skipDbLifecycle = true } = options;

  if (skipDbLifecycle) {
    previousValues.SKIP_DB_LIFECYCLE = process.env.SKIP_DB_LIFECYCLE;
    process.env.SKIP_DB_LIFECYCLE = "true";
  }

  for (const [key, value] of Object.entries(overrides) as Array<
    [string, string | undefined]
  >) {
    previousValues[key] = process.env[key];
    // Assigning undefined to process.env stores the string "undefined".
    if (typeof value === "undefined") {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    resetEnvCacheForTesting();
    loadEnvOrExit();
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previousValues)) {
      if (typeof value === "undefined") {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetEnvCacheForTesting();
    loadEnvOrExit();
  }
}
