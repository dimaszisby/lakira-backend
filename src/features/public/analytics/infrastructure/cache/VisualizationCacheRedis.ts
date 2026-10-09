import { redisClient } from "@/utils/redis-client.js";
import { env } from "@/config/envManager.js";
import { readCachedJson } from "@/shared/cache/read.js";
import crypto from "node:crypto";
import {
  VisualizationCachePort,
  SingleVizCacheKey,
  DashboardVizCacheKey,
} from "../../application/ports/VisualizationCachePort.js";
import type { VizResponse } from "../../domain/types.js";
import type { DashboardVizResponse } from "../../application/ports/VisualizationReadRepository.js";

const TTL = env.VIZ_DEFAULT_TTL_SEC;

export class VisualizationCacheRedis implements VisualizationCachePort {
  async getSingleVisualization(
    params: SingleVizCacheKey,
  ): Promise<VizResponse | null> {
    if (!redisClient.isOpen) return null;
    const key = vizKey(params);
    const json = await redisClient.get(key);
    if (!json) return null;
    const cached = readCachedJson(json, key);
    return cached.ok ? (cached.value as VizResponse) : null;
  }

  async setSingleVisualization(
    params: SingleVizCacheKey,
    value: VizResponse,
  ): Promise<void> {
    if (!redisClient.isOpen) return;
    const key = vizKey(params);
    await redisClient.set(key, JSON.stringify(value), { EX: TTL });
  }

  async getDashboardVisualization(
    params: DashboardVizCacheKey,
  ): Promise<DashboardVizResponse | null> {
    if (!redisClient.isOpen) return null;
    const key = vizDashKey(params);
    const json = await redisClient.get(key);
    if (!json) return null;
    const cached = readCachedJson(json, key);
    return cached.ok ? (cached.value as DashboardVizResponse) : null;
  }

  async setDashboardVisualization(
    params: DashboardVizCacheKey,
    value: DashboardVizResponse,
  ): Promise<void> {
    if (!redisClient.isOpen) return;
    const key = vizDashKey(params);
    await redisClient.set(key, JSON.stringify(value), { EX: TTL });
  }
}

// organizationId is a mandatory segment in both the visible prefix and the hashed
// raw string — see ADR-0035. Cache keys are a tenant boundary that must be enforced
// independently of the repository layer's WHERE clauses.
function vizKey(input: SingleVizCacheKey) {
  const raw = `${input.organizationId}|${input.userId}|${input.metricId}|${input.bucketIso}|${input.startISO}|${input.endISO}|${input.tz}|${input.fill}`;
  const hash = crypto
    .createHash("sha1")
    .update(raw)
    .digest("base64url")
    .slice(0, 16);
  return `viz:${input.organizationId}:${input.userId}:${input.metricId}:${input.bucketIso}:${hash}`;
}

function vizDashKey(input: DashboardVizCacheKey) {
  const raw = `${input.organizationId}|${input.userId}|${input.metricIds.join(",")}|${input.bucketIso}|${input.startISO}|${input.endISO}|${input.tz}|${input.fill}|${input.versionCursor ?? ""}`;
  const hash = crypto
    .createHash("sha1")
    .update(raw)
    .digest("base64url")
    .slice(0, 16);
  return `vizdash:${input.organizationId}:${input.userId}:${input.bucketIso}:${hash}`;
}
