import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  UploadApiErrorResponse,
  UploadApiOptions,
  UploadApiResponse,
} from "cloudinary";
import { Writable } from "node:stream";

const secretsPath = "../../src/config/secrets.js";
const cloudinaryPkgPath = "cloudinary";
const streamifierPath = "streamifier";
const cloudinaryServicePath = "../../src/services/cloudinary.js";

function createWritableSink() {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
}

async function loadCloudinaryService(
  overrides?: Partial<{
    CLOUDINARY_CLOUD_NAME: string;
    CLOUDINARY_API_KEY: string;
    CLOUDINARY_API_SECRET: string;
  }>,
) {
  vi.resetModules();

  const configMock = vi.fn();
  const destroyMock = vi.fn();
  const deleteResourcesMock = vi.fn();
  const uploadStreamMock = vi.fn();

  const createReadStreamMock = vi.fn((_buffer: Buffer) => ({
    pipe: vi.fn((destination: NodeJS.WritableStream) => destination),
  }));

  vi.doMock(secretsPath, () => ({
    CLOUDINARY_CLOUD_NAME: "demo-cloud",
    CLOUDINARY_API_KEY: "demo-key",
    CLOUDINARY_API_SECRET: "demo-secret",
    ...overrides,
  }));

  vi.doMock(cloudinaryPkgPath, () => ({
    v2: {
      config: configMock,
      uploader: {
        upload_stream: uploadStreamMock,
        destroy: destroyMock,
      },
      api: {
        delete_resources: deleteResourcesMock,
      },
    },
  }));

  vi.doMock(streamifierPath, () => ({
    default: {
      createReadStream: createReadStreamMock,
    },
  }));

  const mod = await import(cloudinaryServicePath);

  return {
    ...mod,
    mocks: {
      configMock,
      destroyMock,
      deleteResourcesMock,
      uploadStreamMock,
      createReadStreamMock,
    },
  };
}

