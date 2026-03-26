import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type DocumentStorageMetadata = {
  checksum: string | null;
  contentType: string | null;
  sizeBytes: number | null;
};

export type DocumentStoragePresignedUrl = {
  expiresAt: string;
  url: string;
};

export type DocumentStorage = {
  bucketName: string;
  createDownloadUrl(input: { filename: string; key: string }): Promise<DocumentStoragePresignedUrl>;
  createUploadUrl(input: {
    contentType: string;
    key: string;
    sizeBytes: number;
  }): Promise<DocumentStoragePresignedUrl>;
  deleteObject(key: string): Promise<void>;
  getObjectMetadata(key: string): Promise<DocumentStorageMetadata | null>;
};

type CreateS3DocumentStorageOptions = {
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

export function createS3DocumentStorage(options: CreateS3DocumentStorageOptions): DocumentStorage {
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
      const expiresIn = 60 * 5;
      const url = await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: options.bucketName,
          Key: input.key,
          ResponseContentDisposition: `inline; filename="${input.filename}"`,
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

    async createUploadUrl(input) {
      await ensureBucket();
      const expiresIn = 60 * 15;
      const url = await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: options.bucketName,
          ContentLength: input.sizeBytes,
          ContentType: input.contentType,
          Key: input.key,
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

    async deleteObject(key) {
      await ensureBucket();
      await client.send(
        new DeleteObjectCommand({
          Bucket: options.bucketName,
          Key: key,
        })
      );
    },

    async getObjectMetadata(key) {
      await ensureBucket();

      try {
        const response = await client.send(
          new HeadObjectCommand({
            Bucket: options.bucketName,
            Key: key,
          })
        );

        return {
          checksum: response.ETag ? response.ETag.replaceAll('"', "") : null,
          contentType: response.ContentType ?? null,
          sizeBytes: response.ContentLength ?? null,
        };
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
          return null;
        }

        throw error;
      }
    },
  };
}
