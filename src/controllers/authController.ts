import { Request, Response } from "express";
import createError from "http-errors";
import asyncHandler from "express-async-handler";
import { prismaClient } from "../db/prisma.js";
import { compareSync, hashSync } from "bcrypt";
import jwt from "jsonwebtoken";
import { REFRESH_TOKEN_SECRET } from "../config/secrets.js";
import logger from "../utils/logger.js";
import {
  clearAuthCookies,
  hashToken,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  REFRESH_TOKEN_MAX_AGE_MS,
} from "../utils/tokenHelper.js";
import { publicUserSelect } from "../utils/publicUserSelect.js";
import {
  cleanupOneTimeTokens,
  findMatchingRefreshToken,
  hashOneTimeToken,
  issueEmailVerificationToken,
  issuePasswordResetToken,
  issueTokens,
  sanitizeUser,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../utils/authHelper.js";

/**
 * @desc   SignUp a new user
 * @route  api/v1/auth/singup
 * @method POST
 * @access public
 */
export const signUpCtrl = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password } = req.body;

  const { user, verificationToken } = await prismaClient.$transaction(
    async (tx) => {
      const existing = await tx.user.findFirst({ where: { email } });
      if (existing) {
        throw createError(400, "User already exists!");
      }

      const usersCount = await tx.user.count();
      const isFirstUser = usersCount === 0;

      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashSync(password, 10),
          role: isFirstUser ? "ADMIN" : "USER",
          emailVerifiedAt: null,
        },
      });

      await cleanupOneTimeTokens(tx);
      const verificationToken = await issueEmailVerificationToken(tx, user.id);

      return { user, verificationToken };
    },
  );

  let verificationEmailSent = false;
  try {
    await sendVerificationEmail(req, user, verificationToken);
    verificationEmailSent = true;
  } catch (error) {
    logger.error("Failed to send verification email", error);
  }

  res.status(201).json({
    user: sanitizeUser(user),
    verificationEmailSent,
    message: verificationEmailSent
      ? "Account created. Please verify your email."
      : "Account created, but the verification email could not be sent. Please request a new one.",
  });
});

/**
 * @desc   Login a user
 * @route  api/v1/auth/login
 * @method POST
 * @access public
 */
export const loginCtrl = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prismaClient.user.findFirst({ where: { email } });
  if (!user) {
    throw createError(400, "Invalid credentials!");
  }

  if (!user.emailVerifiedAt) {
    throw createError(403, "Please verify your email before logging in.");
  }

  if (!compareSync(password, user.password)) {
    throw createError(400, "Invalid credentials!");
  }

  const { accessToken, refreshToken } = await issueTokens(user.id);
  setAuthCookies(res, accessToken, refreshToken);

  res.status(200).json({
    user: sanitizeUser(user),
  });
});

/**
 * @desc   Verify email
 * @route  GET /api/v1/auth/verify-email?token=...
 * @access public
 */
export const verifyEmailCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const rawToken = String(req.query.token ?? "").trim();
    if (!rawToken) {
      throw createError(400, "Missing verification token");
    }

    const tokenHash = hashOneTimeToken(rawToken);

    const tokenRecord = await prismaClient.oneTimeToken.findFirst({
      where: {
        tokenHash,
        purpose: "EMAIL_VERIFICATION",
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!tokenRecord) {
      throw createError(400, "Invalid or expired verification token");
    }

    const user = await prismaClient.$transaction(async (tx) => {
      const markUsed = await tx.oneTimeToken.updateMany({
        where: {
          id: tokenRecord.id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      if (!markUsed.count) {
        throw createError(400, "Invalid or expired verification token");
      }

      const updatedUser = await tx.user.update({
        where: { id: tokenRecord.userId },
        data: {
          emailVerifiedAt: new Date(),
        },
      });

      await cleanupOneTimeTokens(tx);
      return updatedUser;
    });

    const { accessToken, refreshToken } = await issueTokens(user.id);
    setAuthCookies(res, accessToken, refreshToken);

    res.status(200).json({
      user: sanitizeUser(user),
      message: "Email verified successfully.",
    });
  },
);

/**
 * @desc   Resend verification email
 * @route  POST /api/v1/auth/resend-verification
 * @access public
 */
export const resendVerificationCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = req.body as { email: string };

    const user = await prismaClient.user.findFirst({
      where: { email },
    });

    if (!user || user.emailVerifiedAt) {
      res.status(200).json({
        message:
          "If the email exists and is not verified, a verification email has been sent.",
      });
      return;
    }

    const verificationToken = await prismaClient.$transaction(async (tx) => {
      await cleanupOneTimeTokens(tx);
      return issueEmailVerificationToken(tx, user.id);
    });

    try {
      await sendVerificationEmail(req, user, verificationToken);
    } catch (error) {
      logger.error("Failed to resend verification email", error);
    }

    res.status(200).json({
      message:
        "If the email exists and is not verified, a verification email has been sent.",
    });
  },
);

/**
 * @desc   Forgot password
 * @route  POST /api/v1/auth/forgot-password
 * @access public
 */
export const forgotPasswordCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const { email } = req.body as { email: string };

    const user = await prismaClient.user.findFirst({
      where: { email },
    });

    if (!user) {
      res.status(200).json({
        message: "If the email exists, a password reset link has been sent.",
      });
      return;
    }

    const resetToken = await prismaClient.$transaction(async (tx) => {
      await cleanupOneTimeTokens(tx);
      return issuePasswordResetToken(tx, user.id);
    });

    try {
      await sendPasswordResetEmail(user, resetToken);
    } catch (error) {
      logger.error("Failed to send password reset email", error);
    }

    res.status(200).json({
      message: "If the email exists, a password reset link has been sent.",
    });
  },
);

