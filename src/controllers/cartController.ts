import { Request, Response } from "express";
import createError from "http-errors";
import asyncHandler from "express-async-handler";
import { prismaClient } from "../db/prisma.js";

/**
 * @desc   Add item to cart
 * @route  api/v1/cart
 * @method POST
 * @access private
 */
export const addItemToCartCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const { productId, quantity } = req.body as {
      productId: number;
      quantity: number;
    };

    const product = await prismaClient.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });

    if (!product) {
      throw createError(404, "Product Not Found!");
    }

    const userId = req.user!.id;

    const existing = await prismaClient.cartItem.findFirst({
      where: {
        userId,
        productId: product.id,
      },
    });

    if (existing) {
      const updated = await prismaClient.cartItem.update({
        where: { id: existing.id },
        data: {
          quantity: existing.quantity + quantity,
        },
        include: { product: true },
      });

      res.status(200).json(updated);
      return;
    }

    const cart = await prismaClient.cartItem.create({
      data: {
        userId,
        productId: product.id,
        quantity,
      },
      include: { product: true },
    });

    res.status(201).json(cart);
  },
);

/**
 * @desc   Delete item from cart
 * @route  api/v1/cart/:id
 * @method DELETE
 * @access private
 */
export const deleteItemFromCartCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const cartId = Number(req.params.id);
    if (!Number.isFinite(cartId)) throw createError(400, "Invalid cart id");

    const deleted = await prismaClient.cartItem.deleteMany({
      where: {
        id: cartId,
        userId: req.user!.id,
      },
    });

    if (!deleted.count) {
      throw createError(404, "This item does not exist in your cart");
    }

    res.status(200).json({
      success: true,
      message: "Item has been removed from cart",
    });
  },
);

/**
 * @desc   Change quantity
 * @route  api/v1/cart/:id
 * @method PUT
 * @access private
 */
export const changeQuantityCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const cartId = Number(req.params.id);
    if (!Number.isFinite(cartId)) throw createError(400, "Invalid cart id");

    const updated = await prismaClient.cartItem.updateMany({
      where: {
        id: cartId,
        userId: req.user!.id,
      },
      data: {
        quantity: req.body.quantity,
      },
    });

    if (!updated.count) {
      throw createError(404, "Item does not exist in your cart");
    }

    const updatedCart = await prismaClient.cartItem.findUnique({
      where: { id: cartId },
      include: { product: true },
    });

    res.status(200).json(updatedCart);
  },
);

/**
 * @desc   Get cart
 * @route  api/v1/cart
 * @method GET
 * @access private
 */
export const getCartCtrl = asyncHandler(async (req: Request, res: Response) => {
  const cart = await prismaClient.cartItem.findMany({
    where: {
      userId: req.user!.id,
    },
    include: {
      product: true,
    },
  });

  res.status(200).json(cart);
});
