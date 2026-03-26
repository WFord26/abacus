import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LEDGER_CONSUMER_GROUP,
  LEDGER_STREAM_KEYS,
  ensureConsumerGroups,
  processStreamEntries,
} from "../../src/lib/events";

import type { RedisLike } from "../../src/lib/events";
import type { LedgerEventProcessor } from "../../src/services/invoice-settlement.service";

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

describe("ledger subscriber helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates the ledger consumer group for every stream", async () => {
    const xgroup = vi.fn<RedisLike["xgroup"]>().mockResolvedValue("OK");
    const redis = createRedisStub({
      xgroup,
    });

    await ensureConsumerGroups(redis);

    expect(xgroup).toHaveBeenCalledTimes(LEDGER_STREAM_KEYS.length);
    for (const stream of LEDGER_STREAM_KEYS) {
      expect(xgroup).toHaveBeenCalledWith("CREATE", stream, LEDGER_CONSUMER_GROUP, "0", "MKSTREAM");
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
    const processor: LedgerEventProcessor = {
      async process() {
        throw new Error("boom");
      },
    };

    await processStreamEntries(
      redis,
      [
        [
          "abacus:invoice.paid",
          [
            [
              "1710000000000-0",
              [
                "event",
                JSON.stringify({
                  eventId: "evt-1",
                  eventType: "invoice.paid",
                  occurredAt: "2026-03-26T00:00:00.000Z",
                  organizationId: "org-1",
                  payload: {
                    amount: 1200,
                    customerId: "customer-1",
                    invoiceId: "invoice-1",
                    paidAt: "2026-03-26T00:00:00.000Z",
                  },
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
        stream: "abacus:invoice.paid",
        streamEntryId: "1710000000000-0",
      }),
      "ledger subscriber failed to process stream entry"
    );
    expect(xack).toHaveBeenCalledWith(
      "abacus:invoice.paid",
      LEDGER_CONSUMER_GROUP,
      "1710000000000-0"
    );
  });
});
