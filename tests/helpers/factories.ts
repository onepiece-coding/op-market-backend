import { hashSync } from "bcrypt";
import type {
  OrderEventStatus,
  OneTimeTokenPurpose,
  PaymentMethod,
  PaymentStatus,
  Role,
} from "@prisma/client";
import { prisma } from "./prisma.js";
import { hashOneTimeToken } from "../../src/utils/authHelper.js";
import { hashToken } from "../../src/utils/tokenHelper.js";

type CreateUserInput = {
  name?: string;
  email?: string;
  password?: string;
  role?: Role;
  emailVerifiedAt?: Date | null;
  defaultShippingAddress?: number | null;
  defaultBillingAddress?: number | null;
};

type CreateAddressInput = {
  lineOne?: string;
  lineTwo?: string | null;
  city?: string;
  country?: string;
  pincode?: string;
};

type CreateProductInput = {
  name?: string;
  description?: string;
  price?: number;
  tags?: string | string[];
  imageUrl?: string | null;
  imageKey?: string | null;
};

type CreateCartItemInput = {
  quantity?: number;
};

type CreateOrderInput = {
  netAmount?: number;
  address?: string;
  status?: OrderEventStatus;
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  paymentProviderId?: string | null;
  paidAt?: Date | null;
};

type CreateOrderEventInput = {
  status?: OrderEventStatus;
};

type CreateRefreshTokenInput = {
  token?: string;
  expiresAt?: Date;
  revoked?: boolean;
};

type CreateOneTimeTokenInput = {
  purpose?: OneTimeTokenPurpose;
  rawToken?: string;
  expiresAt?: Date;
  usedAt?: Date | null;
};

let sequence = 1;

const nextSequence = () => sequence++;

export const resetFactorySequence = () => {
  sequence = 1;
};

export const createUser = async (input: CreateUserInput = {}) => {
  const n = nextSequence();
  const rawPassword = input.password ?? "password123";

  const user = await prisma.user.create({
    data: {
      name: input.name ?? `User ${n}`,
      email: input.email ?? `user${n}@test.com`,
      password: hashSync(rawPassword, 10),
      role: input.role ?? "USER",
      emailVerifiedAt:
        input.emailVerifiedAt === undefined ? null : input.emailVerifiedAt,
      defaultShippingAddress:
        input.defaultShippingAddress === undefined
          ? null
          : input.defaultShippingAddress,
      defaultBillingAddress:
        input.defaultBillingAddress === undefined
          ? null
          : input.defaultBillingAddress,
    },
  });

  return { user, rawPassword };
};

export const createVerifiedUser = async (input: CreateUserInput = {}) => {
  return createUser({
    ...input,
    emailVerifiedAt: input.emailVerifiedAt ?? new Date(),
  });
};

export const createAdmin = async (input: CreateUserInput = {}) => {
  return createVerifiedUser({
    ...input,
    role: "ADMIN",
  });
};

export const createAddress = async (
  userId: number,
  input: CreateAddressInput = {},
) => {
  return prisma.address.create({
    data: {
      userId,
      lineOne: input.lineOne ?? "123 Test Street",
      lineTwo: input.lineTwo ?? null,
      city: input.city ?? "Casablanca",
      country: input.country ?? "MA",
      pincode: input.pincode ?? "12345",
    },
  });
};

export const createProduct = async (input: CreateProductInput = {}) => {
  const n = nextSequence();

  const tagsValue = Array.isArray(input.tags)
    ? input.tags.join(",")
    : (input.tags ?? "general,test");

  return prisma.product.create({
    data: {
      name: input.name ?? `Product ${n}`,
      description: input.description ?? `Description ${n}`,
      price: input.price ?? 99.99,
      tags: tagsValue,
      imageUrl: input.imageUrl ?? null,
      imageKey: input.imageKey ?? null,
    },
  });
};

export const createCartItem = async (
  userId: number,
  productId: number,
  input: CreateCartItemInput = {},
) => {
  return prisma.cartItem.create({
    data: {
      userId,
      productId,
      quantity: input.quantity ?? 1,
    },
  });
};

export const createOrder = async (
  userId: number,
  input: CreateOrderInput = {},
) => {
  return prisma.order.create({
    data: {
      userId,
      netAmount: input.netAmount ?? 100,
      address: input.address ?? "123 Test Street, Casablanca, MA-12345",
      status: input.status ?? "PENDING",
      paymentMethod: input.paymentMethod ?? "CASH_ON_DELIVERY",
      paymentStatus: input.paymentStatus ?? "PENDING",
      paymentProviderId:
        input.paymentProviderId === undefined ? null : input.paymentProviderId,
      paidAt: input.paidAt === undefined ? null : input.paidAt,
    },
  });
};

export const createOrderEvent = async (
  orderId: number,
  input: CreateOrderEventInput = {},
) => {
  return prisma.orderEvent.create({
    data: {
      orderId,
      status: input.status ?? "PENDING",
    },
  });
};

export const createOrderWithEvent = async (
  userId: number,
  input: CreateOrderInput = {},
) => {
  const order = await createOrder(userId, input);
  await createOrderEvent(order.id, { status: input.status ?? "PENDING" });
  return order;
};

export const addProductToOrder = async (
  orderId: number,
  productId: number,
  quantity = 1,
) => {
  return prisma.orderProduct.create({
    data: {
      orderId,
      productId,
      quantity,
    },
  });
};

export const createRefreshTokenRecord = async (
  userId: number,
  input: CreateRefreshTokenInput = {},
) => {
  const rawToken =
    input.token ?? `refresh-token-${nextSequence()}-${Date.now()}`;

  const record = await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt:
        input.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revoked: input.revoked ?? false,
    },
  });

  return { record, rawToken };
};

export const createOneTimeTokenRecord = async (
  userId: number,
  input: CreateOneTimeTokenInput = {},
) => {
  const rawToken =
    input.rawToken ?? `one-time-token-${nextSequence()}-${Date.now()}`;

  const record = await prisma.oneTimeToken.create({
    data: {
      userId,
      purpose: input.purpose ?? "EMAIL_VERIFICATION",
      tokenHash: hashOneTimeToken(rawToken),
      expiresAt: input.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      usedAt: input.usedAt === undefined ? null : input.usedAt,
    },
  });

  return { record, rawToken };
};

export const setDefaultShippingAddress = async (
  userId: number,
  addressId: number,
) => {
  return prisma.user.update({
    where: { id: userId },
    data: { defaultShippingAddress: addressId },
  });
};

export const setDefaultBillingAddress = async (
  userId: number,
  addressId: number,
) => {
  return prisma.user.update({
    where: { id: userId },
    data: { defaultBillingAddress: addressId },
  });
};

export const createUserWithAddress = async (input: CreateUserInput = {}) => {
  const { user, rawPassword } = await createVerifiedUser(input);
  const address = await createAddress(user.id);
  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      defaultShippingAddress: address.id,
      defaultBillingAddress: address.id,
    },
  });

  return {
    user: updatedUser,
    rawPassword,
    address,
  };
};

export const createUserWithCart = async (cartQuantity = 1) => {
  const { user } = await createVerifiedUser();
  const product = await createProduct();
  const cartItem = await createCartItem(user.id, product.id, {
    quantity: cartQuantity,
  });

  return { user, product, cartItem };
};

export const createReadyToOrderUser = async () => {
  const { user, rawPassword, address } = await createUserWithAddress();
  const product = await createProduct();
  const cartItem = await createCartItem(user.id, product.id, { quantity: 2 });

  return {
    user,
    rawPassword,
    address,
    product,
    cartItem,
  };
};
