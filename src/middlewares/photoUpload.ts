import multer, { FileFilterCallback, Multer } from "multer";
import type { Request } from "express";

export const imageFileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
) => {
  const mimetype = file.mimetype ?? "";
  if (mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported file format. Only images are allowed."));
  }
};

// Default limits
export const DEFAULT_IMAGE_LIMITS = { fileSize: 1 * 1024 * 1024 }; // 1MB

export const memoryUpload: Multer = multer({
  storage: multer.memoryStorage(),
});

export const photoUploadMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: DEFAULT_IMAGE_LIMITS,
});

export const singleImage = (fieldName = "image") =>
  photoUploadMemory.single(fieldName);
export const multipleImages = (fieldName = "images", maxCount = 5) =>
  photoUploadMemory.array(fieldName, maxCount);
