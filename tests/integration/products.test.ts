import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/cloudinary.js", () => ({
  uploadImageBuffer: vi.fn(),
  removeImage: vi.fn(),
  removeMultipleImages: vi.fn(),
  uploadBufferToCloudinary: vi.fn(),
  default: {
    uploadImageBuffer: vi.fn(),
    removeImage: vi.fn(),
    removeMultipleImages: vi.fn(),
    uploadBufferToCloudinary: vi.fn(),
  },
}));

import request from "supertest";
import app from "../../src/app.js";
import * as cloudinaryServiceModule from "../../src/services/cloudinary.js";
import { prisma } from "../helpers/prisma.js";
import { authHeaderFor } from "../helpers/auth.js";
import {
  createAdmin,
  createProduct,
  createVerifiedUser,
} from "../helpers/factories.js";

describe("Products routes integration", () => {
  beforeEach(() => {
    vi.mocked(cloudinaryServiceModule.uploadImageBuffer).mockReset();
    vi.mocked(cloudinaryServiceModule.removeImage).mockReset();

    vi.mocked(cloudinaryServiceModule.uploadImageBuffer).mockResolvedValue({
      secure_url: "https://res.cloudinary.com/demo/image/upload/test.jpg",
      url: "https://res.cloudinary.com/demo/image/upload/test.jpg",
      public_id: "op-market/products/test-image",
    } as Awaited<ReturnType<typeof cloudinaryServiceModule.uploadImageBuffer>>);

    vi.mocked(cloudinaryServiceModule.removeImage).mockResolvedValue({
      result: "ok",
    } as never);
  });

  describe("GET /api/v1/products/search", () => {
    it("returns paginated results and empty query returns all products", async () => {
      await createProduct({
        name: "Laptop Pro",
        description: "Fast work laptop",
        tags: "electronics,computer",
      });
      await createProduct({
        name: "Office Chair",
        description: "Comfortable ergonomic chair",
        tags: "furniture,office",
      });
      await createProduct({
        name: "Gaming Mouse",
        description: "RGB precision mouse",
        tags: "gaming,accessories",
      });

      const res = await request(app).get(
        "/api/v1/products/search?page=1&limit=2",
      );

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.current).toBe(1);
      expect(res.body.pagination.limit).toBe(2);
      expect(res.body.pagination.results).toBe(3);
      expect(res.body.pagination.totalPages).toBe(2);
    });

    it("matches query against name, description, and tags", async () => {
      const byName = await createProduct({
        name: "Laptop Ultra",
        description: "Business machine",
        tags: "electronics,computer",
      });
      const byDescription = await createProduct({
        name: "Desk Lamp",
        description: "Minimalist study lighting",
        tags: "home,decor",
      });
      const byTags = await createProduct({
        name: "Controller",
        description: "Wireless gamepad",
        tags: "gaming,console",
      });

      const nameRes = await request(app).get(
        "/api/v1/products/search?q=laptop",
      );
      expect(nameRes.status).toBe(200);
      expect(
        nameRes.body.data.some((p: { id: number }) => p.id === byName.id),
      ).toBe(true);

      const descriptionRes = await request(app).get(
        "/api/v1/products/search?q=study",
      );
      expect(descriptionRes.status).toBe(200);
      expect(
        descriptionRes.body.data.some(
          (p: { id: number }) => p.id === byDescription.id,
        ),
      ).toBe(true);

      const tagsRes = await request(app).get(
        "/api/v1/products/search?q=gaming",
      );
      expect(tagsRes.status).toBe(200);
      expect(
        tagsRes.body.data.some((p: { id: number }) => p.id === byTags.id),
      ).toBe(true);
    });
  });

  describe("admin protection", () => {
    it("returns 401 for unauthenticated create, list, get, update, and delete", async () => {
      const createRes = await request(app)
        .post("/api/v1/products")
        .field("name", "A");
      expect(createRes.status).toBe(401);
      expect(createRes.body.message).toBe("Unauthorized!");

      const listRes = await request(app).get("/api/v1/products");
      expect(listRes.status).toBe(401);
      expect(listRes.body.message).toBe("Unauthorized!");

      const updateRes = await request(app).put("/api/v1/products/1").send({
        name: "Updated",
      });
      expect(updateRes.status).toBe(401);
      expect(updateRes.body.message).toBe("Unauthorized!");

      const deleteRes = await request(app).delete("/api/v1/products/1");
      expect(deleteRes.status).toBe(401);
      expect(deleteRes.body.message).toBe("Unauthorized!");
    });

    it("returns 403 for authenticated non-admin create, list, get, update, and delete", async () => {
      const { user } = await createVerifiedUser();

      const createRes = await request(app)
        .post("/api/v1/products")
        .set("Authorization", authHeaderFor(user.id))
        .field("name", "A");
      expect(createRes.status).toBe(403);
      expect(createRes.body.message).toBe("Forbidden: admin only");

      const listRes = await request(app)
        .get("/api/v1/products")
        .set("Authorization", authHeaderFor(user.id));
      expect(listRes.status).toBe(403);
      expect(listRes.body.message).toBe("Forbidden: admin only");

      const updateRes = await request(app)
        .put("/api/v1/products/1")
        .set("Authorization", authHeaderFor(user.id))
        .send({ name: "Updated" });
      expect(updateRes.status).toBe(403);
      expect(updateRes.body.message).toBe("Forbidden: admin only");

      const deleteRes = await request(app)
        .delete("/api/v1/products/1")
        .set("Authorization", authHeaderFor(user.id));
      expect(deleteRes.status).toBe(403);
      expect(deleteRes.body.message).toBe("Forbidden: admin only");
    });
  });

  describe("admin create and list", () => {
    it("creates product with valid payload, rejects invalid payload, stores tags from string and array, and saves image fields when upload is used", async () => {
      const { user: admin } = await createAdmin();

      const invalidRes = await request(app)
        .post("/api/v1/products")
        .set("Authorization", authHeaderFor(admin.id))
        .field("name", "")
        .field("description", "")
        .field("price", "-1")
        .field("tags", "");

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.message).toBe("Validation failed");
      expect(Array.isArray(invalidRes.body.errors)).toBe(true);

      const stringTagsRes = await request(app)
        .post("/api/v1/products")
        .set("Authorization", authHeaderFor(admin.id))
        .field("name", "Keyboard")
        .field("description", "Mechanical keyboard")
        .field("price", "49.99")
        .field("tags", "electronics, accessories");

      expect(stringTagsRes.status).toBe(201);
      expect(stringTagsRes.body.name).toBe("Keyboard");
      expect(stringTagsRes.body.tags).toBe("electronics,accessories");

      const arrayTagsRes = await request(app)
        .post("/api/v1/products")
        .set("Authorization", authHeaderFor(admin.id))
        .field("name", "Headset")
        .field("description", "Wireless headset")
        .field("price", "89.99")
        .field("tags", "audio")
        .field("tags", "gaming");

      expect(arrayTagsRes.status).toBe(201);
      expect(arrayTagsRes.body.tags).toBe("audio,gaming");

      const imageRes = await request(app)
        .post("/api/v1/products")
        .set("Authorization", authHeaderFor(admin.id))
        .field("name", "Monitor")
        .field("description", "4K monitor")
        .field("price", "299.99")
        .field("tags", "electronics,display")
        .attach("image", Buffer.from("fake-image-content"), {
          filename: "monitor.png",
          contentType: "image/png",
        });

      expect(imageRes.status).toBe(201);
      expect(imageRes.body.imageUrl).toBe(
        "https://res.cloudinary.com/demo/image/upload/test.jpg",
      );
      expect(imageRes.body.imageKey).toBe("op-market/products/test-image");
      expect(cloudinaryServiceModule.uploadImageBuffer).toHaveBeenCalledTimes(
        1,
      );
    });

    it("lists products with pagination", async () => {
      const { user: admin } = await createAdmin();

      await createProduct({ name: "Product 1" });
      await createProduct({ name: "Product 2" });
      await createProduct({ name: "Product 3" });

      const res = await request(app)
        .get("/api/v1/products?page=1&limit=2")
        .set("Authorization", authHeaderFor(admin.id));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.current).toBe(1);
      expect(res.body.pagination.limit).toBe(2);
      expect(res.body.pagination.results).toBe(3);
      expect(res.body.pagination.totalPages).toBe(2);
    });
  });

  describe("admin get, update, and delete", () => {
    it("gets product by id and returns 404 for missing product", async () => {
      const { user: admin } = await createAdmin();
      const product = await createProduct({ name: "Existing Product" });

      const okRes = await request(app)
        .get(`/api/v1/products/${product.id}`)
        .set("Authorization", authHeaderFor(admin.id));

      expect(okRes.status).toBe(200);
      expect(okRes.body.id).toBe(product.id);
      expect(okRes.body.name).toBe("Existing Product");

      const missingRes = await request(app)
        .get("/api/v1/products/999999")
        .set("Authorization", authHeaderFor(admin.id));

      expect(missingRes.status).toBe(404);
      expect(missingRes.body.message).toBe("Product not found!");
    });

    it("updates product, handles invalid id and missing product, updates tags, uploads new image, and removes old image", async () => {
      const { user: admin } = await createAdmin();

      const invalidIdRes = await request(app)
        .put("/api/v1/products/not-a-number")
        .set("Authorization", authHeaderFor(admin.id))
        .send({
          name: "Updated",
        });

      expect(invalidIdRes.status).toBe(400);
      expect(invalidIdRes.body.message).toBe("Invalid product id");

      const missingRes = await request(app)
        .put("/api/v1/products/999999")
        .set("Authorization", authHeaderFor(admin.id))
        .send({
          name: "Updated",
        });

      expect(missingRes.status).toBe(404);
      expect(missingRes.body.message).toBe("Product not found!");

      const product = await createProduct({
        name: "Old Name",
        description: "Old Description",
        price: 50,
        tags: "old,tag",
        imageUrl: "https://old.example/image.jpg",
        imageKey: "old-image-key",
      });

      const partialRes = await request(app)
        .put(`/api/v1/products/${product.id}`)
        .set("Authorization", authHeaderFor(admin.id))
        .send({
          name: "New Name",
          tags: "new,tag",
        });

      expect(partialRes.status).toBe(200);
      expect(partialRes.body.name).toBe("New Name");
      expect(partialRes.body.tags).toBe("new,tag");

      const imageRes = await request(app)
        .put(`/api/v1/products/${product.id}`)
        .set("Authorization", authHeaderFor(admin.id))
        .field("description", "Updated Description")
        .field("tags", "visual")
        .field("tags", "display")
        .attach("image", Buffer.from("replacement-image"), {
          filename: "replacement.png",
          contentType: "image/png",
        });

      expect(imageRes.status).toBe(200);
      expect(imageRes.body.description).toBe("Updated Description");
      expect(imageRes.body.tags).toBe("visual,display");
      expect(imageRes.body.imageUrl).toBe(
        "https://res.cloudinary.com/demo/image/upload/test.jpg",
      );
      expect(imageRes.body.imageKey).toBe("op-market/products/test-image");
      expect(cloudinaryServiceModule.uploadImageBuffer).toHaveBeenCalled();
      expect(cloudinaryServiceModule.removeImage).toHaveBeenCalledWith(
        "old-image-key",
      );
    });

    it("deletes product, handles invalid id and missing product, and removes image when imageKey exists", async () => {
      const { user: admin } = await createAdmin();

      const invalidIdRes = await request(app)
        .delete("/api/v1/products/not-a-number")
        .set("Authorization", authHeaderFor(admin.id));

      expect(invalidIdRes.status).toBe(400);
      expect(invalidIdRes.body.message).toBe("Invalid product id");

      const missingRes = await request(app)
        .delete("/api/v1/products/999999")
        .set("Authorization", authHeaderFor(admin.id));

      expect(missingRes.status).toBe(404);
      expect(missingRes.body.message).toBe("Product not found!");

      const product = await createProduct({
        name: "Delete Me",
        imageKey: "delete-image-key",
        imageUrl: "https://example.com/delete.jpg",
      });

      const okRes = await request(app)
        .delete(`/api/v1/products/${product.id}`)
        .set("Authorization", authHeaderFor(admin.id));

      expect(okRes.status).toBe(200);
      expect(okRes.body.message).toBe("Product deleted successfully");

      const deleted = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(deleted).toBeNull();
      expect(cloudinaryServiceModule.removeImage).toHaveBeenCalledWith(
        "delete-image-key",
      );
    });
  });

  describe("optional upload middleware checks", () => {
    it("rejects non-image upload and oversized image upload", async () => {
      const { user: admin } = await createAdmin();

      const nonImageRes = await request(app)
        .post("/api/v1/products")
        .set("Authorization", authHeaderFor(admin.id))
        .field("name", "Bad Upload")
        .field("description", "Bad Upload Description")
        .field("price", "10")
        .field("tags", "test")
        .attach("image", Buffer.from("plain-text"), {
          filename: "file.txt",
          contentType: "text/plain",
        });

      expect(nonImageRes.status).toBeGreaterThanOrEqual(400);

      const largeBuffer = Buffer.alloc(1024 * 1024 + 1, "a");

      const largeFileRes = await request(app)
        .post("/api/v1/products")
        .set("Authorization", authHeaderFor(admin.id))
        .field("name", "Large Upload")
        .field("description", "Large Upload Description")
        .field("price", "10")
        .field("tags", "test")
        .attach("image", largeBuffer, {
          filename: "large.png",
          contentType: "image/png",
        });

      expect(largeFileRes.status).toBeGreaterThanOrEqual(400);
    });
  });
});
