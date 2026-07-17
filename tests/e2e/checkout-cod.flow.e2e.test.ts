import request from "supertest";
import { describe, it, expect } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../helpers/prisma.js";
import { createProduct, createVerifiedUser } from "../helpers/factories.js";

describe("COD checkout E2E flow", () => {
  it("user adds address → sets default shipping → adds product to cart → creates COD order → lists orders → cancels order", async () => {
    const agent = request.agent(app);

    const { user, rawPassword } = await createVerifiedUser({
      email: "cod-e2e-user@test.com",
      password: "password123",
    });

    const product = await createProduct({
      name: "E2E Product",
      description: "E2E Description",
      price: 25,
      tags: "e2e,test",
    });

    const loginRes = await agent.post("/api/v1/auth/login").send({
      email: user.email,
      password: rawPassword,
    });

    expect(loginRes.status).toBe(200);

    const addAddressRes = await agent.post("/api/v1/users/address").send({
      lineOne: "123 E2E Street",
      lineTwo: "Apt 9",
      city: "Casablanca",
      country: "MA",
      pincode: "12345",
    });

    expect(addAddressRes.status).toBe(201);
    expect(addAddressRes.body.lineOne).toBe("123 E2E Street");
    expect(addAddressRes.body.userId).toBe(user.id);

    const addressId = addAddressRes.body.id;

    const updateUserRes = await agent.put("/api/v1/users").send({
      defaultShippingAddress: addressId,
    });

    expect(updateUserRes.status).toBe(200);
    expect(updateUserRes.body.defaultShippingAddress).toBe(addressId);

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
    });
    expect(updatedUser?.defaultShippingAddress).toBe(addressId);

    const addCartRes = await agent.post("/api/v1/cart").send({
      productId: product.id,
      quantity: 2,
    });

    expect(addCartRes.status).toBe(201);
    expect(addCartRes.body.productId).toBe(product.id);
    expect(addCartRes.body.quantity).toBe(2);

    const getCartRes = await agent.get("/api/v1/cart");

    expect(getCartRes.status).toBe(200);
    expect(getCartRes.body).toHaveLength(1);
    expect(getCartRes.body[0].productId).toBe(product.id);
    expect(getCartRes.body[0].quantity).toBe(2);
    expect(getCartRes.body[0].product).toBeTruthy();
    expect(getCartRes.body[0].product.name).toBe("E2E Product");

    const createOrderRes = await agent.post("/api/v1/orders").send({
      paymentMethod: "CASH_ON_DELIVERY",
    });

    expect(createOrderRes.status).toBe(201);
    expect(createOrderRes.body.order.userId).toBe(user.id);
    expect(createOrderRes.body.order.paymentMethod).toBe("CASH_ON_DELIVERY");
    expect(createOrderRes.body.order.paymentStatus).toBe("PENDING");
    expect(createOrderRes.body.order.status).toBe("PENDING");
    expect(createOrderRes.body.order.address).toBe(
      "123 E2E Street, Apt 9, Casablanca, MA-12345",
    );

    const orderId = createOrderRes.body.order.id;

    const dbOrder = await prisma.order.findUnique({
      where: { id: orderId },
    });
    expect(dbOrder).not.toBeNull();
    expect(Number(dbOrder!.netAmount)).toBe(50);

    const orderProducts = await prisma.orderProduct.findMany({
      where: { orderId },
    });
    expect(orderProducts).toHaveLength(1);
    expect(orderProducts[0].productId).toBe(product.id);
    expect(orderProducts[0].quantity).toBe(2);

    const orderEvents = await prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: { id: "asc" },
    });
    expect(orderEvents).toHaveLength(1);
    expect(orderEvents[0].status).toBe("PENDING");

    const cartAfterOrder = await prisma.cartItem.findMany({
      where: { userId: user.id },
    });
    expect(cartAfterOrder).toHaveLength(0);

    const listOrdersRes = await agent.get("/api/v1/orders");

    expect(listOrdersRes.status).toBe(200);
    expect(Array.isArray(listOrdersRes.body)).toBe(true);
    expect(listOrdersRes.body).toHaveLength(1);
    expect(listOrdersRes.body[0].id).toBe(orderId);
    expect(listOrdersRes.body[0].status).toBe("PENDING");

    const cancelOrderRes = await agent.put(`/api/v1/orders/${orderId}/cancel`);

    expect(cancelOrderRes.status).toBe(200);
    expect(cancelOrderRes.body.id).toBe(orderId);
    expect(cancelOrderRes.body.status).toBe("CANCELED");

    const canceledOrder = await prisma.order.findUnique({
      where: { id: orderId },
    });
    expect(canceledOrder?.status).toBe("CANCELED");

    const eventsAfterCancel = await prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: { id: "asc" },
    });
    expect(eventsAfterCancel).toHaveLength(2);
    expect(eventsAfterCancel[0].status).toBe("PENDING");
    expect(eventsAfterCancel[1].status).toBe("CANCELED");
  });
});
