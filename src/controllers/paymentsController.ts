import { Request, Response } from "express";
import createError from "http-errors";
import asyncHandler from "express-async-handler";
import { prismaClient } from "../db/prisma.js";
import {
  capturePayPalOrder,
  createPayPalOrder,
} from "../services/paypalService.js";

/**
 * @desc   Retry Paypal Payement
 * @route  api/v1/payments/paypal/:id/retry
 * @method POST
 * @access private
 */
export const retryPayPalPaymentCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const orderId = Number(req.params.id);
    if (!Number.isFinite(orderId)) {
      throw createError(400, "Invalid order id");
    }

    const order = await prismaClient.order.findFirst({
      where: {
        id: orderId,
        userId: req.user!.id,
      },
      select: {
        id: true,
        netAmount: true,
        paymentMethod: true,
        paymentStatus: true,
        paymentProviderId: true,
        status: true,
      },
    });

    if (!order) {
      throw createError(404, "Order not found");
    }

    if (order.paymentMethod !== "PAYPAL") {
      throw createError(400, "This order is not a PayPal order");
    }

    if (order.status === "CANCELED") {
      throw createError(400, "Canceled orders cannot be retried");
    }

    if (order.paymentStatus === "COMPLETED") {
      throw createError(400, "This order is already paid");
    }

    const amount = Number(order.netAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw createError(400, "Invalid order amount");
    }

    const paypal = await createPayPalOrder(amount, order.id);

    if (!paypal.approvalUrl) {
      throw createError(500, "PayPal approval URL was not returned");
    }

    const updatedOrder = await prismaClient.order.update({
      where: { id: order.id },
      data: {
        paymentProviderId: paypal.paypalOrderId,
        paymentStatus: "PENDING",
      },
    });

    res.status(200).json({
      message: "PayPal checkout restarted successfully",
      order: updatedOrder,
      approvalUrl: paypal.approvalUrl,
      providerOrderId: paypal.paypalOrderId,
    });
  },
);

/**
 * @desc   Capture Paypal Payement
 * @route  api/v1/payments/paypal/:id/capture
 * @method POST
 * @access private
 */
export const capturePayPalPaymentCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const orderId = Number(req.params.id);
    if (!Number.isFinite(orderId)) {
      throw createError(400, "Invalid order id");
    }

    const order = await prismaClient.order.findFirst({
      where: {
        id: orderId,
        userId: req.user!.id,
      },
      select: {
        id: true,
        paymentMethod: true,
        paymentStatus: true,
        paymentProviderId: true,
      },
    });

    if (!order) {
      throw createError(404, "Order not found");
    }

    if (order.paymentMethod !== "PAYPAL") {
      throw createError(400, "This order is not a PayPal order");
    }

    if (order.paymentStatus === "COMPLETED") {
      const currentOrder = await prismaClient.order.findUnique({
        where: { id: order.id },
      });

      res.status(200).json({
        message: "Payment already completed",
        order: currentOrder,
      });
      return;
    }

    if (!order.paymentProviderId) {
      throw createError(400, "Missing PayPal order id");
    }

    let capture: Record<string, unknown>;
    try {
      capture = await capturePayPalOrder(order.paymentProviderId);
    } catch {
      await prismaClient.order.update({
        where: { id: order.id },
        data: { paymentStatus: "FAILED" },
      });

      throw createError(400, "Unable to capture PayPal payment");
    }

    const captureStatus = String(capture?.status ?? "").toUpperCase();

    if (captureStatus !== "COMPLETED") {
      await prismaClient.order.update({
        where: { id: order.id },
        data: { paymentStatus: "FAILED" },
      });

      throw createError(
        400,
        `PayPal payment was not completed. Status: ${captureStatus || "UNKNOWN"}`,
      );
    }

    const updatedOrder = await prismaClient.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: "COMPLETED",
        paidAt: new Date(),
      },
    });

    res.status(200).json({
      message: "Payment completed successfully",
      order: updatedOrder,
      capture,
    });
  },
);
