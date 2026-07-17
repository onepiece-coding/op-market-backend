import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const asyncHandlerPath = "express-async-handler";
const prismaPath = "../../src/db/prisma.js";
const cloudinaryPath = "../../src/services/cloudinary.js";
const loggerPath = "../../src/utils/logger.js";
const productsControllerPath = "../../src/controllers/productsController.js";

type TestRequest = Partial<Request> & {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  file?: {
    buffer: Buffer;
    mimetype?: string;
    originalname?: string;
  };
};

function createRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;

  (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

async function loadProductsController() {
  vi.resetModules();

  const prismaClient = {
    product: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };

  const uploadImageBuffer = vi.fn();
  const removeImage = vi.fn();

  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };

  vi.doMock(asyncHandlerPath, () => ({
    default: <T extends (...args: any[]) => any>(fn: T) => fn,
  }));

  vi.doMock(prismaPath, () => ({
    prismaClient,
  }));

  vi.doMock(cloudinaryPath, () => ({
    uploadImageBuffer,
    removeImage,
  }));

  vi.doMock(loggerPath, () => ({
    default: logger,
  }));

  const mod = await import(productsControllerPath);

  return {
    ...mod,
    mocks: {
      prismaClient,
      uploadImageBuffer,
      removeImage,
      logger,
    },
  };
}