/**
 * @desc   Reset password
 * @route  POST /api/v1/auth/reset-password
 * @access public
 */
export const resetPasswordCtrl = asyncHandler(
  async (req: Request, res: Response) => {
    const { token, password } = req.body as { token: string; password: string };

    const tokenHash = hashOneTimeToken(token);

    const tokenRecord = await prismaClient.oneTimeToken.findFirst({
      where: {
        tokenHash,
        purpose: "PASSWORD_RESET",
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!tokenRecord) {
      throw createError(400, "Invalid or expired reset token");
    }

    const result = await prismaClient.$transaction(async (tx) => {
      const markUsed = await tx.oneTimeToken.updateMany({
        where: {
          id: tokenRecord.id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      if (!markUsed.count) {
        throw createError(400, "Invalid or expired reset token");
      }

      const updatedUser = await tx.user.update({
        where: { id: tokenRecord.userId },
        data: {
          password: hashSync(password, 10),
        },
      });

      await tx.refreshToken.updateMany({
        where: {
          userId: tokenRecord.userId,
        },
        data: {
          revoked: true,
        },
      });

      await cleanupOneTimeTokens(tx);

      return updatedUser;
    });

    clearAuthCookies(res);

    res.status(200).json({
      message: "Password reset successfully. Please log in again.",
      user: sanitizeUser(result),
    });
  },
);

/**
 * @desc   Refresh access token
 * @route  /api/v1/auth/refresh
 * @method POST
 * @access public
 */
export const refreshCtrl = asyncHandler(async (req: Request, res: Response) => {
  const rawRefreshToken = req.cookies?.refreshToken;
  if (!rawRefreshToken) {
    throw createError(401, "No refresh token");
  }

  let payload: { userId: number };
  try {
    payload = jwt.verify(rawRefreshToken, REFRESH_TOKEN_SECRET) as {
      userId: number;
    };
  } catch {
    throw createError(401, "Invalid refresh token");
  }

  const existingToken = await findMatchingRefreshToken(
    payload.userId,
    rawRefreshToken,
  );

  if (!existingToken) {
    throw createError(401, "Refresh token revoked or invalid");
  }

  await prismaClient.refreshToken.update({
    where: { id: existingToken.id },
    data: { revoked: true },
  });

  const newAccessToken = signAccessToken(payload.userId);
  const newRefreshToken = signRefreshToken(payload.userId);

  await prismaClient.refreshToken.create({
    data: {
      tokenHash: hashToken(newRefreshToken),
      userId: payload.userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS),
    },
  });

  setAuthCookies(res, newAccessToken, newRefreshToken);

  const user = await prismaClient.user.findUnique({
    where: { id: payload.userId },
    select: publicUserSelect,
  });

  res.status(200).json({ user });
});

/**
 * @desc   Logout user
 * @route  /api/v1/auth/logout
 * @method POST
 * @access public
 */
export const logoutCtrl = asyncHandler(async (req: Request, res: Response) => {
  const rawRefreshToken = req.cookies?.refreshToken;

  if (rawRefreshToken) {
    try {
      const payload = jwt.verify(rawRefreshToken, REFRESH_TOKEN_SECRET) as {
        userId: number;
      };
      const existingToken = await findMatchingRefreshToken(
        payload.userId,
        rawRefreshToken,
      );

      if (existingToken) {
        await prismaClient.refreshToken.update({
          where: { id: existingToken.id },
          data: { revoked: true },
        });
      }
    } catch {
      // ignore invalid token, still clear cookies
    }
  }

  clearAuthCookies(res);
  res.status(200).json({ message: "Logged out" });
});

/**
 * @desc   Get Logged in user
 * @route  api/v1/auth/me
 * @method GET
 * @access private(only Logged in User)
 */
export const meCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(req.user);
});
