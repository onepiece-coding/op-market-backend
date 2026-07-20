import { Request, Response } from "express";
import createError from "http-errors";
import asyncHandler from "express-async-handler";
import { prismaClient } from "../db/prisma.js";
import { createPayPalOrder } from "../services/paypalService.js";

type PaymentMethod = "CASH_ON_DELIVERY" | "PAYPAL";

type OrderStatus =
  | "PENDING"
  | "ACCEPTED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELED";

type OrderWhere = {
  userId?: number;
  status?: OrderStatus;
};

const isOrderStatus = (value: unknown): value is OrderStatus => {
  return (
    value === "PENDING" ||
    value === "ACCEPTED" ||
    value === "OUT_FOR_DELIVERY" ||
    value === "DELIVERED" ||
    value === "CANCELED"
  );
};

const orderProductInclude = {
  products: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          price: true,
          imageUrl: true,
        },
      },
    },
  },
};

/**
 * @desc   Create Order
 * @route  api/v1/orders
 * @method POST
 * @access private
 */
export const createOrderCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const paymentMethod = req.body.paymentMethod as PaymentMethod;
    const userId = req.user!.id;

    const { order, amount } = await prismaClient.$transaction(async (tx) => {
      const cartItems = await tx.cartItem.findMany({
        where: { userId },
        include: { product: true },
      });

      if (cartItems.length === 0) {
        throw createError(400, "Cart is empty");
      }

      const productIds = [...new Set(cartItems.map((item) => item.productId))];

      const existingProducts = await tx.product.findMany({
        where: {
          id: {
            in: productIds,
          },
        },
        select: {
          id: true,
        },
      });

      const existingProductIds = new Set(existingProducts.map((p) => p.id));

      const missingProductIds = productIds.filter(
        (id) => !existingProductIds.has(id),
      );

      if (missingProductIds.length > 0) {
        throw createError(
          400,
          `Some products in your cart no longer exist: ${missingProductIds.join(", ")}`,
        );
      }

      if (!req.user!.defaultShippingAddress) {
        throw createError(400, "No default shipping address set");
      }

      const address = await tx.address.findUnique({
        where: { id: req.user!.defaultShippingAddress },
      });

      if (!address || address.userId !== userId) {
        throw createError(400, "Invalid shipping address");
      }

      const formattedAddress = [
        address.lineOne,
        address.lineTwo,
        address.city,
        `${address.country}-${address.pincode}`,
      ]
        .filter(Boolean)
        .join(", ");

      const amount = cartItems.reduce((sum, cart) => {
        return sum + cart.quantity * Number(cart.product.price);
      }, 0);

      const order = await tx.order.create({
        data: {
          userId,
          netAmount: amount,
          address: formattedAddress,
          paymentMethod,
          paymentStatus: "PENDING",
          products: {
            create: cartItems.map((cart) => ({
              productId: cart.productId,
              quantity: cart.quantity,
            })),
          },
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
        },
      });

      await tx.cartItem.deleteMany({
        where: { userId },
      });

      return { order, amount };
    });

    if (paymentMethod === "CASH_ON_DELIVERY") {
      res.status(201).json({
        order,
      });
      return;
    }

    try {
      const paypal = await createPayPalOrder(Number(amount), order.id);

      const updatedOrder = await prismaClient.order.update({
        where: { id: order.id },
        data: {
          paymentProviderId: paypal.paypalOrderId,
        },
      });

      res.status(201).json({
        order: updatedOrder,
        approvalUrl: paypal.approvalUrl,
        providerOrderId: paypal.paypalOrderId,
      });
    } catch (_error) {
      await prismaClient.order.update({
        where: { id: order.id },
        data: {
          paymentStatus: "FAILED",
        },
      });

      res.status(201).json({
        order,
        warning:
          "Order was created, but PayPal checkout could not be started. You can retry later or use cash on delivery.",
      });
    }
  },
);

/**
 * @desc   List User Orders
 * @route  api/v1/orders
 * @method GET
 * @access private
 */
export const listOrdersCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const orders = await prismaClient.order.findMany({
      where: {
        userId: req.user!.id,
      },
      include: orderProductInclude,
    });

    res.status(200).json(orders);
  },
);

