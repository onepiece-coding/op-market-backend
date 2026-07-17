import { Request, Response, NextFunction } from "express";

interface ErrorResponse {
  message: string;
  errors?: unknown;
  stack?: string;
}

interface CustomError extends Error {
  statusCode?: number;
  errors?: unknown;
}

export const notFound = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  // @ts-expect-error: attach statusCode for errorHandler
  error.statusCode = 404;
  next(error);
};

export const errorHandler = (
  err: CustomError,
  _req: Request,
  res: Response,
  _next: NextFunction,
) => {
  const status = err.statusCode ?? 500;
  const response: ErrorResponse = { message: err.message };
  if (err.errors) response.errors = err.errors; // <-- include zod details
  if (process.env.NODE_ENV !== "production") response.stack = err.stack;
  res.status(status).json(response);
};
