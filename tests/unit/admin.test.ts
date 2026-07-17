import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { adminMiddleware } from "../../src/middlewares/admin.js";

type TestRequest = Request & {
  user?: {
    id: number;
    role: "ADMIN" | "USER";
  };
};

describe("adminMiddleware", () => {
  it("passes through for admin user", async () => {
    const req = {
      user: { id: 1, role: "ADMIN" as const },
    } as TestRequest;

    const res = {} as Response;
    const next = vi.fn();

    await adminMiddleware(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("returns 403 for authenticated non-admin user", async () => {
    const req = {
      user: { id: 2, role: "USER" as const },
    } as TestRequest;

    const res = {} as Response;
    const next = vi.fn();

    await adminMiddleware(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as {
      statusCode?: number;
      message?: string;
    };

    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("Forbidden: admin only");
  });

  it("returns 401 when user is missing", async () => {
    const req = {} as TestRequest;

    const res = {} as Response;
    const next = vi.fn();

    await adminMiddleware(req, res, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as {
      statusCode?: number;
      message?: string;
    };

    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("Unauthorized");
  });
});
