import {
  v2 as cloudinary,
  type UploadApiOptions,
  type UploadApiResponse,
  type UploadApiErrorResponse,
} from "cloudinary";
import streamifier from "streamifier";
import {
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
  CLOUDINARY_CLOUD_NAME,
} from "../config/secrets.js";

const hasCloudinaryConfig =
  !!CLOUDINARY_CLOUD_NAME && !!CLOUDINARY_API_KEY && !!CLOUDINARY_API_SECRET;

if (!hasCloudinaryConfig) {
  throw new Error("Cloudinary is not configured. Check your env variables.");
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

const withCause = (message: string, cause: unknown) => {
  const error = new Error(message);
  (error as Error & { cause?: unknown }).cause = cause;
  return error;
};

export const uploadBufferToCloudinary = async (
  buffer: Buffer,
  options?: {
    folder?: string;
    public_id?: string;
    resource_type?: "auto" | "raw" | "image" | "video";
  },
  client = cloudinary,
  uploaderFactory: (
    opts: UploadApiOptions,
    cb: (err?: UploadApiErrorResponse, res?: UploadApiResponse) => void,
  ) => NodeJS.WritableStream = client.uploader.upload_stream.bind(
    client.uploader,
  ),
): Promise<UploadApiResponse> => {
  return new Promise<UploadApiResponse>((resolve, reject) => {
    const uploadStream = uploaderFactory(
      {
        folder: options?.folder,
        public_id: options?.public_id,
        resource_type: options?.resource_type ?? "auto",
      },
      (
        error: UploadApiErrorResponse | undefined,
        result: UploadApiResponse | undefined,
      ) => {
        if (error) return reject(error);
        if (!result) return reject(new Error("Empty response from Cloudinary"));
        resolve(result);
      },
    );

    streamifier
      .createReadStream(buffer)
      .pipe(uploadStream as unknown as NodeJS.WritableStream);
  });
};

export const uploadImageBuffer = async (
  buffer: Buffer,
  options?: { folder?: string; public_id?: string },
  client = cloudinary,
) => {
  return uploadBufferToCloudinary(
    buffer,
    { ...options, resource_type: "auto" },
    client,
  );
};

export const removeImage = async (publicId: string, client = cloudinary) => {
  try {
    return await client.uploader.destroy(publicId);
  } catch (err: unknown) {
    throw withCause("Internal Server Error (cloudinary removeImage)", err);
  }
};

export const removeMultipleImages = async (
  publicIds: string[],
  client = cloudinary,
) => {
  try {
    return await client.api.delete_resources(publicIds);
  } catch (err: unknown) {
    throw withCause(
      "Internal Server Error (cloudinary removeMultipleImages)",
      err,
    );
  }
};

export default {
  uploadBufferToCloudinary,
  uploadImageBuffer,
  removeImage,
  removeMultipleImages,
};
