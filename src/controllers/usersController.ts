import { Request, Response } from "express";
import createError from "http-errors";
import asyncHandler from "express-async-handler";
import { prismaClient } from "../db/prisma.js";
import { publicUserSelect } from "../utils/publicUserSelect.js";

type UpdateUserData = {
  name?: string;
  defaultShippingAddress?: number;
  defaultBillingAddress?: number;
};

/**
 * @desc   Add new address
 * @route  api/v1/users/address
 * @method POST
 * @access private
 */
export const addAddressCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const address = await prismaClient.address.create({
      data: {
        ...req.body,
        userId: req.user!.id,
      },
    });

    res.status(201).json(address);
  },
);

/**
 * @desc   List all addresses
 * @route  api/v1/users/address
 * @method GET
 * @access private
 */
export const listAddressesCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const addresses = await prismaClient.address.findMany({
      where: { userId: req.user!.id },
    });

    res.status(200).json(addresses);
  },
);

/**
 * @desc   Delete an address
 * @route  api/v1/users/address/:id
 * @method DELETE
 * @access private
 */
export const deleteAddressCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const addressId = Number(req.params.id);
    if (!Number.isFinite(addressId))
      throw createError(400, "Invalid address id");

    const deleted = await prismaClient.address.deleteMany({
      where: {
        id: addressId,
        userId: req.user!.id,
      },
    });

    if (!deleted.count) {
      throw createError(404, "Address not found!");
    }

    res.status(200).json({
      status: true,
      message: "Address deleted successfully",
    });
  },
);

/**
 * @desc   Update User
 * @route  api/v1/users
 * @method PUT
 * @access private
 */
export const updateUserCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    if (req.body.defaultShippingAddress !== undefined) {
      const shippingAddress = await prismaClient.address.findUniqueOrThrow({
        where: { id: req.body.defaultShippingAddress },
      });

      if (shippingAddress.userId !== req.user!.id) {
        throw createError(400, "Address does not belong to user!");
      }
    }

    if (req.body.defaultBillingAddress !== undefined) {
      const billingAddress = await prismaClient.address.findUniqueOrThrow({
        where: { id: req.body.defaultBillingAddress },
      });

      if (billingAddress.userId !== req.user!.id) {
        throw createError(400, "Address does not belong to user!");
      }
    }

    const updateData: UpdateUserData = {};

    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.defaultShippingAddress !== undefined) {
      updateData.defaultShippingAddress = req.body.defaultShippingAddress;
    }
    if (req.body.defaultBillingAddress !== undefined) {
      updateData.defaultBillingAddress = req.body.defaultBillingAddress;
    }

    const updatedUser = await prismaClient.user.update({
      where: { id: req.user!.id },
      data: updateData,
      select: publicUserSelect,
    });

    res.status(200).json(updatedUser);
  },
);

/**
 * @desc   List All Users
 * @route  api/v1/users
 * @method get
 * @access private(admin only)
 */
export const listUsersCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const { page: pageParam, limit: limitParam } = req.query as {
      page?: string;
      limit?: string;
    };

    const page = Math.max(parseInt(String(pageParam), 10) || 1, 1);
    const limit = Math.max(parseInt(String(limitParam), 10) || 5, 1);
    const skip = (page - 1) * limit;

    const users = await prismaClient.user.findMany({
      skip,
      take: limit,
      select: publicUserSelect,
    });

    const total = await prismaClient.user.count();
    const pageCount = Math.ceil(total / limit);

    res.status(200).json({
      data: users,
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
 * @desc   Get User By Id
 * @route  api/v1/users/:id
 * @method get
 * @access private(admin only)
 */
export const getUserByIdCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw createError(400, "Invalid user id");

    const user = await prismaClient.user.findUnique({
      where: { id },
      select: {
        ...publicUserSelect,
        addresses: true,
      },
    });

    if (!user) {
      throw createError(404, "User Not Found!");
    }

    res.status(200).json(user);
  },
);

/**
 * @desc   Change User Role
 * @route  api/v1/users/:id/role
 * @method put
 * @access private(admin only)
 */
export const changeUserRoleCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    try {
      const user = await prismaClient.user.update({
        where: {
          id: Number(req.params.id),
        },
        data: {
          role: req.body.role,
        },
        select: publicUserSelect,
      });

      res.status(200).json(user);
    } catch {
      throw createError(404, "User Not Found!");
    }
  },
);
