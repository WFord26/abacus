import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type InvoicingPdfDownload = {
  expiresAt: string;
  url: string;
};

export type InvoicingPdfStorage = {
  bucketName: string;
  createDownloadUrl(input: { filename: string; key: string }): Promise<InvoicingPdfDownload>;
  hasObject(key: string): Promise<boolean>;
  putObject(input: { body: Buffer; contentType: string; key: string }): Promise<void>;
};

type CreateS3InvoicingPdfStorageOptions = {
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

export function createS3InvoicingPdfStorage(
  options: CreateS3InvoicingPdfStorageOptions
): InvoicingPdfStorage {
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
      const expiresIn = 60 * 60;
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

    async hasObject(key) {
      await ensureBucket();

      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: options.bucketName,
            Key: key,
          })
        );
        return true;
      } catch (error) {
        const statusCode =
          typeof error === "object" && error && "$metadata" in error
            ? Reflect.get(error, "$metadata")
            : null;
        const httpStatusCode =
          statusCode && typeof statusCode === "object" && statusCode
            ? Reflect.get(statusCode, "httpStatusCode")
            : null;

        if (httpStatusCode === 404) {
          return false;
        }

        throw error;
      }
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
