import request from "supertest";
import { describe, it, expect } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../helpers/prisma.js";
import { authHeaderFor } from "../helpers/auth.js";
import {
  createCartItem,
  createProduct,
  createVerifiedUser,
} from "../helpers/factories.js";

describe("Cart routes integration", () => {
  it("returns 401 for all unauthenticated cart routes", async () => {
    const getRes = await request(app).get("/api/v1/cart");
    expect(getRes.status).toBe(401);
    expect(getRes.body.message).toBe("Unauthorized!");

    const postRes = await request(app).post("/api/v1/cart").send({
      productId: 1,
      quantity: 1,
    });
    expect(postRes.status).toBe(401);
    expect(postRes.body.message).toBe("Unauthorized!");

    const putRes = await request(app).put("/api/v1/cart/1").send({
      quantity: 2,
    });
    expect(putRes.status).toBe(401);
    expect(putRes.body.message).toBe("Unauthorized!");

    const deleteRes = await request(app).delete("/api/v1/cart/1");
    expect(deleteRes.status).toBe(401);
    expect(deleteRes.body.message).toBe("Unauthorized!");
  });

  it("adds item to cart with valid payload", async () => {
    const { user } = await createVerifiedUser();
    const product = await createProduct();

    const res = await request(app)
      .post("/api/v1/cart")
      .set("Authorization", authHeaderFor(user.id))
      .send({
        productId: product.id,
        quantity: 2,
      });

    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(user.id);
    expect(res.body.productId).toBe(product.id);
    expect(res.body.quantity).toBe(2);

    const cartItems = await prisma.cartItem.findMany({
      where: { userId: user.id },
    });
    expect(cartItems).toHaveLength(1);
    expect(cartItems[0].quantity).toBe(2);
  });

  it("adding same product again returns 200 and increments quantity", async () => {
    const { user } = await createVerifiedUser();
    const product = await createProduct();

    await createCartItem(user.id, product.id, { quantity: 2 });

    const res = await request(app)
      .post("/api/v1/cart")
      .set("Authorization", authHeaderFor(user.id))
      .send({
        productId: product.id,
        quantity: 3,
      });

    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(user.id);
    expect(res.body.productId).toBe(product.id);
    expect(res.body.quantity).toBe(5);

    const cartItems = await prisma.cartItem.findMany({
      where: { userId: user.id, productId: product.id },
    });
    expect(cartItems).toHaveLength(1);
    expect(cartItems[0].quantity).toBe(5);
  });

  it("returns 404 for missing product and 400 for invalid payload", async () => {
    const { user } = await createVerifiedUser();

    const missingProductRes = await request(app)
      .post("/api/v1/cart")
      .set("Authorization", authHeaderFor(user.id))
      .send({
        productId: 999999,
        quantity: 1,
      });

    expect(missingProductRes.status).toBe(404);
    expect(missingProductRes.body.message).toBe("Product Not Found!");

    const invalidPayloadRes = await request(app)
      .post("/api/v1/cart")
      .set("Authorization", authHeaderFor(user.id))
      .send({
        productId: "abc",
        quantity: 0,
      });

    expect(invalidPayloadRes.status).toBe(400);
    expect(invalidPayloadRes.body.message).toBe("Validation failed");
    expect(Array.isArray(invalidPayloadRes.body.errors)).toBe(true);
  });

  it("gets only current user's cart items and includes product relation", async () => {
    const { user: userA } = await createVerifiedUser({
      email: "cart-a@test.com",
    });
    const { user: userB } = await createVerifiedUser({
      email: "cart-b@test.com",
    });

    const productA = await createProduct({ name: "Product A" });
    const productB = await createProduct({ name: "Product B" });

    await createCartItem(userA.id, productA.id, { quantity: 2 });
    await createCartItem(userB.id, productB.id, { quantity: 1 });

    const res = await request(app)
      .get("/api/v1/cart")
      .set("Authorization", authHeaderFor(userA.id));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].userId).toBe(userA.id);
    expect(res.body[0].productId).toBe(productA.id);
    expect(res.body[0].quantity).toBe(2);
    expect(res.body[0].product).toBeTruthy();
    expect(res.body[0].product.id).toBe(productA.id);
    expect(res.body[0].product.name).toBe("Product A");
  });

  it("changes quantity with valid payload", async () => {
    const { user } = await createVerifiedUser();
    const product = await createProduct();
    const cartItem = await createCartItem(user.id, product.id, { quantity: 1 });

    const res = await request(app)
      .put(`/api/v1/cart/${cartItem.id}`)
      .set("Authorization", authHeaderFor(user.id))
      .send({
        quantity: 7,
      });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(cartItem.id);
    expect(res.body.quantity).toBe(7);

    const updated = await prisma.cartItem.findUnique({
      where: { id: cartItem.id },
    });
    expect(updated?.quantity).toBe(7);
  });

  it("returns 400 for invalid cart id, 400 for invalid quantity, and 404 for another user's cart item on quantity change", async () => {
    const { user } = await createVerifiedUser({
      email: "cart-update-me@test.com",
    });
    const { user: other } = await createVerifiedUser({
      email: "cart-update-other@test.com",
    });

    const product = await createProduct();
    const otherCartItem = await createCartItem(other.id, product.id, {
      quantity: 2,
    });

    const invalidIdRes = await request(app)
      .put("/api/v1/cart/not-a-number")
      .set("Authorization", authHeaderFor(user.id))
      .send({
        quantity: 3,
      });

    expect(invalidIdRes.status).toBe(400);
    expect(invalidIdRes.body.message).toBe("Invalid cart id");

    const invalidQuantityRes = await request(app)
      .put(`/api/v1/cart/${otherCartItem.id}`)
      .set("Authorization", authHeaderFor(user.id))
      .send({
        quantity: 0,
      });

    expect(invalidQuantityRes.status).toBe(400);
    expect(invalidQuantityRes.body.message).toBe("Validation failed");
    expect(Array.isArray(invalidQuantityRes.body.errors)).toBe(true);

    const otherUserItemRes = await request(app)
      .put(`/api/v1/cart/${otherCartItem.id}`)
      .set("Authorization", authHeaderFor(user.id))
      .send({
        quantity: 5,
      });

    expect(otherUserItemRes.status).toBe(404);
    expect(otherUserItemRes.body.message).toBe(
      "Item does not exist in your cart",
    );
  });

  it("deletes cart item successfully", async () => {
    const { user } = await createVerifiedUser();
    const product = await createProduct();
    const cartItem = await createCartItem(user.id, product.id, { quantity: 1 });

    const res = await request(app)
      .delete(`/api/v1/cart/${cartItem.id}`)
      .set("Authorization", authHeaderFor(user.id));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBe("Item has been removed from cart");

    const deleted = await prisma.cartItem.findUnique({
      where: { id: cartItem.id },
    });
    expect(deleted).toBeNull();
  });

  it("returns 400 for invalid cart id and 404 when deleting another user's cart item", async () => {
    const { user } = await createVerifiedUser({
      email: "cart-delete-me@test.com",
    });
    const { user: other } = await createVerifiedUser({
      email: "cart-delete-other@test.com",
    });

    const product = await createProduct();
    const otherCartItem = await createCartItem(other.id, product.id, {
      quantity: 1,
    });

    const invalidIdRes = await request(app)
      .delete("/api/v1/cart/not-a-number")
      .set("Authorization", authHeaderFor(user.id));

    expect(invalidIdRes.status).toBe(400);
    expect(invalidIdRes.body.message).toBe("Invalid cart id");

    const otherUserItemRes = await request(app)
      .delete(`/api/v1/cart/${otherCartItem.id}`)
      .set("Authorization", authHeaderFor(user.id));

    expect(otherUserItemRes.status).toBe(404);
    expect(otherUserItemRes.body.message).toBe(
      "This item does not exist in your cart",
    );
  });
});
