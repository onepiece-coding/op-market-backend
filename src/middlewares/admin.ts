import { NextFunction, Request, Response } from "express";
import createError from "http-errors";

export async function adminMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const user = req.user;

  if (user?.role === "ADMIN") {
    return next();
  } else if (user) {
    return next(createError(403, "Forbidden: admin only"));
  } else {
    return next(createError(401, "Unauthorized"));
  }
}
