import Redis from "ioredis";

import type { AbacusEvent } from "@wford26/event-contracts";

export type InvoicingEventPublisher = {
  publish(event: AbacusEvent): Promise<void>;
};

function getStreamKey(eventType: AbacusEvent["eventType"]) {
  return `abacus:${eventType}`;
}

export function createNoopInvoicingEventPublisher(): InvoicingEventPublisher {
  return {
    async publish() {
      // No-op for tests or local environments without Redis.
    },
  };
}

export function createRedisInvoicingEventPublisher(redisUrl: string): InvoicingEventPublisher {
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
  });

  async function ensureConnection() {
    if (redis.status === "wait") {
      await redis.connect();
    }
  }

  return {
    async publish(event) {
      await ensureConnection();
      await redis.xadd(getStreamKey(event.eventType), "*", "event", JSON.stringify(event));
    },
  };
}
