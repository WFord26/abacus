import Redis from "ioredis";

import type { DashboardSummary } from "@wford26/shared-types";

const DASHBOARD_CACHE_PREFIX = "reporting:dashboard:";

export type ReportingDashboardCache = {
  get(organizationId: string): Promise<DashboardSummary | null>;
  invalidate(organizationId: string): Promise<void>;
  set(organizationId: string, summary: DashboardSummary, ttlSeconds: number): Promise<void>;
};

export function createInMemoryReportingDashboardCache(): ReportingDashboardCache {
  const cache = new Map<
    string,
    {
      expiresAt: number;
      value: DashboardSummary;
    }
  >();

  return {
    async get(organizationId) {
      const entry = cache.get(organizationId);

      if (!entry) {
        return null;
      }

      if (Date.now() >= entry.expiresAt) {
        cache.delete(organizationId);
        return null;
      }

      return entry.value;
    },

    async invalidate(organizationId) {
      cache.delete(organizationId);
    },

    async set(organizationId, summary, ttlSeconds) {
      cache.set(organizationId, {
        expiresAt: Date.now() + ttlSeconds * 1000,
        value: summary,
      });
    },
  };
}

export function createRedisReportingDashboardCache(redisUrl: string): ReportingDashboardCache {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
  });

  async function ensureConnected() {
    if (redis.status === "wait") {
      await redis.connect();
    }
  }

  function createKey(organizationId: string) {
    return `${DASHBOARD_CACHE_PREFIX}${organizationId}`;
  }

  return {
    async get(organizationId) {
      await ensureConnected();
      const raw = await redis.get(createKey(organizationId));

      if (!raw) {
        return null;
      }

      return JSON.parse(raw) as DashboardSummary;
    },

    async invalidate(organizationId) {
      await ensureConnected();
      await redis.del(createKey(organizationId));
    },

    async set(organizationId, summary, ttlSeconds) {
      await ensureConnected();
      await redis.set(createKey(organizationId), JSON.stringify(summary), "EX", ttlSeconds);
    },
  };
}
