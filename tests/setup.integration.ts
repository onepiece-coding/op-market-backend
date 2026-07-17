import { config } from "dotenv";
import { beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import logger from "../src/utils/logger.js";
import { resetFactorySequence } from "./helpers/factories.js";

config({ path: ".env.test", override: true, quiet: true });

type PrismaClientExtended = typeof import("../src/db/prisma.js").prismaClient;

let prismaClient: PrismaClientExtended;

beforeAll(async () => {
  const prisma = await import("../src/db/prisma.js");
  prismaClient = prisma.prismaClient;
  await prismaClient.$connect();
});

beforeEach(async () => {
  resetFactorySequence();

  if (!process.env.TEST_DEBUG) {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "debug").mockImplementation(() => {});

    vi.spyOn(logger, "info").mockImplementation(() => {});
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    vi.spyOn(logger, "error").mockImplementation(() => {});
    vi.spyOn(logger, "debug").mockImplementation(() => {});
  }

  await prismaClient.$executeRawUnsafe(`
    TRUNCATE TABLE
      "order_events",
      "order_products",
      "orders",
      "cart_items",
      "addresses",
      "refresh_tokens",
      "one_time_tokens",
      "products",
      "users"
    RESTART IDENTITY CASCADE;
  `);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prismaClient.$disconnect();
});
