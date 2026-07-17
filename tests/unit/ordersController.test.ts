import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const asyncHandlerPath = "express-async-handler";
const prismaPath = "../../src/db/prisma.js";
const paypalServicePath = "../../src/services/paypalService.js";
const ordersControllerPath = "../../src/controllers/ordersController.js";

type TestUser = {
  id: number;
  role?: "ADMIN" | "USER";
  defaultShippingAddress?: number | null;
};

type TestRequest = Partial<Request> & {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  user?: TestUser;
};

function createRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;

  (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

async function loadOrdersController() {
  vi.resetModules();

  const tx = {
    cartItem: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
    address: {
      findUnique: vi.fn(),
    },
    order: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    orderEvent: {
      create: vi.fn(),
    },
  };

  const prismaClient = {
    $transaction: vi.fn(),
    order: {
      update: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  };

  const createPayPalOrder = vi.fn();

  vi.doMock(asyncHandlerPath, () => ({
    default: <T extends (...args: any[]) => any>(fn: T) => fn,
  }));

  vi.doMock(prismaPath, () => ({
    prismaClient,
  }));

  vi.doMock(paypalServicePath, () => ({
    createPayPalOrder,
  }));

  const mod = await import(ordersControllerPath);

  return {
    ...mod,
    mocks: {
      tx,
      prismaClient,
      createPayPalOrder,
    },
  };
}

describe("ordersController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("createOrderCtrl", () => {
    it("returns 400 when cart is empty", async () => {
      const { createOrderCtrl, mocks } = await loadOrdersController();

      const req = {
        body: { paymentMethod: "CASH_ON_DELIVERY" },
        user: { id: 1, defaultShippingAddress: 10 },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.cartItem.findMany.mockResolvedValue([]);
        return cb(mocks.tx);
      });

      await expect(createOrderCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Cart is empty",
      });
    });

    it("returns 400 when cart contains missing products", async () => {
      const { createOrderCtrl, mocks } = await loadOrdersController();

      const req = {
        body: { paymentMethod: "CASH_ON_DELIVERY" },
        user: { id: 1, defaultShippingAddress: 10 },
      } as TestRequest as Request;
      const res = createRes();

      const cartItems = [
        { productId: 1, quantity: 2, product: { price: 10 } },
        { productId: 2, quantity: 1, product: { price: 5 } },
      ];

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.cartItem.findMany.mockResolvedValue(cartItems);
        mocks.tx.product.findMany.mockResolvedValue([{ id: 1 }]);
        return cb(mocks.tx);
      });

      await expect(createOrderCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Some products in your cart no longer exist: 2",
      });
    });

    it("returns 400 when user has no default shipping address", async () => {
      const { createOrderCtrl, mocks } = await loadOrdersController();

      const req = {
        body: { paymentMethod: "CASH_ON_DELIVERY" },
        user: { id: 1, defaultShippingAddress: null },
      } as TestRequest as Request;
      const res = createRes();

      const cartItems = [{ productId: 1, quantity: 2, product: { price: 10 } }];

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.cartItem.findMany.mockResolvedValue(cartItems);
        mocks.tx.product.findMany.mockResolvedValue([{ id: 1 }]);
        return cb(mocks.tx);
      });

      await expect(createOrderCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "No default shipping address set",
      });
    });

    it("returns 400 when shipping address is missing", async () => {
      const { createOrderCtrl, mocks } = await loadOrdersController();

      const req = {
        body: { paymentMethod: "CASH_ON_DELIVERY" },
        user: { id: 1, defaultShippingAddress: 10 },
      } as TestRequest as Request;
      const res = createRes();

      const cartItems = [{ productId: 1, quantity: 2, product: { price: 10 } }];

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.cartItem.findMany.mockResolvedValue(cartItems);
        mocks.tx.product.findMany.mockResolvedValue([{ id: 1 }]);
        mocks.tx.address.findUnique.mockResolvedValue(null);
        return cb(mocks.tx);
      });

      await expect(createOrderCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid shipping address",
      });
    });

    it("returns 400 when shipping address belongs to another user", async () => {
      const { createOrderCtrl, mocks } = await loadOrdersController();

      const req = {
        body: { paymentMethod: "CASH_ON_DELIVERY" },
        user: { id: 1, defaultShippingAddress: 10 },
      } as TestRequest as Request;
      const res = createRes();

      const cartItems = [{ productId: 1, quantity: 2, product: { price: 10 } }];

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.cartItem.findMany.mockResolvedValue(cartItems);
        mocks.tx.product.findMany.mockResolvedValue([{ id: 1 }]);
        mocks.tx.address.findUnique.mockResolvedValue({
          id: 10,
          userId: 999,
          lineOne: "123 Main",
          lineTwo: null,
          city: "Casa",
          country: "MA",
          pincode: "20000",
        });
        return cb(mocks.tx);
      });

      await expect(createOrderCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid shipping address",
      });
    });

    it("creates a CASH_ON_DELIVERY order, creates an event, clears cart, and returns 201", async () => {
      const { createOrderCtrl, mocks } = await loadOrdersController();

      const req = {
        body: { paymentMethod: "CASH_ON_DELIVERY" },
        user: { id: 1, defaultShippingAddress: 10 },
      } as TestRequest as Request;
      const res = createRes();

      const cartItems = [
        { productId: 1, quantity: 2, product: { price: 10 } },
        { productId: 2, quantity: 1, product: { price: 5.5 } },
      ];

      const order = {
        id: 123,
        userId: 1,
        netAmount: 25.5,
        paymentMethod: "CASH_ON_DELIVERY",
      };

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.cartItem.findMany.mockResolvedValue(cartItems);
        mocks.tx.product.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
        mocks.tx.address.findUnique.mockResolvedValue({
          id: 10,
          userId: 1,
          lineOne: "123 Main",
          lineTwo: "Apt 4",
          city: "Casa",
          country: "MA",
          pincode: "20000",
        });
        mocks.tx.order.create.mockResolvedValue(order);
        mocks.tx.orderEvent.create.mockResolvedValue({ id: 1, orderId: 123 });
        mocks.tx.cartItem.deleteMany.mockResolvedValue({ count: 2 });
        return cb(mocks.tx);
      });

      await createOrderCtrl(req, res);

      expect(mocks.tx.order.create).toHaveBeenCalledWith({
        data: {
          userId: 1,
          netAmount: 25.5,
          address: "123 Main, Apt 4, Casa, MA-20000",
          paymentMethod: "CASH_ON_DELIVERY",
          paymentStatus: "PENDING",
          products: {
            create: [
              { productId: 1, quantity: 2 },
              { productId: 2, quantity: 1 },
            ],
          },
        },
      });
      expect(mocks.tx.orderEvent.create).toHaveBeenCalledWith({
        data: {
          orderId: 123,
        },
      });
      expect(mocks.tx.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { userId: 1 },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        order,
      });
    });

    it("creates a PAYPAL order, starts PayPal checkout, updates provider id, and returns approval data", async () => {
      const { createOrderCtrl, mocks } = await loadOrdersController();

      const req = {
        body: { paymentMethod: "PAYPAL" },
        user: { id: 1, defaultShippingAddress: 10 },
      } as TestRequest as Request;
      const res = createRes();

      const createdOrder = {
        id: 123,
        userId: 1,
        netAmount: 25.5,
        paymentMethod: "PAYPAL",
      };

      const updatedOrder = {
        ...createdOrder,
        paymentProviderId: "pp-123",
      };

      const cartItems = [
        { productId: 1, quantity: 2, product: { price: 10 } },
        { productId: 2, quantity: 1, product: { price: 5.5 } },
      ];

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.cartItem.findMany.mockResolvedValue(cartItems);
        mocks.tx.product.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
        mocks.tx.address.findUnique.mockResolvedValue({
          id: 10,
          userId: 1,
          lineOne: "123 Main",
          lineTwo: null,
          city: "Casa",
          country: "MA",
          pincode: "20000",
        });
        mocks.tx.order.create.mockResolvedValue(createdOrder);
        mocks.tx.orderEvent.create.mockResolvedValue({ id: 1, orderId: 123 });
        mocks.tx.cartItem.deleteMany.mockResolvedValue({ count: 2 });
        return cb(mocks.tx);
      });

      mocks.createPayPalOrder.mockResolvedValue({
        paypalOrderId: "pp-123",
        approvalUrl: "https://paypal.test/approve/pp-123",
      });
      mocks.prismaClient.order.update.mockResolvedValue(updatedOrder);

      await createOrderCtrl(req, res);

      expect(mocks.createPayPalOrder).toHaveBeenCalledWith(25.5, 123);
      expect(mocks.prismaClient.order.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: {
          paymentProviderId: "pp-123",
        },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        order: updatedOrder,
        approvalUrl: "https://paypal.test/approve/pp-123",
        providerOrderId: "pp-123",
      });
    });

    it("marks payment as FAILED and returns warning when PayPal startup fails after order creation", async () => {
      const { createOrderCtrl, mocks } = await loadOrdersController();

      const req = {
        body: { paymentMethod: "PAYPAL" },
        user: { id: 1, defaultShippingAddress: 10 },
      } as TestRequest as Request;
      const res = createRes();

      const createdOrder = {
        id: 123,
        userId: 1,
        netAmount: 25.5,
        paymentMethod: "PAYPAL",
      };

      const cartItems = [
        { productId: 1, quantity: 2, product: { price: 10 } },
        { productId: 2, quantity: 1, product: { price: 5.5 } },
      ];

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.cartItem.findMany.mockResolvedValue(cartItems);
        mocks.tx.product.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
        mocks.tx.address.findUnique.mockResolvedValue({
          id: 10,
          userId: 1,
          lineOne: "123 Main",
          lineTwo: null,
          city: "Casa",
          country: "MA",
          pincode: "20000",
        });
        mocks.tx.order.create.mockResolvedValue(createdOrder);
        mocks.tx.orderEvent.create.mockResolvedValue({ id: 1, orderId: 123 });
        mocks.tx.cartItem.deleteMany.mockResolvedValue({ count: 2 });
        return cb(mocks.tx);
      });

      mocks.createPayPalOrder.mockRejectedValue(new Error("paypal down"));
      mocks.prismaClient.order.update.mockResolvedValue({
        ...createdOrder,
        paymentStatus: "FAILED",
      });

      await createOrderCtrl(req, res);

      expect(mocks.prismaClient.order.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: {
          paymentStatus: "FAILED",
        },
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        order: createdOrder,
        warning:
          "Order was created, but PayPal checkout could not be started. You can retry later or use cash on delivery.",
      });
    });
  });

  describe("cancelOrderCtrl", () => {
    it("returns 400 for invalid id", async () => {
      const { cancelOrderCtrl, mocks } = await loadOrdersController();

      const req = {
        params: { id: "abc" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        return cb(mocks.tx);
      });

      await expect(cancelOrderCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid order id",
      });
    });

    it("returns 404 when order is not found for this user", async () => {
      const { cancelOrderCtrl, mocks } = await loadOrdersController();

      const req = {
        params: { id: "55" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.order.updateMany.mockResolvedValue({ count: 0 });
        return cb(mocks.tx);
      });

      await expect(cancelOrderCtrl(req, res)).rejects.toMatchObject({
        statusCode: 404,
        message: "Order not found",
      });
    });

    it("updates order to CANCELED, inserts event, and returns updated order", async () => {
      const { cancelOrderCtrl, mocks } = await loadOrdersController();

      const req = {
        params: { id: "55" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      const order = {
        id: 55,
        userId: 1,
        status: "CANCELED",
      };

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.order.updateMany.mockResolvedValue({ count: 1 });
        mocks.tx.orderEvent.create.mockResolvedValue({
          id: 1,
          orderId: 55,
          status: "CANCELED",
        });
        mocks.tx.order.findUnique.mockResolvedValue(order);
        return cb(mocks.tx);
      });

      await cancelOrderCtrl(req, res);

      expect(mocks.tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: 55, userId: 1 },
        data: { status: "CANCELED" },
      });
      expect(mocks.tx.orderEvent.create).toHaveBeenCalledWith({
        data: { orderId: 55, status: "CANCELED" },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(order);
    });
  });

  describe("changeStatusCtrl", () => {
    it("returns 400 for invalid id", async () => {
      const { changeStatusCtrl, mocks } = await loadOrdersController();

      const req = {
        params: { id: "abc" },
        body: { status: "DELIVERED" },
        user: { id: 1, role: "ADMIN" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        return cb(mocks.tx);
      });

      await expect(changeStatusCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid order id",
      });
    });

    it("returns 404 when order does not exist", async () => {
      const { changeStatusCtrl, mocks } = await loadOrdersController();

      const req = {
        params: { id: "77" },
        body: { status: "DELIVERED" },
        user: { id: 1, role: "ADMIN" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.order.update.mockRejectedValue(new Error("not found"));
        return cb(mocks.tx);
      });

      await expect(changeStatusCtrl(req, res)).rejects.toMatchObject({
        statusCode: 404,
        message: "Order not found",
      });
    });

    it("updates order status, inserts matching event, and returns updated order", async () => {
      const { changeStatusCtrl, mocks } = await loadOrdersController();

      const req = {
        params: { id: "77" },
        body: { status: "DELIVERED" },
        user: { id: 1, role: "ADMIN" },
      } as TestRequest as Request;
      const res = createRes();

      const updatedOrder = {
        id: 77,
        status: "DELIVERED",
      };

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.order.update.mockResolvedValue(updatedOrder);
        mocks.tx.orderEvent.create.mockResolvedValue({
          id: 1,
          orderId: 77,
          status: "DELIVERED",
        });
        return cb(mocks.tx);
      });

      await changeStatusCtrl(req, res);

      expect(mocks.tx.order.update).toHaveBeenCalledWith({
        where: { id: 77 },
        data: { status: "DELIVERED" },
      });
      expect(mocks.tx.orderEvent.create).toHaveBeenCalledWith({
        data: {
          orderId: 77,
          status: "DELIVERED",
        },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(updatedOrder);
    });
  });
});
