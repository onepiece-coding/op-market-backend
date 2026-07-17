import { describe, expect, it, vi } from "vitest";
import type { FileFilterCallback } from "multer";
import {
  DEFAULT_IMAGE_LIMITS,
  imageFileFilter,
} from "../../src/middlewares/photoUpload.js";

describe("photoUpload", () => {
  it("accepts image/* MIME types", () => {
    const cb = vi.fn();

    imageFileFilter(
      {} as never,
      { mimetype: "image/png" } as Express.Multer.File,
      cb as unknown as FileFilterCallback,
    );

    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it("rejects non-image MIME types with the expected error", () => {
    const cb = vi.fn();

    imageFileFilter(
      {} as never,
      { mimetype: "application/pdf" } as Express.Multer.File,
      cb as unknown as FileFilterCallback,
    );

    expect(cb).toHaveBeenCalledTimes(1);
    const err = cb.mock.calls[0][0] as Error;

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "Unsupported file format. Only images are allowed.",
    );
  });

  it("sets the default file size limit to 1 MB", () => {
    expect(DEFAULT_IMAGE_LIMITS).toEqual({
      fileSize: 1 * 1024 * 1024,
    });
  });
});
