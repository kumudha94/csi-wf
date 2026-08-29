import { v2 as cloudinary } from "cloudinary";

const isCloudinaryConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
} else {
  console.warn(
    "Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET). Receipt photo uploads will fail until these are set."
  );
}

export function uploadImageBuffer(buffer: Buffer, folder: string): Promise<{ secureUrl: string }> {
  if (!isCloudinaryConfigured) {
    return Promise.reject(new Error("Image uploads are not configured yet."));
  }
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        transformation: [{ width: 1600, height: 1600, crop: "limit" }, { quality: "auto:good" }, { fetch_format: "auto" }],
      },
      (error, result) => {
        if (error) reject(error);
        else if (result) resolve({ secureUrl: result.secure_url });
        else reject(new Error("Upload failed"));
      }
    );
    uploadStream.end(buffer);
  });
}
