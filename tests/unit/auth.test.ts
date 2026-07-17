import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

const secretsPath = "../../src/config/secrets.js";
const prismaPath = "../../src/db/prisma.js";
const jwtPath = "jsonwebtoken";
const authPath = "../../src/middlewares/auth.js";

type AuthenticatedRequest = Request & {
  user?: {
    id: number;
    name: string;
    email: string;
    role: "USER" | "ADMIN";
  };
};

async function loadAuthMiddleware() {
  vi.resetModules();

  const verifyMock = vi.fn();
  const findUniqueMock = vi.fn();

  vi.doMock(secretsPath, () => ({
    JWT_SECRET: "a".repeat(32),
  }));

  vi.doMock(prismaPath, () => ({
    prismaClient: {
      user: {
        findUnique: findUniqueMock,
      },
    },
  }));

  vi.doMock(jwtPath, () => ({
    default: {
      verify: verifyMock,
    },
  }));

  const mod = await import(authPath);

  return {
    authMiddleware: mod.authMiddleware,
    verifyMock,
    findUniqueMock,
  };
}

describe("authMiddleware", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no token is present in cookies or headers", async () => {
    const { authMiddleware } = await loadAuthMiddleware();

    const req = {
      cookies: {},
      headers: {},
    } as Request;

    const res = {} as Response;
    const next = vi.fn();

    await authMiddleware(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as {
      statusCode?: number;
      message?: string;
    };

    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Unauthorized!");
  });

  it("extracts bearer token correctly from Authorization header", async () => {
    const { authMiddleware, verifyMock, findUniqueMock } =
      await loadAuthMiddleware();

    verifyMock.mockReturnValue({ userId: 7 });
    findUniqueMock.mockResolvedValue(null);

    const req = {
      cookies: {},
      headers: {
        authorization: "Bearer my.jwt.token",
      },
    } as Request;

    const res = {} as Response;
    const next = vi.fn();

    await authMiddleware(req, res, next as unknown as NextFunction);

    expect(verifyMock).toHaveBeenCalledWith("my.jwt.token", "a".repeat(32));
    expect(findUniqueMock).toHaveBeenCalledTimes(1);
  });

  it("returns 401 when JWT is invalid", async () => {
    const { authMiddleware, verifyMock, findUniqueMock } =
      await loadAuthMiddleware();

    verifyMock.mockImplementation(() => {
      throw new Error("invalid token");
    });

    const req = {
      cookies: { accessToken: "bad.jwt" },
      headers: {},
    } as Request;

    const res = {} as Response;
    const next = vi.fn();

    await authMiddleware(req, res, next as unknown as NextFunction);

    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);

    const err = next.mock.calls[0][0] as {
      statusCode?: number;
      message?: string;
    };
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Unauthorized!");
  });

  it("returns 401 when JWT is valid but no matching user exists", async () => {
    const { authMiddleware, verifyMock, findUniqueMock } =
      await loadAuthMiddleware();

    verifyMock.mockReturnValue({ userId: 99 });
    findUniqueMock.mockResolvedValue(null);

    const req = {
      cookies: { accessToken: "valid.jwt" },
      headers: {},
    } as Request;

    const res = {} as Response;
    const next = vi.fn();

    await authMiddleware(req, res, next as unknown as NextFunction);

    expect(findUniqueMock).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);

    const err = next.mock.calls[0][0] as {
      statusCode?: number;
      message?: string;
    };
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Unauthorized!");
  });

  it("populates req.user and calls next when JWT is valid and user exists", async () => {
    const { authMiddleware, verifyMock, findUniqueMock } =
      await loadAuthMiddleware();

    const user = {
      id: 5,
      name: "Test User",
      email: "test@example.com",
      role: "USER" as const,
    };

    verifyMock.mockReturnValue({ userId: 5 });
    findUniqueMock.mockResolvedValue(user);

    const req = {
      cookies: { accessToken: "valid.jwt" },
      headers: {},
    } as AuthenticatedRequest;

    const res = {} as Response;
    const next = vi.fn();

    await authMiddleware(req, res, next as unknown as NextFunction);

    expect(findUniqueMock).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual(user);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});
