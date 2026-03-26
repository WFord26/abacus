import { randomUUID } from "node:crypto";

import Redis from "ioredis";

import type { ReportingEventProcessor, ReportingLogger } from "../services/event-processor";
import type { AbacusEvent } from "@wford26/event-contracts";

export const REPORTING_CONSUMER_GROUP = "reporting-service";
export const REPORTING_STREAM_KEYS = [
  "abacus:transaction.created",
  "abacus:transaction.updated",
  "abacus:expense.categorized",
  "abacus:account.reconciled",
  "abacus:invoice.paid",
] as const;

type RedisStreamFields = string[];
type RedisStreamEntry = [string, RedisStreamFields];
type RedisStreamResponse = Array<[string, RedisStreamEntry[]]> | null;

export type ReportingEventSubscriber = {
  start(): Promise<void>;
  stop(): Promise<void>;
};

export type RedisLike = {
  connect(): Promise<void>;
  disconnect(): void;
  quit(): Promise<unknown>;
  status: string;
  xack(stream: string, group: string, id: string): Promise<number>;
  xgroup(...args: string[]): Promise<unknown>;
  xreadgroup(...args: Array<number | string>): Promise<RedisStreamResponse>;
};

function createStreamKey(eventType: AbacusEvent["eventType"]) {
  return `abacus:${eventType}`;
}

function ensureConnected(redis: RedisLike) {
  if (redis.status === "wait") {
    return redis.connect();
  }

  return Promise.resolve();
}

export async function ensureConsumerGroups(redis: RedisLike) {
  for (const stream of REPORTING_STREAM_KEYS) {
    try {
      await redis.xgroup("CREATE", stream, REPORTING_CONSUMER_GROUP, "0", "MKSTREAM");
    } catch (error) {
      if (error instanceof Error && error.message.includes("BUSYGROUP")) {
        continue;
      }

      throw error;
    }
  }
}

function parseEvent(fields: RedisStreamFields) {
  const eventIndex = fields.findIndex((field) => field === "event");
  const payload = eventIndex === -1 ? undefined : fields[eventIndex + 1];

  if (!payload) {
    throw new Error("Stream entry does not include an event payload");
  }

  return JSON.parse(payload) as AbacusEvent;
}

export async function processStreamEntries(
  redis: RedisLike,
  entries: RedisStreamResponse,
  processor: ReportingEventProcessor,
  logger: ReportingLogger
) {
  if (!entries) {
    return;
  }

  for (const [stream, streamEntries] of entries) {
    for (const [id, fields] of streamEntries) {
      let eventId: string | undefined;

      try {
        const event = parseEvent(fields);
        eventId = event.eventId;
        await processor.process(event);
      } catch (error) {
        logger.error(
          {
            err: error,
            eventId,
            stream,
            streamEntryId: id,
          },
          "reporting subscriber failed to process stream entry"
        );
      } finally {
        await redis.xack(stream, REPORTING_CONSUMER_GROUP, id);
      }
    }
  }
}

export function createNoopReportingEventSubscriber(): ReportingEventSubscriber {
  return {
    async start() {
      // No-op in tests or local environments without Redis.
    },
    async stop() {
      // No-op.
    },
  };
}

export function createRedisReportingEventSubscriber(options: {
  adminRedis?: RedisLike;
  logger: ReportingLogger;
  processor: ReportingEventProcessor;
  readerRedis?: RedisLike;
  redisUrl: string;
}) {
  const adminRedis = (options.adminRedis ??
    new Redis(options.redisUrl, {
      lazyConnect: true,
    })) as RedisLike;
  const readerRedis = (options.readerRedis ??
    new Redis(options.redisUrl, {
      lazyConnect: true,
    })) as RedisLike;
  const consumerName = `reporting-${process.pid}-${randomUUID()}`;
  let loopPromise: Promise<void> | null = null;
  let running = false;

  async function consumeLoop() {
    while (running) {
      try {
        const entries = await readerRedis.xreadgroup(
          "GROUP",
          REPORTING_CONSUMER_GROUP,
          consumerName,
          "BLOCK",
          1000,
          "COUNT",
          10,
          "STREAMS",
          ...REPORTING_STREAM_KEYS,
          ...REPORTING_STREAM_KEYS.map(() => ">")
        );

        await processStreamEntries(readerRedis, entries, options.processor, options.logger);
      } catch (error) {
        if (!running) {
          break;
        }

        options.logger.error(
          {
            err: error,
          },
          "reporting subscriber loop failed"
        );
      }
    }
  }

  return {
    async start() {
      if (running) {
        return;
      }

      await ensureConnected(adminRedis);
      await ensureConnected(readerRedis);
      await ensureConsumerGroups(adminRedis);

      running = true;
      loopPromise = consumeLoop();
    },

    async stop() {
      running = false;

      await Promise.allSettled([readerRedis.quit(), adminRedis.quit()]);
      readerRedis.disconnect();
      adminRedis.disconnect();

      await loopPromise;
      loopPromise = null;
    },
  } satisfies ReportingEventSubscriber;
}

export { createStreamKey };
