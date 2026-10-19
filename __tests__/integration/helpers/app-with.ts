import request from "supertest";
import { createApp } from "@/app.js";
import {
  buildWiredFeatures,
  type AppFeatures,
} from "@/composition/features.js";

/**
 * An app of the test's own: the features the server runs, with some replaced
 * (inject-features-into-routers D-05). A test that needs a different feature
 * builds one of these rather than changing the app every test shares, so nothing
 * it does outlives it, even when it fails half way.
 */
export const appWith = (overrides: Partial<AppFeatures>) =>
  request(createApp({ ...buildWiredFeatures(), ...overrides }));
