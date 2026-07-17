import request from "supertest";
import { describe, it, expect } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../helpers/prisma.js";
import { createAdmin } from "../helpers/factories.js";

describe("Admin product management E2E flow", () => {
  it("admin creates product → lists products → gets product by id → updates product → deletes product", async () => {
    const agent = request.agent(app);

    const { user: admin, rawPassword } = await createAdmin({
      email: "admin-products-e2e@test.com",
      password: "password123",
    });

    const loginRes = await agent.post("/api/v1/auth/login").send({
      email: admin.email,
      password: rawPassword,
    });

    expect(loginRes.status).toBe(200);

    const createRes = await agent
      .post("/api/v1/products")
      .field("name", "E2E Product")
      .field("description", "Initial E2E Description")
      .field("price", "49.99")
      .field("tags", "e2e,admin");

    expect(createRes.status).toBe(201);
    expect(createRes.body.name).toBe("E2E Product");
    expect(createRes.body.description).toBe("Initial E2E Description");
    expect(Number(createRes.body.price)).toBe(49.99);
    expect(createRes.body.tags).toBe("e2e,admin");

    const productId = createRes.body.id;

    const createdProduct = await prisma.product.findUnique({
      where: { id: productId },
    });
    expect(createdProduct).not.toBeNull();
    expect(createdProduct?.name).toBe("E2E Product");

    const listRes = await agent.get("/api/v1/products?page=1&limit=10");

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.data)).toBe(true);
    expect(
      listRes.body.data.some((p: { id: number }) => p.id === productId),
    ).toBe(true);
    expect(listRes.body.pagination.current).toBe(1);
    expect(listRes.body.pagination.limit).toBe(10);
    expect(listRes.body.pagination.results).toBeGreaterThanOrEqual(1);
    expect(listRes.body.pagination.totalPages).toBeGreaterThanOrEqual(1);

    const getRes = await agent.get(`/api/v1/products/${productId}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(productId);
    expect(getRes.body.name).toBe("E2E Product");
    expect(getRes.body.description).toBe("Initial E2E Description");
    expect(getRes.body.tags).toBe("e2e,admin");

    const updateRes = await agent.put(`/api/v1/products/${productId}`).send({
      name: "Updated E2E Product",
      description: "Updated Description",
      price: 79.99,
      tags: ["updated", "admin", "flow"],
    });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.id).toBe(productId);
    expect(updateRes.body.name).toBe("Updated E2E Product");
    expect(updateRes.body.description).toBe("Updated Description");
    expect(Number(updateRes.body.price)).toBe(79.99);
    expect(updateRes.body.tags).toBe("updated,admin,flow");

    const updatedProduct = await prisma.product.findUnique({
      where: { id: productId },
    });
    expect(updatedProduct).not.toBeNull();
    expect(updatedProduct?.name).toBe("Updated E2E Product");
    expect(updatedProduct?.description).toBe("Updated Description");
    expect(Number(updatedProduct!.price)).toBe(79.99);
    expect(updatedProduct?.tags).toBe("updated,admin,flow");

    const deleteRes = await agent.delete(`/api/v1/products/${productId}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toBe("Product deleted successfully");

    const deletedProduct = await prisma.product.findUnique({
      where: { id: productId },
    });
    expect(deletedProduct).toBeNull();

    const listAfterDeleteRes = await agent.get(
      "/api/v1/products?page=1&limit=10",
    );

    expect(listAfterDeleteRes.status).toBe(200);
    expect(
      listAfterDeleteRes.body.data.some(
        (p: { id: number }) => p.id === productId,
      ),
    ).toBe(false);
  });
});
