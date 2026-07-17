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
import { createOrder, createVerifiedUser } from "../helpers/factories.js";

describe("Payments routes integration", () => {
  beforeEach(() => {
    vi.mocked(paypalServiceModule.createPayPalOrder).mockReset();
    vi.mocked(paypalServiceModule.capturePayPalOrder).mockReset();
  });

  describe("POST /api/v1/payments/paypal/:id/retry", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await request(app).post("/api/v1/payments/paypal/1/retry");

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Unauthorized!");
    });

    it("returns 400 for invalid order id", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/payments/paypal/not-a-number/retry")
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid order id");
    });

    it("returns 404 for missing order", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/payments/paypal/999999/retry")
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Order not found");
    });

    it("returns 400 for non-PayPal order", async () => {
      const { user } = await createVerifiedUser();
      const order = await createOrder(user.id, {
        paymentMethod: "CASH_ON_DELIVERY",
      });

      const res = await request(app)
        .post(`/api/v1/payments/paypal/${order.id}/retry`)
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("This order is not a PayPal order");
    });

    it("returns 400 for canceled order", async () => {
      const { user } = await createVerifiedUser();
      const order = await createOrder(user.id, {
        paymentMethod: "PAYPAL",
        status: "CANCELED",
      });

      const res = await request(app)
        .post(`/api/v1/payments/paypal/${order.id}/retry`)
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Canceled orders cannot be retried");
    });

    it("returns 400 for already completed order", async () => {
      const { user } = await createVerifiedUser();
      const order = await createOrder(user.id, {
        paymentMethod: "PAYPAL",
        paymentStatus: "COMPLETED",
      });

      const res = await request(app)
        .post(`/api/v1/payments/paypal/${order.id}/retry`)
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("This order is already paid");
    });

    it("returns 400 for invalid order amount", async () => {
      const { user } = await createVerifiedUser();
      const order = await createOrder(user.id, {
        paymentMethod: "PAYPAL",
        netAmount: 0,
      });

      const res = await request(app)
        .post(`/api/v1/payments/paypal/${order.id}/retry`)
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid order amount");
    });

    it("returns 500 when PayPal does not return approval URL", async () => {
      vi.mocked(paypalServiceModule.createPayPalOrder).mockResolvedValue({
        paypalOrderId: "paypal-order-no-approval",
        approvalUrl: null,
        raw: {
          id: "paypal-order-no-approval",
          links: [],
        },
      });

      const { user } = await createVerifiedUser();
      const order = await createOrder(user.id, {
        paymentMethod: "PAYPAL",
        paymentStatus: "FAILED",
        paymentProviderId: "old-provider-id",
      });

      const res = await request(app)
        .post(`/api/v1/payments/paypal/${order.id}/retry`)
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(500);
      expect(res.body.message).toBe("PayPal approval URL was not returned");
    });

    it("retries PayPal payment successfully, sets new provider id, and keeps status pending", async () => {
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
      const order = await createOrder(user.id, {
        paymentMethod: "PAYPAL",
        paymentStatus: "FAILED",
        paymentProviderId: "old-provider-id",
      });

      const res = await request(app)
        .post(`/api/v1/payments/paypal/${order.id}/retry`)
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("PayPal checkout restarted successfully");
      expect(res.body.approvalUrl).toBe(
        "https://paypal.test/approve/paypal-order-123",
      );
      expect(res.body.providerOrderId).toBe("paypal-order-123");
      expect(res.body.order.paymentProviderId).toBe("paypal-order-123");
      expect(res.body.order.paymentStatus).toBe("PENDING");

      const updated = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(updated?.paymentProviderId).toBe("paypal-order-123");
      expect(updated?.paymentStatus).toBe("PENDING");
    });
  });

  describe("POST /api/v1/payments/paypal/:id/capture", () => {
    it("returns 401 when unauthenticated", async () => {
      const res = await request(app).post("/api/v1/payments/paypal/1/capture");

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Unauthorized!");
    });

    it("returns 400 for invalid order id", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/payments/paypal/not-a-number/capture")
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid order id");
    });

    it("returns 404 for missing order", async () => {
      const { user } = await createVerifiedUser();

      const res = await request(app)
        .post("/api/v1/payments/paypal/999999/capture")
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("Order not found");
    });

    it("returns 400 for non-PayPal order", async () => {
      const { user } = await createVerifiedUser();
      const order = await createOrder(user.id, {
        paymentMethod: "CASH_ON_DELIVERY",
      });

      const res = await request(app)
        .post(`/api/v1/payments/paypal/${order.id}/capture`)
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("This order is not a PayPal order");
    });

    it("returns 200 when payment is already completed", async () => {
      const { user } = await createVerifiedUser();
      const order = await createOrder(user.id, {
        paymentMethod: "PAYPAL",
        paymentStatus: "COMPLETED",
        paymentProviderId: "paypal-order-completed",
        paidAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/payments/paypal/${order.id}/capture`)
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Payment already completed");
      expect(res.body.order.id).toBe(order.id);
      expect(res.body.order.paymentStatus).toBe("COMPLETED");
    });

    it("returns 400 when provider order id is missing", async () => {
      const { user } = await createVerifiedUser();
      const order = await createOrder(user.id, {
        paymentMethod: "PAYPAL",
        paymentStatus: "PENDING",
        paymentProviderId: null,
      });

      const res = await request(app)
        .post(`/api/v1/payments/paypal/${order.id}/capture`)
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Missing PayPal order id");
    });

    it("returns 400 and marks payment failed when capture throws", async () => {
      vi.mocked(paypalServiceModule.capturePayPalOrder).mockRejectedValue(
        new Error("Capture failed"),
      );

      const { user } = await createVerifiedUser();
      const order = await createOrder(user.id, {
        paymentMethod: "PAYPAL",
        paymentStatus: "PENDING",
        paymentProviderId: "paypal-order-throw",
      });

      const res = await request(app)
        .post(`/api/v1/payments/paypal/${order.id}/capture`)
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Unable to capture PayPal payment");

      const updated = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(updated?.paymentStatus).toBe("FAILED");
    });

    it("returns 400 and marks payment failed when capture is not completed", async () => {
      vi.mocked(paypalServiceModule.capturePayPalOrder).mockResolvedValue({
        status: "DECLINED",
      });

      const { user } = await createVerifiedUser();
      const order = await createOrder(user.id, {
        paymentMethod: "PAYPAL",
        paymentStatus: "PENDING",
        paymentProviderId: "paypal-order-declined",
      });

      const res = await request(app)
        .post(`/api/v1/payments/paypal/${order.id}/capture`)
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        "PayPal payment was not completed. Status: DECLINED",
      );

      const updated = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(updated?.paymentStatus).toBe("FAILED");
    });

    it("captures PayPal payment successfully, marks completed, and sets paidAt", async () => {
      vi.mocked(paypalServiceModule.capturePayPalOrder).mockResolvedValue({
        status: "COMPLETED",
        id: "capture-123",
      });

      const { user } = await createVerifiedUser();
      const order = await createOrder(user.id, {
        paymentMethod: "PAYPAL",
        paymentStatus: "PENDING",
        paymentProviderId: "paypal-order-success",
      });

      const res = await request(app)
        .post(`/api/v1/payments/paypal/${order.id}/capture`)
        .set("Authorization", authHeaderFor(user.id));

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("Payment completed successfully");
      expect(res.body.order.id).toBe(order.id);
      expect(res.body.order.paymentStatus).toBe("COMPLETED");
      expect(res.body.capture.status).toBe("COMPLETED");

      const updated = await prisma.order.findUnique({
        where: { id: order.id },
      });
      expect(updated?.paymentStatus).toBe("COMPLETED");
      expect(updated?.paidAt).not.toBeNull();
    });
  });
});
