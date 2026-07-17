import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { errorHandler, notFound } from "../../src/middlewares/error.js";

type TestError = Error & {
  statusCode?: number;
  errors?: unknown;
};

function createRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;

  (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe("error middleware", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe("notFound", () => {
    it('creates an error with "Not Found - /path"', () => {
      const req = {
        originalUrl: "/api/v1/unknown",
      } as Request;

      const res = {} as Response;
      const next = vi.fn();

      notFound(req, res, next as unknown as NextFunction);

      expect(next).toHaveBeenCalledTimes(1);

      const err = next.mock.calls[0][0] as TestError;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("Not Found - /api/v1/unknown");
    });

    it("attaches statusCode = 404", () => {
      const req = {
        originalUrl: "/missing-route",
      } as Request;

      const res = {} as Response;
      const next = vi.fn();

      notFound(req, res, next as unknown as NextFunction);

      const err = next.mock.calls[0][0] as TestError;
      expect(err.statusCode).toBe(404);
    });
  });

  describe("errorHandler", () => {
    it("defaults to 500 when statusCode is missing", () => {
      process.env.NODE_ENV = "test";

      const err = new Error("Something failed") as TestError;
      const req = {} as Request;
      const res = createRes();
      const next = vi.fn();

      errorHandler(err, req, res, next as unknown as NextFunction);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Something failed",
        stack: err.stack,
      });
    });

    it("uses custom status code when provided", () => {
      process.env.NODE_ENV = "test";

      const err = new Error("Bad request") as TestError;
      err.statusCode = 400;

      const req = {} as Request;
      const res = createRes();
      const next = vi.fn();

      errorHandler(err, req, res, next as unknown as NextFunction);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Bad request",
        stack: err.stack,
      });
    });

    it("includes errors when present", () => {
      process.env.NODE_ENV = "test";

      const err = new Error("Validation failed") as TestError;
      err.statusCode = 400;
      err.errors = [
        { path: "email", message: "Invalid email" },
        { path: "password", message: "Too short" },
      ];

      const req = {} as Request;
      const res = createRes();
      const next = vi.fn();

      errorHandler(err, req, res, next as unknown as NextFunction);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Validation failed",
        errors: [
          { path: "email", message: "Invalid email" },
          { path: "password", message: "Too short" },
        ],
        stack: err.stack,
      });
    });

    it("includes stack outside production", () => {
      process.env.NODE_ENV = "development";

      const err = new Error("Boom") as TestError;
      err.statusCode = 500;

      const req = {} as Request;
      const res = createRes();
      const next = vi.fn();

      errorHandler(err, req, res, next as unknown as NextFunction);

      const jsonArg = (res.json as unknown as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as Record<string, unknown>;

      expect(jsonArg.message).toBe("Boom");
      expect(jsonArg.stack).toBe(err.stack);
    });

    it("omits stack in production", () => {
      process.env.NODE_ENV = "production";

      const err = new Error("Boom") as TestError;
      err.statusCode = 500;

      const req = {} as Request;
      const res = createRes();
      const next = vi.fn();

      errorHandler(err, req, res, next as unknown as NextFunction);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Boom",
      });
    });
  });
});
