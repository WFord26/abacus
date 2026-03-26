import { afterEach, describe, expect, it, vi } from "vitest";

import {
  REPORTING_CONSUMER_GROUP,
  REPORTING_STREAM_KEYS,
  ensureConsumerGroups,
  processStreamEntries,
} from "../../src/lib/events";

import type { RedisLike } from "../../src/lib/events";
import type { ReportingEventProcessor } from "../../src/services/event-processor";

function createRedisStub(overrides: Partial<RedisLike> = {}): RedisLike {
  return {
    async connect() {
      return undefined;
    },
    disconnect() {
      return undefined;
    },
    async quit() {
      return "OK";
    },
    status: "ready",
    async xack() {
      return 1;
    },
    async xgroup() {
      return "OK";
    },
    async xreadgroup() {
      return null;
    },
    ...overrides,
  };
}

describe("reporting subscriber helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates the reporting consumer group for every stream", async () => {
    const xgroup = vi.fn<RedisLike["xgroup"]>().mockResolvedValue("OK");
    const redis = createRedisStub({
      xgroup,
    });

    await ensureConsumerGroups(redis);

    expect(xgroup).toHaveBeenCalledTimes(REPORTING_STREAM_KEYS.length);
    for (const stream of REPORTING_STREAM_KEYS) {
      expect(xgroup).toHaveBeenCalledWith(
        "CREATE",
        stream,
        REPORTING_CONSUMER_GROUP,
        "0",
        "MKSTREAM"
      );
    }
  });

  it("logs failures with the stream entry id and still acknowledges the event", async () => {
    const logger = {
      error: vi.fn(),
    };
    const xack = vi.fn<RedisLike["xack"]>().mockResolvedValue(1);
    const redis = createRedisStub({
      xack,
    });
    const processor: ReportingEventProcessor = {
      async process() {
        throw new Error("boom");
      },
    };

    await processStreamEntries(
      redis,
      [
        [
          "abacus:transaction.created",
          [
            [
              "1710000000000-0",
              [
                "event",
                JSON.stringify({
                  eventId: "evt-1",
                  eventType: "transaction.created",
                  occurredAt: "2026-03-25T00:00:00.000Z",
                  organizationId: "org-1",
                  payload: {},
                  userId: "user-1",
                  version: "1.0",
                }),
              ],
            ],
          ],
        ],
      ],
      processor,
      logger
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt-1",
        stream: "abacus:transaction.created",
        streamEntryId: "1710000000000-0",
      }),
      "reporting subscriber failed to process stream entry"
    );
    expect(xack).toHaveBeenCalledWith(
      "abacus:transaction.created",
      REPORTING_CONSUMER_GROUP,
      "1710000000000-0"
    );
  });
});
