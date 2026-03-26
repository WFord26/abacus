import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { ReportingServiceError } from "./errors";

export type ReportingExportDownload = {
  expiresAt: string;
  url: string;
};

export type ReportingExportStorage = {
  bucketName: string;
  createDownloadUrl(input: {
    expiresInSeconds?: number;
    filename: string;
    key: string;
  }): Promise<ReportingExportDownload>;
  putObject(input: { body: Buffer; contentType: string; key: string }): Promise<void>;
};

type CreateS3ReportingExportStorageOptions = {
  accessKeyId: string;
  bucketName: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  region: string;
  secretAccessKey: string;
};

function resolveForcePathStyle(endpoint: string | undefined, explicit: boolean | undefined) {
  if (explicit !== undefined) {
    return explicit;
  }

  if (!endpoint) {
    return false;
  }

  try {
    const url = new URL(endpoint);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

export function createUnavailableReportingExportStorage(): ReportingExportStorage {
  const fail = () => {
    throw new ReportingServiceError(
      "EXPORT_STORAGE_UNAVAILABLE",
      "CSV export storage is not configured",
      503
    );
  };

  return {
    bucketName: "unavailable",
    async createDownloadUrl() {
      return fail();
    },
    async putObject() {
      return fail();
    },
  };
}

export function createS3ReportingExportStorage(
  options: CreateS3ReportingExportStorageOptions
): ReportingExportStorage {
  const client = new S3Client({
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
    ...(options.endpoint ? { endpoint: options.endpoint } : {}),
    forcePathStyle: resolveForcePathStyle(options.endpoint, options.forcePathStyle),
    region: options.region,
  });
  let bucketReadyPromise: Promise<void> | null = null;

  async function ensureBucket() {
    if (!bucketReadyPromise) {
      bucketReadyPromise = (async () => {
        try {
          await client.send(
            new HeadBucketCommand({
              Bucket: options.bucketName,
            })
          );
        } catch {
          await client.send(
            new CreateBucketCommand({
              Bucket: options.bucketName,
            })
          );
        }
      })();
    }

    await bucketReadyPromise;
  }

  return {
    bucketName: options.bucketName,

    async createDownloadUrl(input) {
      await ensureBucket();
      const expiresIn = input.expiresInSeconds ?? 60 * 60;
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: options.bucketName,
          Key: input.key,
          ResponseContentDisposition: `attachment; filename="${input.filename}"`,
        }),
        {
          expiresIn,
        }
      );

      return {
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        url,
      };
    },

    async putObject(input) {
      await ensureBucket();
      await client.send(
        new PutObjectCommand({
          Body: input.body,
          Bucket: options.bucketName,
          ContentType: input.contentType,
          Key: input.key,
        })
      );
    },
  };
}
