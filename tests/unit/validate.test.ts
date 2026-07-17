import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

const helperPath = "../../src/utils/zodHelper.js";
const validatePath = "../../src/middlewares/validate.js";

async function loadValidate() {
  vi.resetModules();

  vi.doMock(helperPath, () => ({
    formatZodError: vi
      .fn()
      .mockReturnValue([{ path: "email", message: "Invalid email" }]),
  }));

  const mod = await import(validatePath);
  const helper = await import(helperPath);

  return {
    validate: mod.validate,
    formatZodErrorMock: helper.formatZodError as unknown as ReturnType<
      typeof vi.fn
    >,
  };
}

describe("validate middleware", () => {
  it("calls next() on success", async () => {
    const { validate } = await loadValidate();

    const schema = z.object({
      email: z.email(),
    });

    const req = {
      body: { email: "user@example.com" },
    } as Request;

    const res = {} as Response;
    const next = vi.fn() as NextFunction;

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it("returns a 400-style error with formatted errors on failure", async () => {
    const { validate, formatZodErrorMock } = await loadValidate();

    const schema = z.object({
      email: z.email(),
    });

    const req = {
      body: { email: "not-an-email" },
    } as Request;

    const res = {} as Response;
    const next = vi.fn();

    validate(schema)(req, res, next as never);

    expect(formatZodErrorMock).toHaveBeenCalledTimes(1);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0] as {
      //Property 'mock' does not exist on type 'NextFunction'.ts(2339)
      statusCode?: number;
      message?: string;
      errors?: unknown;
    };

    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("Validation failed");
    expect(err.errors).toEqual([{ path: "email", message: "Invalid email" }]);
  });
});
