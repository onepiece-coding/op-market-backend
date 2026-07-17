import { NextFunction, Request, Response } from "express";
import createError from "http-errors";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/secrets.js";
import { prismaClient } from "../db/prisma.js";
import { publicUserSelect } from "../utils/publicUserSelect.js";

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const accessToken =
    req.cookies?.accessToken ??
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7).trim()
      : req.headers.authorization);

  if (!accessToken) {
    return next(createError(401, "Unauthorized!"));
  }

  try {
    const payload = jwt.verify(accessToken, JWT_SECRET) as { userId: number };

    const user = await prismaClient.user.findUnique({
      where: { id: payload.userId },
      select: publicUserSelect,
    });

    if (!user) {
      return next(createError(401, "Unauthorized!"));
    }

    req.user = user;
    next();
  } catch {
    return next(createError(401, "Unauthorized!"));
  }
}
