import { prisma } from "./prisma.js";

export const findUserByEmail = async (email: string) => {
  return prisma.user.findUnique({
    where: { email },
  });
};

export const findUserById = async (id: number) => {
  return prisma.user.findUnique({
    where: { id },
  });
};

export const listRefreshTokensForUser = async (userId: number) => {
  return prisma.refreshToken.findMany({
    where: { userId },
    orderBy: { id: "asc" },
  });
};

export const listOneTimeTokensForUser = async (userId: number) => {
  return prisma.oneTimeToken.findMany({
    where: { userId },
    orderBy: { id: "asc" },
  });
};

export const listAddressesForUser = async (userId: number) => {
  return prisma.address.findMany({
    where: { userId },
    orderBy: { id: "asc" },
  });
};

export const listCartItemsForUser = async (userId: number) => {
  return prisma.cartItem.findMany({
    where: { userId },
    orderBy: { id: "asc" },
    include: { product: true },
  });
};

export const listOrdersForUser = async (userId: number) => {
  return prisma.order.findMany({
    where: { userId },
    orderBy: { id: "asc" },
  });
};

export const listOrderEvents = async (orderId: number) => {
  return prisma.orderEvent.findMany({
    where: { orderId },
    orderBy: { id: "asc" },
  });
};

export const listOrderProducts = async (orderId: number) => {
  return prisma.orderProduct.findMany({
    where: { orderId },
    orderBy: { id: "asc" },
  });
};

export const findProductById = async (id: number) => {
  return prisma.product.findUnique({
    where: { id },
  });
};

export const countUsers = async () => prisma.user.count();
export const countProducts = async () => prisma.product.count();
export const countOrders = async () => prisma.order.count();
export const countCartItems = async () => prisma.cartItem.count();
export const countAddresses = async () => prisma.address.count();
