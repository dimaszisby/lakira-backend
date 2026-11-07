import request from "supertest";
import app from "@/server.js";

export const api = request(app);

const uniqueSuffix = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const uniqueName = (prefix: string) => `${prefix}-${uniqueSuffix()}`;

const isoDate = (offsetDays = 0) => {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return date.toISOString().split("T")[0];
};

let logSequence = 0;
const nextLogTimestamp = () =>
  new Date(Date.now() + logSequence++ * 1000).toISOString();

export const buildUserPayload = (
  overrides: Partial<Record<string, any>> = {},
) => {
  const timestamp = uniqueSuffix();
  return {
    username: `testuser_${timestamp}`,
    email: `testuser_${timestamp}@example.com`,
    password: "Password123!",
    passwordConfirmation: "Password123!",
    age: 25,
    sex: "male",
    ...overrides,
  };
};

/**
 * `agent` is the app to register through: a test with an app of its own
 * (`appWith`) passes it, so the registration runs on the features it replaced.
 */
export const createTestUser = async (
  overrides: Partial<Record<string, any>> = {},
  agent: typeof api = api,
) => {
  const payload = buildUserPayload(overrides);
  const res = await agent.post("/api/v1/auth/register").send(payload);

  if (res.status !== 201) {
    throw new Error(
      `Failed to create test user: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }

  return {
    token: res.body.data.token as string,
    user: res.body.data.user,
    payload,
  };
};

export const authHeader = (token: string) => `Bearer ${token}`;

export const buildCategoryPayload = (
  overrides: Partial<Record<string, any>> = {},
) => ({
  name: overrides.name ?? uniqueName("Category"),
  color: "#E897A3",
  icon: "📁",
  ...overrides,
});

export const createCategory = async (
  token: string,
  overrides: Partial<Record<string, any>> = {},
) => {
  const payload = buildCategoryPayload(overrides);
  const res = await api
    .post("/api/v1/metric-categories")
    .set("Authorization", authHeader(token))
    .send(payload);

  if (res.status !== 201) {
    throw new Error(
      `Failed to create category: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }

  return { category: res.body.data, payload };
};

export const buildMetricPayload = (
  overrides: Partial<Record<string, any>> = {},
) => ({
  name: uniqueName("Metric"),
  defaultUnit: "units",
  isPublic: false,
  description: "Test metric",
  ...overrides,
});

export const createMetric = async (
  token: string,
  overrides: Partial<Record<string, any>> = {},
) => {
  const payload = buildMetricPayload(overrides);
  const res = await api
    .post("/api/v1/metrics")
    .set("Authorization", authHeader(token))
    .send(payload);

  if (res.status !== 201) {
    throw new Error(
      `Failed to create metric: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }

  return { metric: res.body.data, payload };
};

export const buildMetricSettingsPayload = (
  metricId: string,
  overrides: Partial<Record<string, any>> = {},
) => ({
  metricId,
  goalEnabled: true,
  goalType: "cumulative",
  goalValue: 10,
  timeFrameEnabled: true,
  startDate: isoDate(0),
  deadlineDate: isoDate(7),
  alertEnabled: true,
  alertThresholds: 80,
  displayOptions: {
    showOnDashboard: true,
    priority: 1,
    chartType: "line",
    color: "#E897A3",
  },
  ...overrides,
});

export const createMetricSettings = async (
  token: string,
  metricId: string,
  overrides: Partial<Record<string, any>> = {},
) => {
  const payload = buildMetricSettingsPayload(metricId, overrides);
  const res = await api
    .post("/api/v1/metric-settings")
    .set("Authorization", authHeader(token))
    .send(payload);

  if (res.status !== 201) {
    throw new Error(
      `Failed to create metric settings: ${res.status} ${JSON.stringify(
        res.body,
      )}`,
    );
  }

  return { settings: res.body.data, payload };
};

export const buildMetricLogPayload = (
  metricId: string,
  overrides: Partial<Record<string, any>> = {},
) => ({
  metricId,
  logValue: overrides.logValue ?? Number((Math.random() * 100 + 1).toFixed(2)),
  type: overrides.type ?? "manual",
  loggedAt: overrides.loggedAt ?? nextLogTimestamp(),
  ...overrides,
});

export const createMetricLog = async (
  token: string,
  metricId: string,
  overrides: Partial<Record<string, any>> = {},
) => {
  const payload = buildMetricLogPayload(metricId, overrides);
  const res = await api
    .post("/api/v1/metric-logs")
    .set("Authorization", authHeader(token))
    .send(payload);

  if (res.status !== 201) {
    throw new Error(
      `Failed to create metric log: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }

  return { log: res.body.data, payload };
};
