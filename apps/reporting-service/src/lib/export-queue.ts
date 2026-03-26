import { Queue, Worker } from "bullmq";
import Redis from "ioredis";

import { ReportingServiceError } from "./errors";

import type { ReportingExportStorage } from "./storage";
import type { ReportingLogger } from "../services/event-processor";
import type { ReportExportJobResponse, ReportExportJobStartResponse } from "@wford26/shared-types";

const REPORT_EXPORT_QUEUE_NAME = "reporting-csv-exports";
const EXPORT_JOB_TIMEOUT_MS = 60_000;

type BullMqJobData = {
  organizationId: string;
  userId: string;
};

type BullMqJobResult = {
  filename: string;
  key: string;
};

type JobProcessorInput = BullMqJobData & {
  jobId: string;
};

export type ReportingExportJobQueue = {
  enqueueCsvExport(input: BullMqJobData): Promise<ReportExportJobStartResponse>;
  getCsvExportJob(jobId: string, organizationId: string): Promise<ReportExportJobResponse | null>;
  start(): Promise<void>;
  stop(): Promise<void>;
};

function mapJobStatus(state: string) {
  switch (state) {
    case "active":
      return "processing" as const;
    case "completed":
      return "complete" as const;
    case "failed":
      return "failed" as const;
    default:
      return "pending" as const;
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number) {
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`CSV export exceeded ${timeoutMs}ms timeout`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function createUnavailableReportingExportJobQueue(): ReportingExportJobQueue {
  const fail = () => {
    throw new ReportingServiceError(
      "EXPORT_QUEUE_UNAVAILABLE",
      "CSV export queue is not configured",
      503
    );
  };

  return {
    async enqueueCsvExport() {
      return fail();
    },
    async getCsvExportJob() {
      return fail();
    },
    async start() {
      return;
    },
    async stop() {
      return;
    },
  };
}

export function createBullMqReportingExportJobQueue(options: {
  logger: ReportingLogger;
  processor(input: JobProcessorInput): Promise<BullMqJobResult>;
  redisUrl: string;
  storage: ReportingExportStorage;
}): ReportingExportJobQueue {
  const queueConnection = new Redis(options.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
  const workerConnection = new Redis(options.redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
  const queue = new Queue<BullMqJobData, BullMqJobResult>(REPORT_EXPORT_QUEUE_NAME, {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });
  let worker: Worker<BullMqJobData, BullMqJobResult> | null = null;

  async function ensureConnected() {
    if (queueConnection.status === "wait") {
      await queueConnection.connect();
    }

    if (workerConnection.status === "wait") {
      await workerConnection.connect();
    }
  }

  return {
    async enqueueCsvExport(input) {
      await ensureConnected();
      const job = await queue.add("csv-export", input);

      return {
        jobId: String(job.id),
        status: "pending",
      };
    },

    async getCsvExportJob(jobId, organizationId) {
      await ensureConnected();
      const job = await queue.getJob(jobId);

      if (!job || job.data.organizationId !== organizationId) {
        return null;
      }

      const state = await job.getState();
      const status = mapJobStatus(state);
      const createdAt = new Date(job.timestamp).toISOString();
      const completedAt = job.finishedOn ? new Date(job.finishedOn).toISOString() : null;

      if (status !== "complete" || !job.returnvalue) {
        return {
          completedAt,
          createdAt,
          errorMessage: status === "failed" ? (job.failedReason ?? "CSV export failed") : null,
          jobId,
          status,
        };
      }

      const download = await options.storage.createDownloadUrl({
        expiresInSeconds: 60 * 60,
        filename: job.returnvalue.filename,
        key: job.returnvalue.key,
      });

      return {
        completedAt,
        createdAt,
        downloadUrl: download.url,
        downloadUrlExpiresAt: download.expiresAt,
        errorMessage: null,
        jobId,
        status,
      };
    },

    async start() {
      if (worker) {
        return;
      }

      await ensureConnected();
      worker = new Worker<BullMqJobData, BullMqJobResult>(
        REPORT_EXPORT_QUEUE_NAME,
        async (job) =>
          withTimeout(
            options.processor({
              ...job.data,
              jobId: String(job.id),
            }),
            EXPORT_JOB_TIMEOUT_MS
          ),
        {
          connection: workerConnection,
        }
      );

      worker.on("failed", (job, error) => {
        options.logger.error(
          {
            err: error,
            jobId: job?.id,
            organizationId: job?.data.organizationId,
          },
          "reporting export job failed"
        );
      });
    },

    async stop() {
      await worker?.close();
      worker = null;
      await Promise.allSettled([queue.close(), queueConnection.quit(), workerConnection.quit()]);
      queueConnection.disconnect();
      workerConnection.disconnect();
    },
  };
}