describe("cloudinary service", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("throws at module load if Cloudinary config is absent", async () => {
    await expect(
      loadCloudinaryService({
        CLOUDINARY_CLOUD_NAME: "",
        CLOUDINARY_API_KEY: "",
        CLOUDINARY_API_SECRET: "",
      }),
    ).rejects.toThrow(
      "Cloudinary is not configured. Check your env variables.",
    );
  });

  it("configures Cloudinary on import", async () => {
    const { mocks } = await loadCloudinaryService();

    expect(mocks.configMock).toHaveBeenCalledTimes(1);
    expect(mocks.configMock).toHaveBeenCalledWith({
      cloud_name: "demo-cloud",
      api_key: "demo-key",
      api_secret: "demo-secret",
    });
  });

  it("uploadBufferToCloudinary resolves when uploader callback returns result", async () => {
    const { uploadBufferToCloudinary, mocks } = await loadCloudinaryService();

    const result = {
      public_id: "products/item-1",
      secure_url: "https://cdn.test/item-1.png",
    } as UploadApiResponse;

    mocks.uploadStreamMock.mockImplementation(
      (
        _opts: UploadApiOptions,
        cb: (err?: UploadApiErrorResponse, res?: UploadApiResponse) => void,
      ) => {
        cb(undefined, result);
        return createWritableSink();
      },
    );

    const response = await uploadBufferToCloudinary(Buffer.from("img"));

    expect(response).toBe(result);
  });

  it("uploadBufferToCloudinary rejects when uploader callback returns error", async () => {
    const { uploadBufferToCloudinary, mocks } = await loadCloudinaryService();

    const uploadError = new Error("cloudinary upload failed");

    mocks.uploadStreamMock.mockImplementation(
      (
        _opts: UploadApiOptions,
        cb: (err?: UploadApiErrorResponse, res?: UploadApiResponse) => void,
      ) => {
        cb(uploadError as UploadApiErrorResponse);
        return createWritableSink();
      },
    );

    await expect(uploadBufferToCloudinary(Buffer.from("img"))).rejects.toThrow(
      "cloudinary upload failed",
    );
  });

  it("uploadBufferToCloudinary rejects on empty result", async () => {
    const { uploadBufferToCloudinary, mocks } = await loadCloudinaryService();

    mocks.uploadStreamMock.mockImplementation(
      (
        _opts: UploadApiOptions,
        cb: (err?: UploadApiErrorResponse, res?: UploadApiResponse) => void,
      ) => {
        cb(undefined, undefined);
        return createWritableSink();
      },
    );

    await expect(uploadBufferToCloudinary(Buffer.from("img"))).rejects.toThrow(
      "Empty response from Cloudinary",
    );
  });

  it('passes folder, public_id, and default resource_type "auto"', async () => {
    const { uploadBufferToCloudinary, mocks } = await loadCloudinaryService();

    const result = {
      public_id: "products/item-1",
      secure_url: "https://cdn.test/item-1.png",
    } as UploadApiResponse;

    mocks.uploadStreamMock.mockImplementation(
      (
        opts: UploadApiOptions,
        cb: (err?: UploadApiErrorResponse, res?: UploadApiResponse) => void,
      ) => {
        expect(opts).toEqual({
          folder: "op-market/products",
          public_id: "item-1",
          resource_type: "auto",
        });

        cb(undefined, result);
        return createWritableSink();
      },
    );

    await uploadBufferToCloudinary(Buffer.from("img"), {
      folder: "op-market/products",
      public_id: "item-1",
    });
  });

  it("uploadImageBuffer delegates correctly with resource_type auto", async () => {
    const { uploadImageBuffer, mocks } = await loadCloudinaryService();

    const result = {
      public_id: "products/item-1",
      secure_url: "https://cdn.test/item-1.png",
    } as UploadApiResponse;

    mocks.uploadStreamMock.mockImplementation(
      (
        opts: UploadApiOptions,
        cb: (err?: UploadApiErrorResponse, res?: UploadApiResponse) => void,
      ) => {
        expect(opts).toEqual({
          folder: "op-market/products",
          public_id: "item-1",
          resource_type: "auto",
        });

        cb(undefined, result);
        return createWritableSink();
      },
    );

    const response = await uploadImageBuffer(Buffer.from("img"), {
      folder: "op-market/products",
      public_id: "item-1",
    });

    expect(response).toBe(result);
  });

  it("removeImage calls uploader.destroy(publicId)", async () => {
    const { removeImage, mocks } = await loadCloudinaryService();

    mocks.destroyMock.mockResolvedValue({ result: "ok" });

    const response = await removeImage("products/item-1");

    expect(mocks.destroyMock).toHaveBeenCalledWith("products/item-1");
    expect(response).toEqual({ result: "ok" });
  });

  it("removeImage rethrows wrapped error", async () => {
    const { removeImage, mocks } = await loadCloudinaryService();

    const cause = new Error("destroy failed");
    mocks.destroyMock.mockRejectedValue(cause);

    await expect(removeImage("products/item-1")).rejects.toThrow(
      "Internal Server Error (cloudinary removeImage)",
    );

    await removeImage("products/item-1").catch(
      (err: Error & { cause?: unknown }) => {
        expect(err.message).toBe(
          "Internal Server Error (cloudinary removeImage)",
        );
        expect(err.cause).toBe(cause);
      },
    );
  });

  it("removeMultipleImages calls api.delete_resources(publicIds)", async () => {
    const { removeMultipleImages, mocks } = await loadCloudinaryService();

    mocks.deleteResourcesMock.mockResolvedValue({
      deleted: {
        "products/a": "deleted",
        "products/b": "deleted",
      },
    });

    const response = await removeMultipleImages(["products/a", "products/b"]);

    expect(mocks.deleteResourcesMock).toHaveBeenCalledWith([
      "products/a",
      "products/b",
    ]);
    expect(response).toEqual({
      deleted: {
        "products/a": "deleted",
        "products/b": "deleted",
      },
    });
  });

  it("removeMultipleImages wraps errors similarly", async () => {
    const { removeMultipleImages, mocks } = await loadCloudinaryService();

    const cause = new Error("delete resources failed");
    mocks.deleteResourcesMock.mockRejectedValue(cause);

    await expect(
      removeMultipleImages(["products/a", "products/b"]),
    ).rejects.toThrow(
      "Internal Server Error (cloudinary removeMultipleImages)",
    );

    await removeMultipleImages(["products/a", "products/b"]).catch(
      (err: Error & { cause?: unknown }) => {
        expect(err.message).toBe(
          "Internal Server Error (cloudinary removeMultipleImages)",
        );
        expect(err.cause).toBe(cause);
      },
    );
  });
});
