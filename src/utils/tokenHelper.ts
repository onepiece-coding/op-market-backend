import jwt, { type SignOptions } from "jsonwebtoken";
import bcrypt from "bcrypt";
import { CookieOptions, Response } from "express";
import {
  ACCESS_TOKEN_EXPIRES_IN,
  JWT_SECRET,
  NODE_ENV,
  REFRESH_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_SECRET,
} from "../config/secrets.js";

const isProd = NODE_ENV === "production";

const parseDurationMs = (value: string, fallbackMs: number) => {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case "s":
      return amount * 1000;
    case "m":
      return amount * 60 * 1000;
    case "h":
      return amount * 60 * 60 * 1000;
    case "d":
      return amount * 24 * 60 * 60 * 1000;
    default:
      return fallbackMs;
  }
};

export const ACCESS_TOKEN_MAX_AGE_MS = parseDurationMs(
  ACCESS_TOKEN_EXPIRES_IN,
  15 * 60 * 1000,
);

export const REFRESH_TOKEN_MAX_AGE_MS = parseDurationMs(
  REFRESH_TOKEN_EXPIRES_IN,
  7 * 24 * 60 * 60 * 1000,
);

const accessSignOptions: SignOptions = {
  expiresIn: ACCESS_TOKEN_EXPIRES_IN as SignOptions["expiresIn"],
};

const refreshSignOptions: SignOptions = {
  expiresIn: REFRESH_TOKEN_EXPIRES_IN as SignOptions["expiresIn"],
};

export const signAccessToken = (userId: number) => {
  return jwt.sign({ userId }, JWT_SECRET, accessSignOptions);
};

export const signRefreshToken = (userId: number) => {
  return jwt.sign({ userId }, REFRESH_TOKEN_SECRET, refreshSignOptions);
};

export const hashToken = (token: string) => {
  return bcrypt.hashSync(token, 10);
};

export const compareTokenHash = (token: string, hash: string) => {
  return bcrypt.compareSync(token, hash);
};

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  path: "/",
};

export const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string,
) => {
  res.cookie("accessToken", accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  });

  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);
};