describe("productsController", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createProductCtrl", () => {
    it("creates a product without file and normalizes comma-separated tags", async () => {
      const { createProductCtrl, mocks } = await loadProductsController();

      const req = {
        body: {
          name: "Phone",
          description: "Nice phone",
          price: "199.99",
          tags: " electronics, mobile , gadgets ",
        },
      } as TestRequest as Request;

      const res = createRes();

      const createdProduct = {
        id: 1,
        name: "Phone",
        description: "Nice phone",
        price: 199.99,
        tags: "electronics,mobile,gadgets",
        imageUrl: null,
        imageKey: null,
      };

      mocks.prismaClient.product.create.mockResolvedValue(createdProduct);

      await createProductCtrl(req, res);

      expect(mocks.prismaClient.product.create).toHaveBeenCalledWith({
        data: {
          name: "Phone",
          description: "Nice phone",
          price: 199.99,
          tags: "electronics,mobile,gadgets",
          imageUrl: null,
          imageKey: null,
        },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(createdProduct);
    });

    it("creates a product with uploaded image and array tags", async () => {
      const { createProductCtrl, mocks } = await loadProductsController();

      const req = {
        body: {
          name: "Phone",
          description: "Nice phone",
          price: "199.99",
          tags: ["electronics", "mobile"],
        },
        file: {
          buffer: Buffer.from("img"),
          mimetype: "image/png",
          originalname: "phone.png",
        },
      } as TestRequest as Request;

      const res = createRes();

      mocks.uploadImageBuffer.mockResolvedValue({
        secure_url: "https://cdn.test/new.png",
        public_id: "products/new-image",
      });

      const createdProduct = {
        id: 1,
        name: "Phone",
        description: "Nice phone",
        price: 199.99,
        tags: "electronics,mobile",
        imageUrl: "https://cdn.test/new.png",
        imageKey: "products/new-image",
      };

      mocks.prismaClient.product.create.mockResolvedValue(createdProduct);

      await createProductCtrl(req, res);

      expect(mocks.uploadImageBuffer).toHaveBeenCalledWith(Buffer.from("img"), {
        folder: "op-market/products",
      });
      expect(mocks.prismaClient.product.create).toHaveBeenCalledWith({
        data: {
          name: "Phone",
          description: "Nice phone",
          price: 199.99,
          tags: "electronics,mobile",
          imageUrl: "https://cdn.test/new.png",
          imageKey: "products/new-image",
        },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(createdProduct);
    });
  });

  describe("updateProductCtrl", () => {
    it("returns 400 for invalid product id", async () => {
      const { updateProductCtrl } = await loadProductsController();

      const req = {
        params: { id: "abc" },
        body: {},
      } as TestRequest as Request;

      const res = createRes();

      await expect(updateProductCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid product id",
      });
    });

    it("returns 404 when product does not exist", async () => {
      const { updateProductCtrl, mocks } = await loadProductsController();

      const req = {
        params: { id: "10" },
        body: {},
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.product.findUnique.mockResolvedValue(null);

      await expect(updateProductCtrl(req, res)).rejects.toMatchObject({
        statusCode: 404,
        message: "Product not found!",
      });
    });

    it("updates without file, keeps existing image fields, and updates only provided scalar fields", async () => {
      const { updateProductCtrl, mocks } = await loadProductsController();

      const existingProduct = {
        id: 10,
        name: "Old name",
        description: "Old description",
        price: 100,
        tags: "old,tag",
        imageUrl: "https://cdn.test/old.png",
        imageKey: "products/old-image",
      };

      const updatedProduct = {
        ...existingProduct,
        name: "New name",
        price: 250,
      };

      const req = {
        params: { id: "10" },
        body: {
          name: "New name",
          price: "250",
        },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.product.findUnique.mockResolvedValue(existingProduct);
      mocks.prismaClient.product.update.mockResolvedValue(updatedProduct);

      await updateProductCtrl(req, res);

      expect(mocks.prismaClient.product.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          name: "New name",
          description: "Old description",
          price: 250,
          tags: "old,tag",
          imageUrl: "https://cdn.test/old.png",
          imageKey: "products/old-image",
        },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updatedProduct);
    });

    it("joins array tags into a comma-separated string", async () => {
      const { updateProductCtrl, mocks } = await loadProductsController();

      const existingProduct = {
        id: 10,
        name: "Old name",
        description: "Old description",
        price: 100,
        tags: "old,tag",
        imageUrl: null,
        imageKey: null,
      };

      const req = {
        params: { id: "10" },
        body: {
          tags: ["one", "two", "three"],
        },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.product.findUnique.mockResolvedValue(existingProduct);
      mocks.prismaClient.product.update.mockResolvedValue({
        ...existingProduct,
        tags: "one,two,three",
      });

      await updateProductCtrl(req, res);

      expect(mocks.prismaClient.product.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: expect.objectContaining({
          tags: "one,two,three",
        }),
      });
    });

    it("normalizes comma-separated string tags", async () => {
      const { updateProductCtrl, mocks } = await loadProductsController();

      const existingProduct = {
        id: 10,
        name: "Old name",
        description: "Old description",
        price: 100,
        tags: "old,tag",
        imageUrl: null,
        imageKey: null,
      };

      const req = {
        params: { id: "10" },
        body: {
          tags: " one, two , three  ",
        },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.product.findUnique.mockResolvedValue(existingProduct);
      mocks.prismaClient.product.update.mockResolvedValue({
        ...existingProduct,
        tags: "one,two,three",
      });

      await updateProductCtrl(req, res);

      expect(mocks.prismaClient.product.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: expect.objectContaining({
          tags: "one,two,three",
        }),
      });
    });

    it("keeps old tags when tags are omitted", async () => {
      const { updateProductCtrl, mocks } = await loadProductsController();

      const existingProduct = {
        id: 10,
        name: "Old name",
        description: "Old description",
        price: 100,
        tags: "old,tag",
        imageUrl: null,
        imageKey: null,
      };

      const req = {
        params: { id: "10" },
        body: {
          description: "New description",
        },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.product.findUnique.mockResolvedValue(existingProduct);
      mocks.prismaClient.product.update.mockResolvedValue({
        ...existingProduct,
        description: "New description",
      });

      await updateProductCtrl(req, res);

      expect(mocks.prismaClient.product.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: expect.objectContaining({
          tags: "old,tag",
        }),
      });
    });

    it("uploads new image and updates product image fields", async () => {
      const { updateProductCtrl, mocks } = await loadProductsController();

      const existingProduct = {
        id: 10,
        name: "Old name",
        description: "Old description",
        price: 100,
        tags: "old,tag",
        imageUrl: "https://cdn.test/old.png",
        imageKey: "products/old-image",
      };

      const updatedProduct = {
        ...existingProduct,
        imageUrl: "https://cdn.test/new.png",
        imageKey: "products/new-image",
      };

      const req = {
        params: { id: "10" },
        body: {},
        file: {
          buffer: Buffer.from("img"),
          mimetype: "image/png",
          originalname: "new.png",
        },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.product.findUnique.mockResolvedValue(existingProduct);
      mocks.uploadImageBuffer.mockResolvedValue({
        secure_url: "https://cdn.test/new.png",
        public_id: "products/new-image",
      });
      mocks.prismaClient.product.update.mockResolvedValue(updatedProduct);

      await updateProductCtrl(req, res);

      expect(mocks.uploadImageBuffer).toHaveBeenCalledWith(Buffer.from("img"), {
        folder: "op-market/products",
      });
      expect(mocks.prismaClient.product.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: expect.objectContaining({
          imageUrl: "https://cdn.test/new.png",
          imageKey: "products/new-image",
        }),
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updatedProduct);
    });

    it("removes old image after successful update when a new file is uploaded", async () => {
      const { updateProductCtrl, mocks } = await loadProductsController();

      const existingProduct = {
        id: 10,
        name: "Old name",
        description: "Old description",
        price: 100,
        tags: "old,tag",
        imageUrl: "https://cdn.test/old.png",
        imageKey: "products/old-image",
      };

      const req = {
        params: { id: "10" },
        body: {},
        file: {
          buffer: Buffer.from("img"),
        },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.product.findUnique.mockResolvedValue(existingProduct);
      mocks.uploadImageBuffer.mockResolvedValue({
        secure_url: "https://cdn.test/new.png",
        public_id: "products/new-image",
      });
      mocks.prismaClient.product.update.mockResolvedValue({
        ...existingProduct,
        imageUrl: "https://cdn.test/new.png",
        imageKey: "products/new-image",
      });

      await updateProductCtrl(req, res);

      expect(mocks.removeImage).toHaveBeenCalledWith("products/old-image");
    });

    it("still succeeds and logs when old image removal fails", async () => {
      const { updateProductCtrl, mocks } = await loadProductsController();

      const existingProduct = {
        id: 10,
        name: "Old name",
        description: "Old description",
        price: 100,
        tags: "old,tag",
        imageUrl: "https://cdn.test/old.png",
        imageKey: "products/old-image",
      };

      const updatedProduct = {
        ...existingProduct,
        imageUrl: "https://cdn.test/new.png",
        imageKey: "products/new-image",
      };

      const req = {
        params: { id: "10" },
        body: {},
        file: {
          buffer: Buffer.from("img"),
        },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.product.findUnique.mockResolvedValue(existingProduct);
      mocks.uploadImageBuffer.mockResolvedValue({
        secure_url: "https://cdn.test/new.png",
        public_id: "products/new-image",
      });
      mocks.prismaClient.product.update.mockResolvedValue(updatedProduct);
      mocks.removeImage.mockRejectedValue(
        new Error("cloudinary remove failed"),
      );

      await updateProductCtrl(req, res);

      expect(mocks.logger.error).toHaveBeenCalledWith(
        "Failed to remove old product image",
        expect.any(Error),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updatedProduct);
    });

    it("cleans up newly uploaded image and rethrows when DB update fails after upload", async () => {
      const { updateProductCtrl, mocks } = await loadProductsController();

      const existingProduct = {
        id: 10,
        name: "Old name",
        description: "Old description",
        price: 100,
        tags: "old,tag",
        imageUrl: "https://cdn.test/old.png",
        imageKey: "products/old-image",
      };

      const req = {
        params: { id: "10" },
        body: {},
        file: {
          buffer: Buffer.from("img"),
        },
      } as TestRequest as Request;

      const res = createRes();

      const dbError = new Error("db update failed");

      mocks.prismaClient.product.findUnique.mockResolvedValue(existingProduct);
      mocks.uploadImageBuffer.mockResolvedValue({
        secure_url: "https://cdn.test/new.png",
        public_id: "products/new-image",
      });
      mocks.prismaClient.product.update.mockRejectedValue(dbError);

      await expect(updateProductCtrl(req, res)).rejects.toThrow(
        "db update failed",
      );

      expect(mocks.removeImage).toHaveBeenCalledWith("products/new-image");
    });

    it("logs cleanup failure and still rethrows original DB error", async () => {
      const { updateProductCtrl, mocks } = await loadProductsController();

      const existingProduct = {
        id: 10,
        name: "Old name",
        description: "Old description",
        price: 100,
        tags: "old,tag",
        imageUrl: "https://cdn.test/old.png",
        imageKey: "products/old-image",
      };

      const req = {
        params: { id: "10" },
        body: {},
        file: {
          buffer: Buffer.from("img"),
        },
      } as TestRequest as Request;

      const res = createRes();

      const dbError = new Error("db update failed");

      mocks.prismaClient.product.findUnique.mockResolvedValue(existingProduct);
      mocks.uploadImageBuffer.mockResolvedValue({
        secure_url: "https://cdn.test/new.png",
        public_id: "products/new-image",
      });
      mocks.prismaClient.product.update.mockRejectedValue(dbError);
      mocks.removeImage.mockRejectedValue(new Error("cleanup failed"));

      await expect(updateProductCtrl(req, res)).rejects.toThrow(
        "db update failed",
      );

      expect(mocks.logger.error).toHaveBeenCalledWith(
        "Failed to cleanup newly uploaded image",
        expect.any(Error),
      );
    });
  });

  describe("deleteProductCtrl", () => {
    it("returns 400 for invalid product id", async () => {
      const { deleteProductCtrl } = await loadProductsController();

      const req = {
        params: { id: "abc" },
      } as TestRequest as Request;

      const res = createRes();

      await expect(deleteProductCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid product id",
      });
    });

    it("returns 404 when product does not exist", async () => {
      const { deleteProductCtrl, mocks } = await loadProductsController();

      const req = {
        params: { id: "10" },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.product.findUnique.mockResolvedValue(null);

      await expect(deleteProductCtrl(req, res)).rejects.toMatchObject({
        statusCode: 404,
        message: "Product not found!",
      });
    });

    it("deletes product without image and returns success response", async () => {
      const { deleteProductCtrl, mocks } = await loadProductsController();

      const req = {
        params: { id: "10" },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.product.findUnique.mockResolvedValue({
        id: 10,
        imageKey: null,
      });
      mocks.prismaClient.product.delete.mockResolvedValue({ id: 10 });

      await deleteProductCtrl(req, res);

      expect(mocks.prismaClient.product.delete).toHaveBeenCalledWith({
        where: { id: 10 },
      });
      expect(mocks.removeImage).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: true,
        message: "Product deleted successfully",
      });
    });

    it("deletes product with image and attempts image removal", async () => {
      const { deleteProductCtrl, mocks } = await loadProductsController();

      const req = {
        params: { id: "10" },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.product.findUnique.mockResolvedValue({
        id: 10,
        imageKey: "products/old-image",
      });
      mocks.prismaClient.product.delete.mockResolvedValue({ id: 10 });

      await deleteProductCtrl(req, res);

      expect(mocks.removeImage).toHaveBeenCalledWith("products/old-image");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: true,
        message: "Product deleted successfully",
      });
    });

    it("still succeeds and logs when image removal fails", async () => {
      const { deleteProductCtrl, mocks } = await loadProductsController();

      const req = {
        params: { id: "10" },
      } as TestRequest as Request;

      const res = createRes();

      mocks.prismaClient.product.findUnique.mockResolvedValue({
        id: 10,
        imageKey: "products/old-image",
      });
      mocks.prismaClient.product.delete.mockResolvedValue({ id: 10 });
      mocks.removeImage.mockRejectedValue(
        new Error("cloudinary remove failed"),
      );

      await deleteProductCtrl(req, res);

      expect(mocks.logger.error).toHaveBeenCalledWith(
        "Failed to remove product image from Cloudinary",
        expect.any(Error),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: true,
        message: "Product deleted successfully",
      });
    });
  });
});
