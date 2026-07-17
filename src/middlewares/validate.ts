import type { ZodError } from "zod";
import { Request, Response, NextFunction } from "express";
import createError from "http-errors";
import { formatZodError } from "../utils/zodHelper.js";

type SchemaWithSafeParse = {
  safeParse: (
    data: unknown,
  ) => { success: true; data: unknown } | { success: false; error: ZodError };
};

export const validate =
  (schema: SchemaWithSafeParse) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (result.success) return next();

    const errors = formatZodError(result.error);
    const err = createError(400, "Validation failed");
    err.errors = errors;
    return next(err);
  };