/**
 * @desc   Cancel Order
 * @route  api/v1/orders/:id/cancel
 * @method PUT
 * @access private
 */
export const cancelOrderCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    await prismaClient.$transaction(async (tx) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) throw createError(400, "Invalid order id");

      const updateResult = await tx.order.updateMany({
        where: { id, userId: req.user!.id },
        data: { status: "CANCELED" },
      });

      if (!updateResult.count) throw createError(404, "Order not found");

      await tx.orderEvent.create({
        data: { orderId: id, status: "CANCELED" },
      });

      const order = await tx.order.findUnique({ where: { id } });
      res.status(200).json(order);
    });
  },
);

/**
 * @desc   Get Order By Id
 * @route  api/v1/orders/:id
 * @method GET
 * @access private
 */
export const getOrderByIdCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw createError(400, "Invalid order id");

    const isAdmin = req.user?.role === "ADMIN";

    const order = isAdmin
      ? await prismaClient.order.findUnique({
          where: { id },
          include: {
            ...orderProductInclude,
            events: true,
          },
        })
      : await prismaClient.order.findFirst({
          where: {
            id,
            userId: req.user!.id,
          },
          include: {
            ...orderProductInclude,
            events: true,
          },
        });

    if (!order) {
      throw createError(404, "Order not found");
    }

    res.status(200).json(order);
  },
);

/**
 * @desc   List All Orders
 * @route  api/v1/orders/index
 * @method GET
 * @access private(admin only)
 */
export const listAllOrdersCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      page: pageParam,
      limit: limitParam,
      status: rawStatus,
    } = req.query as { [key: string]: unknown };

    const page = Math.max(parseInt(String(pageParam), 10) || 1, 1);
    const limit = Math.max(parseInt(String(limitParam), 10) || 5, 1);
    const skip = (page - 1) * limit;

    const status =
      typeof rawStatus === "string" && isOrderStatus(rawStatus)
        ? rawStatus
        : undefined;

    const whereClause: OrderWhere = status ? { status } : {};

    const total = await prismaClient.order.count({ where: whereClause });

    const orders = await prismaClient.order.findMany({
      where: whereClause,
      skip,
      take: limit,
      include: {
        user: {
          omit: {
            password: true, // Hides the password field from the user object
          },
        },
      },
    });

    const pageCount = Math.ceil(total / limit);

    res.status(200).json({
      data: orders,
      pagination: {
        current: page,
        limit,
        totalPages: pageCount,
        results: total,
      },
    });
  },
);

/**
 * @desc   Change Order Status
 * @route  api/v1/orders/:id/status
 * @method PUT
 * @access private(admin only)
 */
export const changeStatusCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    await prismaClient.$transaction(async (tx) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) throw createError(400, "Invalid order id");

      const status = req.body.status as OrderStatus;

      try {
        const order = await tx.order.update({
          where: { id },
          data: { status },
        });

        await tx.orderEvent.create({
          data: {
            orderId: order.id,
            status,
          },
        });

        res.status(200).json(order);
      } catch {
        throw createError(404, "Order not found");
      }
    });
  },
);

/**
 * @desc   List All Orders Of User
 * @route  api/v1/orders/users/:id
 * @method GET
 * @access private(admin only)
 */
export const ListUserOrdersCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const userId = Number(req.params.id);

    const {
      page: pageParam,
      limit: limitParam,
      status: rawStatus,
    } = req.query as { [key: string]: unknown };

    const page = Math.max(parseInt(String(pageParam), 10) || 1, 1);
    const limit = Math.max(parseInt(String(limitParam), 10) || 5, 1);
    const skip = (page - 1) * limit;

    const status =
      typeof rawStatus === "string" && isOrderStatus(rawStatus)
        ? rawStatus
        : undefined;

    const whereClause: OrderWhere = {
      userId,
      ...(status ? { status } : {}),
    };

    const total = await prismaClient.order.count({ where: whereClause });

    const orders = await prismaClient.order.findMany({
      where: whereClause,
      skip,
      take: limit,
      include: orderProductInclude,
    });

    const pageCount = Math.ceil(total / limit);

    res.status(200).json({
      data: orders,
      pagination: {
        current: page,
        limit,
        totalPages: pageCount,
        results: total,
      },
    });
  },
);
