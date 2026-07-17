import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const asyncHandlerPath = "express-async-handler";
const prismaPath = "../../src/db/prisma.js";
const paypalServicePath = "../../src/services/paypalService.js";
const paymentsControllerPath = "../../src/controllers/paymentsController.js";

type TestUser = {
  id: number;
  role?: "ADMIN" | "USER";
};

type TestRequest = Partial<Request> & {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
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

async function loadPaymentsController() {
  vi.resetModules();

  const prismaClient = {
    order: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };

  const createPayPalOrder = vi.fn();
  const capturePayPalOrder = vi.fn();

  vi.doMock(asyncHandlerPath, () => ({
    default: <T extends (...args: any[]) => any>(fn: T) => fn,
  }));

  vi.doMock(prismaPath, () => ({
    prismaClient,
  }));

  vi.doMock(paypalServicePath, () => ({
    createPayPalOrder,
    capturePayPalOrder,
  }));

  const mod = await import(paymentsControllerPath);

  return {
    ...mod,
    mocks: {
      prismaClient,
      createPayPalOrder,
      capturePayPalOrder,
    },
  };
}

describe("paymentsController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("retryPayPalPaymentCtrl", () => {
    it("returns 400 for invalid order id", async () => {
      const { retryPayPalPaymentCtrl } = await loadPaymentsController();

      const req = {
        params: { id: "abc" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      await expect(retryPayPalPaymentCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid order id",
      });
    });

    it("returns 404 when order is not found for current user", async () => {
      const { retryPayPalPaymentCtrl, mocks } = await loadPaymentsController();

      const req = {
        params: { id: "10" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.order.findFirst.mockResolvedValue(null);

      await expect(retryPayPalPaymentCtrl(req, res)).rejects.toMatchObject({
        statusCode: 404,
        message: "Order not found",
      });
    });

    it("returns 400 when order is not PayPal", async () => {
      const { retryPayPalPaymentCtrl, mocks } = await loadPaymentsController();

      const req = {
        params: { id: "10" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.order.findFirst.mockResolvedValue({
        id: 10,
        netAmount: 50,
        paymentMethod: "CASH_ON_DELIVERY",
        paymentStatus: "PENDING",
        paymentProviderId: null,
        status: "PENDING",
      });

      await expect(retryPayPalPaymentCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "This order is not a PayPal order",
      });
    });

    it("returns 400 when order is canceled", async () => {
      const { retryPayPalPaymentCtrl, mocks } = await loadPaymentsController();

      const req = {
        params: { id: "10" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.order.findFirst.mockResolvedValue({
        id: 10,
        netAmount: 50,
        paymentMethod: "PAYPAL",
        paymentStatus: "PENDING",
        paymentProviderId: null,
        status: "CANCELED",
      });

      await expect(retryPayPalPaymentCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Canceled orders cannot be retried",
      });
    });

    it("returns 400 when order is already paid", async () => {
      const { retryPayPalPaymentCtrl, mocks } = await loadPaymentsController();

      const req = {
        params: { id: "10" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.order.findFirst.mockResolvedValue({
        id: 10,
        netAmount: 50,
        paymentMethod: "PAYPAL",
        paymentStatus: "COMPLETED",
        paymentProviderId: "pp-old",
        status: "PENDING",
      });

      await expect(retryPayPalPaymentCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "This order is already paid",
      });
    });

    it("returns 400 when order amount is invalid or non-positive", async () => {
      const { retryPayPalPaymentCtrl, mocks } = await loadPaymentsController();

      const req = {
        params: { id: "10" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.order.findFirst.mockResolvedValue({
        id: 10,
        netAmount: 0,
        paymentMethod: "PAYPAL",
        paymentStatus: "PENDING",
        paymentProviderId: null,
        status: "PENDING",
      });

      await expect(retryPayPalPaymentCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid order amount",
      });
    });

    it("returns 500 when PayPal service does not return approvalUrl", async () => {
      const { retryPayPalPaymentCtrl, mocks } = await loadPaymentsController();

      const req = {
        params: { id: "10" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.order.findFirst.mockResolvedValue({
        id: 10,
        netAmount: 50,
        paymentMethod: "PAYPAL",
        paymentStatus: "PENDING",
        paymentProviderId: "pp-old",
        status: "PENDING",
      });

      mocks.createPayPalOrder.mockResolvedValue({
        paypalOrderId: "pp-new",
        approvalUrl: "",
      });

      await expect(retryPayPalPaymentCtrl(req, res)).rejects.toMatchObject({
        statusCode: 500,
        message: "PayPal approval URL was not returned",
      });
    });

    it("recreates PayPal order, updates provider id and paymentStatus, and returns 200", async () => {
      const { retryPayPalPaymentCtrl, mocks } = await loadPaymentsController();

      const req = {
        params: { id: "10" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      const updatedOrder = {
        id: 10,
        netAmount: 50,
        paymentMethod: "PAYPAL",
        paymentStatus: "PENDING",
        paymentProviderId: "pp-new",
        status: "PENDING",
      };

      mocks.prismaClient.order.findFirst.mockResolvedValue({
        id: 10,
        netAmount: 50,
        paymentMethod: "PAYPAL",
        paymentStatus: "FAILED",
        paymentProviderId: "pp-old",
        status: "PENDING",
      });

      mocks.createPayPalOrder.mockResolvedValue({
        paypalOrderId: "pp-new",
        approvalUrl: "https://paypal.test/approve/pp-new",
      });

      mocks.prismaClient.order.update.mockResolvedValue(updatedOrder);

      await retryPayPalPaymentCtrl(req, res);

      expect(mocks.createPayPalOrder).toHaveBeenCalledWith(50, 10);
      expect(mocks.prismaClient.order.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          paymentProviderId: "pp-new",
          paymentStatus: "PENDING",
        },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "PayPal checkout restarted successfully",
        order: updatedOrder,
        approvalUrl: "https://paypal.test/approve/pp-new",
        providerOrderId: "pp-new",
      });
    });
  });

  describe("capturePayPalPaymentCtrl", () => {
    it("returns 400 for invalid order id", async () => {
      const { capturePayPalPaymentCtrl } = await loadPaymentsController();

      const req = {
        params: { id: "abc" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      await expect(capturePayPalPaymentCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid order id",
      });
    });

    it("returns 404 when order is not found for current user", async () => {
      const { capturePayPalPaymentCtrl, mocks } =
        await loadPaymentsController();

      const req = {
        params: { id: "15" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.order.findFirst.mockResolvedValue(null);

      await expect(capturePayPalPaymentCtrl(req, res)).rejects.toMatchObject({
        statusCode: 404,
        message: "Order not found",
      });
    });

    it("returns 400 when order is not PayPal", async () => {
      const { capturePayPalPaymentCtrl, mocks } =
        await loadPaymentsController();

      const req = {
        params: { id: "15" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.order.findFirst.mockResolvedValue({
        id: 15,
        paymentMethod: "CASH_ON_DELIVERY",
        paymentStatus: "PENDING",
        paymentProviderId: null,
      });

      await expect(capturePayPalPaymentCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "This order is not a PayPal order",
      });
    });

    it("returns 200 and current order when payment is already completed", async () => {
      const { capturePayPalPaymentCtrl, mocks } =
        await loadPaymentsController();

      const req = {
        params: { id: "15" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      const currentOrder = {
        id: 15,
        paymentMethod: "PAYPAL",
        paymentStatus: "COMPLETED",
        paymentProviderId: "pp-123",
      };

      mocks.prismaClient.order.findFirst.mockResolvedValue({
        id: 15,
        paymentMethod: "PAYPAL",
        paymentStatus: "COMPLETED",
        paymentProviderId: "pp-123",
      });
      mocks.prismaClient.order.findUnique.mockResolvedValue(currentOrder);

      await capturePayPalPaymentCtrl(req, res);

      expect(mocks.capturePayPalOrder).not.toHaveBeenCalled();
      expect(mocks.prismaClient.order.findUnique).toHaveBeenCalledWith({
        where: { id: 15 },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Payment already completed",
        order: currentOrder,
      });
    });

    it("returns 400 when paymentProviderId is missing", async () => {
      const { capturePayPalPaymentCtrl, mocks } =
        await loadPaymentsController();

      const req = {
        params: { id: "15" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.order.findFirst.mockResolvedValue({
        id: 15,
        paymentMethod: "PAYPAL",
        paymentStatus: "PENDING",
        paymentProviderId: null,
      });

      await expect(capturePayPalPaymentCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Missing PayPal order id",
      });
    });

    it("marks payment FAILED and returns 400 when capture throws", async () => {
      const { capturePayPalPaymentCtrl, mocks } =
        await loadPaymentsController();

      const req = {
        params: { id: "15" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.order.findFirst.mockResolvedValue({
        id: 15,
        paymentMethod: "PAYPAL",
        paymentStatus: "PENDING",
        paymentProviderId: "pp-123",
      });

      mocks.capturePayPalOrder.mockRejectedValue(new Error("capture failed"));
      mocks.prismaClient.order.update.mockResolvedValue({
        id: 15,
        paymentStatus: "FAILED",
      });

      await expect(capturePayPalPaymentCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Unable to capture PayPal payment",
      });

      expect(mocks.prismaClient.order.update).toHaveBeenCalledWith({
        where: { id: 15 },
        data: { paymentStatus: "FAILED" },
      });
    });

    it("marks payment FAILED and returns 400 when PayPal status is not COMPLETED", async () => {
      const { capturePayPalPaymentCtrl, mocks } =
        await loadPaymentsController();

      const req = {
        params: { id: "15" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.order.findFirst.mockResolvedValue({
        id: 15,
        paymentMethod: "PAYPAL",
        paymentStatus: "PENDING",
        paymentProviderId: "pp-123",
      });

      mocks.capturePayPalOrder.mockResolvedValue({
        status: "DECLINED",
      });
      mocks.prismaClient.order.update.mockResolvedValue({
        id: 15,
        paymentStatus: "FAILED",
      });

      await expect(capturePayPalPaymentCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "PayPal payment was not completed. Status: DECLINED",
      });

      expect(mocks.prismaClient.order.update).toHaveBeenCalledWith({
        where: { id: 15 },
        data: { paymentStatus: "FAILED" },
      });
    });

    it("marks payment COMPLETED, sets paidAt, and returns 200 with capture payload", async () => {
      const { capturePayPalPaymentCtrl, mocks } =
        await loadPaymentsController();

      const req = {
        params: { id: "15" },
        user: { id: 1 },
      } as TestRequest as Request;
      const res = createRes();

      const updatedOrder = {
        id: 15,
        paymentMethod: "PAYPAL",
        paymentStatus: "COMPLETED",
        paymentProviderId: "pp-123",
        paidAt: new Date("2026-04-08T10:00:00.000Z"),
      };

      const capture = {
        status: "COMPLETED",
        id: "cap-1",
      };

      mocks.prismaClient.order.findFirst.mockResolvedValue({
        id: 15,
        paymentMethod: "PAYPAL",
        paymentStatus: "PENDING",
        paymentProviderId: "pp-123",
      });

      mocks.capturePayPalOrder.mockResolvedValue(capture);
      mocks.prismaClient.order.update.mockResolvedValue(updatedOrder);

      await capturePayPalPaymentCtrl(req, res);

      expect(mocks.capturePayPalOrder).toHaveBeenCalledWith("pp-123");
      expect(mocks.prismaClient.order.update).toHaveBeenCalledWith({
        where: { id: 15 },
        data: {
          paymentStatus: "COMPLETED",
          paidAt: new Date("2026-04-08T10:00:00.000Z"),
        },
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Payment completed successfully",
        order: updatedOrder,
        capture,
      });
    });
  });
});
