// Alert images live in an S3 bucket. The browser uploads straight to it with a short-lived signed
// URL, and the server reads them back to check and send them.

import "server-only";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { IMAGE_TYPES } from "@/lib/alerts";

let client: S3Client | undefined;

function bucket(): { s3: S3Client; name: string } {
  const name = process.env.ALERTS_S3_BUCKET;
  if (!name || !process.env.AWS_REGION) throw new Error("Images aren't set up: ALERTS_S3_BUCKET or AWS_REGION is missing");
  // Credentials come from AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.
  client ??= new S3Client({ region: process.env.AWS_REGION });
  return { s3: client, name };
}

/** Where an image is stored: named by its SHA-256, so the signed alert pins its exact bytes. */
export const imageKey = (sha256: string, type: keyof typeof IMAGE_TYPES) => `alerts/${sha256}.${IMAGE_TYPES[type]}`;

/** A URL the browser can PUT exactly `size` bytes of `type` to, for 5 minutes. */
export function uploadUrl(key: string, type: string, size: number): Promise<string> {
  const { s3, name } = bucket();
  return getSignedUrl(s3, new PutObjectCommand({ Bucket: name, Key: key, ContentType: type, ContentLength: size }), {
    expiresIn: 300,
  });
}

/** The stored image's bytes and type. */
export async function readImage(key: string): Promise<{ bytes: Uint8Array; type: string }> {
  const { s3, name } = bucket();
  const object = await s3.send(new GetObjectCommand({ Bucket: name, Key: key }));
  return { bytes: await object.Body!.transformToByteArray(), type: object.ContentType ?? "" };
}
