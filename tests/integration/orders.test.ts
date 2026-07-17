import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/paypalService.js", () => ({
  createPayPalOrder: vi.fn(),
  capturePayPalOrder: vi.fn(),
}));

import request from "supertest";
import app from "../../src/app.js";
import * as paypalServiceModule from "../../src/services/paypalService.js";
import { prisma } from "../helpers/prisma.js";
import { authHeaderFor } from "../helpers/auth.js";
import {
  addProductToOrder,
  createAddress,
  createAdmin,
  createCartItem,
  createOrder,
  createOrderWithEvent,
  createProduct,
  createVerifiedUser,
  setDefaultShippingAddress,
} from "../helpers/factories.js";

describe("Orders routes integration", () => {
  beforeEach(() => {
    vi.mocked(paypalServiceModule.createPayPalOrder).mockReset();
    vi.mocked(paypalServiceModule.capturePayPalOrder).mockReset();
  });

  describe("POST /api/v1/orders", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await request(app).post("/api/v1/orders").send({
        paymentMethod: "CASH_ON_DELIVERY",
      });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Unauthorized!");
    });

    it("returns 400 for invalid payment method", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          paymentMethod: "STRIPE",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Validation failed");
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it("returns 400 for empty cart", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          paymentMethod: "CASH_ON_DELIVERY",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Cart is empty");
    });

    it("returns 400 when no default shipping address is set", async () => {
      const { user } = await createVerifiedUser();
      const product = await createProduct();
      await createCartItem(user.id, product.id, { quantity: 2 });

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          paymentMethod: "CASH_ON_DELIVERY",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("No default shipping address set");
    });

    it("returns 400 for invalid shipping address", async () => {
      const { user } = await createVerifiedUser({
        email: "buyer@test.com",
      });
      const { user: other } = await createVerifiedUser({
        email: "other@test.com",
      });

      const product = await createProduct();
      const otherAddress = await createAddress(other.id);

      await createCartItem(user.id, product.id, { quantity: 1 });

      await prisma.user.update({
        where: { id: user.id },
        data: {
          defaultShippingAddress: otherAddress.id,
        },
      });

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          paymentMethod: "CASH_ON_DELIVERY",
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid shipping address");
    });

    it("creates a COD order, creates order products and initial event, clears cart, stores formatted address, and leaves payment pending", async () => {
      const { user } = await createVerifiedUser();
      const address = await createAddress(user.id, {
        lineOne: "123 Test Street",
        lineTwo: "Apt 4",
        city: "Casablanca",
        country: "MA",
        pincode: "12345",
      });
      const productA = await createProduct({ price: 10, name: "Product A" });
      const productB = await createProduct({ price: 20, name: "Product B" });

      await setDefaultShippingAddress(user.id, address.id);
      await createCartItem(user.id, productA.id, { quantity: 2 });
      await createCartItem(user.id, productB.id, { quantity: 1 });

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          paymentMethod: "CASH_ON_DELIVERY",
        });

      expect(res.status).toBe(201);
      expect(res.body.order.userId).toBe(user.id);
      expect(res.body.order.paymentMethod).toBe("CASH_ON_DELIVERY");
      expect(res.body.order.paymentStatus).toBe("PENDING");
      expect(res.body.order.address).toBe(
        "123 Test Street, Apt 4, Casablanca, MA-12345",
      );

      const orderId = res.body.order.id;

      const dbOrder = await prisma.order.findUnique({
        where: { id: orderId },
      });
      expect(dbOrder).not.toBeNull();
      expect(Number(dbOrder!.netAmount)).toBe(40);

      const orderProducts = await prisma.orderProduct.findMany({
        where: { orderId },
        orderBy: { id: "asc" },
      });
      expect(orderProducts).toHaveLength(2);
      expect(
        orderProducts.map((p) => p.quantity).sort((a, b) => a - b),
      ).toEqual([1, 2]);

      const events = await prisma.orderEvent.findMany({
        where: { orderId },
      });
      expect(events).toHaveLength(1);
      expect(events[0].status).toBe("PENDING");

      const cartItems = await prisma.cartItem.findMany({
        where: { userId: user.id },
      });
      expect(cartItems).toHaveLength(0);
    });

    it("creates a PayPal order and stores provider data when PayPal startup succeeds", async () => {
      vi.mocked(paypalServiceModule.createPayPalOrder).mockResolvedValue({
        paypalOrderId: "paypal-order-123",
        approvalUrl: "https://paypal.test/approve/paypal-order-123",
        raw: {
          id: "paypal-order-123",
          links: [
            {
              rel: "approve",
              href: "https://paypal.test/approve/paypal-order-123",
            },
          ],
        },
      });

      const { user } = await createVerifiedUser();
      const address = await createAddress(user.id);
      const product = await createProduct({ price: 99.99 });

      await setDefaultShippingAddress(user.id, address.id);
      await createCartItem(user.id, product.id, { quantity: 1 });

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          paymentMethod: "PAYPAL",
        });

      expect(res.status).toBe(201);
      expect(res.body.approvalUrl).toBe(
        "https://paypal.test/approve/paypal-order-123",
      );
      expect(res.body.providerOrderId).toBe("paypal-order-123");
      expect(res.body.order.paymentProviderId).toBe("paypal-order-123");

      const dbOrder = await prisma.order.findUnique({
        where: { id: res.body.order.id },
      });
      expect(dbOrder?.paymentProviderId).toBe("paypal-order-123");
      expect(dbOrder?.paymentMethod).toBe("PAYPAL");
      expect(dbOrder?.paymentStatus).toBe("PENDING");
    });

    it("still creates order and marks payment failed when PayPal startup fails", async () => {
      vi.mocked(paypalServiceModule.createPayPalOrder).mockRejectedValue(
        new Error("PayPal startup failed"),
      );

      const { user } = await createVerifiedUser();
      const address = await createAddress(user.id);
      const product = await createProduct({ price: 30 });

      await setDefaultShippingAddress(user.id, address.id);
      await createCartItem(user.id, product.id, { quantity: 2 });

      const res = await request(app)
        .post("/api/v1/orders")
        .set("Authorization", authHeaderFor(user.id))
        .send({
          paymentMethod: "PAYPAL",
        });

      expect(res.status).toBe(201);
      expect(res.body.order.paymentMethod).toBe("PAYPAL");
      expect(res.body.warning).toContain("Order was created");

      const dbOrder = await prisma.order.findUnique({
        where: { id: res.body.order.id },
      });
      expect(dbOrder?.paymentStatus).toBe("FAILED");
    });
  });

  describe("GET /api/v1/orders", () => {
    it("returns only current user's orders", async () => {
      const { user: userA } = await createVerifiedUser({
        email: "orders-a@test.com",
      });
      const { user: userB } = await createVerifiedUser({
        email: "orders-b@test.com",
      });

      await createOrderWithEvent(userA.id, { status: "PENDING" });
      await createOrderWithEvent(userA.id, { status: "DELIVERED" });
      await createOrderWithEvent(userB.id, { status: "CANCELED" });

      const res = await request(app)
        .get("/api/v1/orders")
        .set("Authorization", authHeaderFor(userA.id));

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(
        res.body.every((o: { userId: number }) => o.userId === userA.id),
      ).toBe(true);
    });
  });

  describe("GET /api/v1/orders/:id", () => {
    it("returns 400 for invalid id", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .get("/api/v1/orders/not-a-number")
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid order id");
    });

    it("allows user to get own order, blocks another user's order, and allows admin to get any order with products and events", async () => {
      const { user } = await createVerifiedUser({
        email: "owner-order@test.com",
      });
      const { user: other } = await createVerifiedUser({
        email: "other-order@test.com",
      });
      const { user: admin } = await createAdmin({
        email: "admin-order@test.com",
      });

      const product = await createProduct();
      const order = await createOrderWithEvent(user.id, { status: "PENDING" });
      await addProductToOrder(order.id, product.id, 2);

      const ownRes = await request(app)
        .get(`/api/v1/orders/${order.id}`)
        .set("Authorization", authHeaderFor(user.id));

      expect(ownRes.status).toBe(200);
      expect(ownRes.body.id).toBe(order.id);
      expect(Array.isArray(ownRes.body.products)).toBe(true);
      expect(Array.isArray(ownRes.body.events)).toBe(true);

      const otherRes = await request(app)
        .get(`/api/v1/orders/${order.id}`)
        .set("Authorization", authHeaderFor(other.id));

      expect(otherRes.status).toBe(404);
      expect(otherRes.body.message).toBe("Order not found");

      const adminRes = await request(app)
        .get(`/api/v1/orders/${order.id}`)
        .set("Authorization", authHeaderFor(admin.id));

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.id).toBe(order.id);
      expect(adminRes.body.products).toHaveLength(1);
      expect(adminRes.body.events).toHaveLength(1);
    });
  });

  describe("PUT /api/v1/orders/:id/cancel", () => {
    it("returns 400 for invalid id", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .put("/api/v1/orders/not-a-number/cancel")
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid order id");
    });

    it("cancels own order, creates canceled event, and returns 404 for another user's order", async () => {
      const { user } = await createVerifiedUser({
        email: "cancel-me@test.com",
      });
      const { user: other } = await createVerifiedUser({
        email: "cancel-other@test.com",
      });

      const order = await createOrderWithEvent(user.id, { status: "PENDING" });

      const okRes = await request(app)
        .put(`/api/v1/orders/${order.id}/cancel`)
        .set("Authorization", authHeaderFor(user.id));

      expect(okRes.status).toBe(200);
      expect(okRes.body.status).toBe("CANCELED");

      const events = await prisma.orderEvent.findMany({
        where: { orderId: order.id },
        orderBy: { id: "asc" },
      });
      expect(events).toHaveLength(2);
      expect(events[1].status).toBe("CANCELED");

      const otherOrder = await createOrderWithEvent(user.id, {
        status: "PENDING",
      });

      const otherRes = await request(app)
        .put(`/api/v1/orders/${otherOrder.id}/cancel`)
        .set("Authorization", authHeaderFor(other.id));

      expect(otherRes.status).toBe(404);
      expect(otherRes.body.message).toBe("Order not found");
    });
  });

  describe("GET /api/v1/orders/index", () => {
    it("returns 403 for non-admin and returns paginated filtered orders for admin", async () => {
      const { user } = await createVerifiedUser({
        email: "nonadmin-orders@test.com",
      });
      const { user: admin } = await createAdmin({
        email: "admin-orders-index@test.com",
      });

      const orderA = await createOrder(user.id, { status: "PENDING" });
      const orderB = await createOrder(user.id, { status: "CANCELED" });
      const orderC = await createOrder(admin.id, { status: "CANCELED" });

      void orderA;
      void orderB;
      void orderC;

      const forbiddenRes = await request(app)
        .get("/api/v1/orders/index")
        .set("Authorization", authHeaderFor(user.id));

      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenRes.body.message).toBe("Forbidden: admin only");

      const res = await request(app)
        .get("/api/v1/orders/index?page=1&limit=2&status=CANCELED")
        .set("Authorization", authHeaderFor(admin.id));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(
        res.body.data.every((o: { status: string }) => o.status === "CANCELED"),
      ).toBe(true);
      expect(res.body.pagination.current).toBe(1);
      expect(res.body.pagination.limit).toBe(2);
      expect(res.body.pagination.results).toBe(2);
      expect(res.body.pagination.totalPages).toBe(1);
    });
  });

  describe("GET /api/v1/orders/users/:id", () => {
    it("returns 403 for non-admin and returns paginated filtered orders for target user to admin", async () => {
      const { user } = await createVerifiedUser({
        email: "target-user-orders@test.com",
      });
      const { user: viewer } = await createVerifiedUser({
        email: "viewer-orders@test.com",
      });
      const { user: admin } = await createAdmin({
        email: "admin-user-orders@test.com",
      });

      await createOrder(user.id, { status: "PENDING" });
      await createOrder(user.id, { status: "DELIVERED" });
      await createOrder(user.id, { status: "DELIVERED" });

      const forbiddenRes = await request(app)
        .get(`/api/v1/orders/users/${user.id}`)
        .set("Authorization", authHeaderFor(viewer.id));

      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenRes.body.message).toBe("Forbidden: admin only");

      const res = await request(app)
        .get(`/api/v1/orders/users/${user.id}?page=1&limit=2&status=DELIVERED`)
        .set("Authorization", authHeaderFor(admin.id));

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(
        res.body.data.every((o: { userId: number; status: string }) => {
          return o.userId === user.id && o.status === "DELIVERED";
        }),
      ).toBe(true);
      expect(res.body.pagination.current).toBe(1);
      expect(res.body.pagination.limit).toBe(2);
      expect(res.body.pagination.results).toBe(2);
      expect(res.body.pagination.totalPages).toBe(1);
    });
  });

  describe("PUT /api/v1/orders/:id/status", () => {
    it("returns 403 for non-admin, 400 for invalid id, 404 for missing order, and updates status with event for valid admin request", async () => {
      const { user } = await createVerifiedUser({
        email: "nonadmin-status@test.com",
      });
      const { user: admin } = await createAdmin({
        email: "admin-status@test.com",
      });
      const order = await createOrderWithEvent(user.id, { status: "PENDING" });

      const forbiddenRes = await request(app)
        .put(`/api/v1/orders/${order.id}/status`)
        .set("Authorization", authHeaderFor(user.id))
        .send({
          status: "DELIVERED",
        });

      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenRes.body.message).toBe("Forbidden: admin only");

      const invalidIdRes = await request(app)
        .put("/api/v1/orders/not-a-number/status")
        .set("Authorization", authHeaderFor(admin.id))
        .send({
          status: "DELIVERED",
        });

      expect(invalidIdRes.status).toBe(400);
      expect(invalidIdRes.body.message).toBe("Invalid order id");

      const missingRes = await request(app)
        .put("/api/v1/orders/999999/status")
        .set("Authorization", authHeaderFor(admin.id))
        .send({
          status: "DELIVERED",
        });

      expect(missingRes.status).toBe(404);
      expect(missingRes.body.message).toBe("Order not found");

      const okRes = await request(app)
        .put(`/api/v1/orders/${order.id}/status`)
        .set("Authorization", authHeaderFor(admin.id))
        .send({
          status: "DELIVERED",
        });

      expect(okRes.status).toBe(200);
      expect(okRes.body.status).toBe("DELIVERED");

      const events = await prisma.orderEvent.findMany({
        where: { orderId: order.id },
        orderBy: { id: "asc" },
      });
      expect(events).toHaveLength(2);
      expect(events[1].status).toBe("DELIVERED");
    });
  });
});
