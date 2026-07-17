import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/services/paypalService.js", () => ({
  createPayPalOrder: vi.fn(),
  capturePayPalOrder: vi.fn(),
}));

import request from "supertest";
import app from "../../src/app.js";
import * as paypalServiceModule from "../../src/services/paypalService.js";
import { prisma } from "../helpers/prisma.js";
import {
  createAddress,
  createCartItem,
  createProduct,
  createVerifiedUser,
  setDefaultShippingAddress,
} from "../helpers/factories.js";

describe("PayPal checkout E2E flow", () => {
  beforeEach(() => {
    vi.mocked(paypalServiceModule.createPayPalOrder).mockReset();
    vi.mocked(paypalServiceModule.capturePayPalOrder).mockReset();
  });

  it("user creates PAYPAL order and captures payment successfully", async () => {
    vi.mocked(paypalServiceModule.createPayPalOrder).mockResolvedValue({
      paypalOrderId: "paypal-e2e-order-123",
      approvalUrl: "https://paypal.test/approve/paypal-e2e-order-123",
      raw: {
        id: "paypal-e2e-order-123",
        links: [
          {
            rel: "approve",
            href: "https://paypal.test/approve/paypal-e2e-order-123",
          },
        ],
      },
    });

    vi.mocked(paypalServiceModule.capturePayPalOrder).mockResolvedValue({
      status: "COMPLETED",
      id: "paypal-capture-123",
    });

    const agent = request.agent(app);

    const { user, rawPassword } = await createVerifiedUser({
      email: "paypal-e2e-user@test.com",
      password: "password123",
    });

    const product = await createProduct({
      name: "PayPal E2E Product",
      description: "PayPal flow product",
      price: 75,
      tags: "paypal,e2e",
    });

    const address = await createAddress(user.id, {
      lineOne: "456 PayPal Street",
      lineTwo: "Suite 7",
      city: "Casablanca",
      country: "MA",
      pincode: "54321",
    });

    await setDefaultShippingAddress(user.id, address.id);
    await createCartItem(user.id, product.id, { quantity: 2 });

    const loginRes = await agent.post("/api/v1/auth/login").send({
      email: user.email,
      password: rawPassword,
    });

    expect(loginRes.status).toBe(200);

    const createOrderRes = await agent.post("/api/v1/orders").send({
      paymentMethod: "PAYPAL",
    });

    expect(createOrderRes.status).toBe(201);
    expect(createOrderRes.body.order.userId).toBe(user.id);
    expect(createOrderRes.body.order.paymentMethod).toBe("PAYPAL");
    expect(createOrderRes.body.order.paymentStatus).toBe("PENDING");
    expect(createOrderRes.body.order.paymentProviderId).toBe(
      "paypal-e2e-order-123",
    );
    expect(createOrderRes.body.providerOrderId).toBe("paypal-e2e-order-123");
    expect(createOrderRes.body.approvalUrl).toBe(
      "https://paypal.test/approve/paypal-e2e-order-123",
    );

    const orderId = createOrderRes.body.order.id;

    const createdOrder = await prisma.order.findUnique({
      where: { id: orderId },
    });

    expect(createdOrder).not.toBeNull();
    expect(createdOrder?.paymentMethod).toBe("PAYPAL");
    expect(createdOrder?.paymentProviderId).toBe("paypal-e2e-order-123");
    expect(createdOrder?.paymentStatus).toBe("PENDING");
    expect(Number(createdOrder!.netAmount)).toBe(150);

    const cartAfterCreate = await prisma.cartItem.findMany({
      where: { userId: user.id },
    });
    expect(cartAfterCreate).toHaveLength(0);

    const captureRes = await agent.post(
      `/api/v1/payments/paypal/${orderId}/capture`,
    );

    expect(captureRes.status).toBe(200);
    expect(captureRes.body.message).toBe("Payment completed successfully");
    expect(captureRes.body.order.id).toBe(orderId);
    expect(captureRes.body.order.paymentStatus).toBe("COMPLETED");
    expect(captureRes.body.capture.status).toBe("COMPLETED");

    const paidOrder = await prisma.order.findUnique({
      where: { id: orderId },
    });

    expect(paidOrder).not.toBeNull();
    expect(paidOrder?.paymentStatus).toBe("COMPLETED");
    expect(paidOrder?.paidAt).not.toBeNull();

    const orderEvents = await prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: { id: "asc" },
    });

    expect(orderEvents).toHaveLength(1);
    expect(orderEvents[0].status).toBe("PENDING");
  });
});
