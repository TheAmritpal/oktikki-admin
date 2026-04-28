import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET = process.env.AWS_BUCKET_NAME || "oktikki-social";
const CDN_URL = process.env.CLOUDFRONT_URL || "";

export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return `${CDN_URL}/${key}`;
}

export async function deleteFile(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

export function getFileUrl(key: string): string {
  return `${CDN_URL}/${key}`;
}

export function generateKey(prefix: string, filename: string): string {
  const ext = filename.split(".").pop();
  const hash = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return `${prefix}/${hash}.${ext}`;
}