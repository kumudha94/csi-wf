import { Storage } from "@google-cloud/storage";
import { randomUUID } from "node:crypto";

const bucketName = process.env.GCS_BUCKET;
const isGcsConfigured = !!bucketName;

const storage = new Storage();

if (!isGcsConfigured) {
  console.warn("Google Cloud Storage is not configured (GCS_BUCKET). Receipt photo uploads will fail until this is set.");
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function uploadImageBuffer(buffer: Buffer, folder: string, contentType: string): Promise<{ secureUrl: string }> {
  if (!isGcsConfigured) {
    return Promise.reject(new Error("Image uploads are not configured yet."));
  }
  const extension = EXTENSION_BY_MIME[contentType] || "jpg";
  const objectName = `${folder}/${randomUUID()}.${extension}`;
  const file = storage.bucket(bucketName!).file(objectName);
  return file
    .save(buffer, { contentType, resumable: false })
    .then(() => ({ secureUrl: `https://storage.googleapis.com/${bucketName}/${objectName}` }));
}
