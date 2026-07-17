import { Request } from "express";
import { prismaClient } from "../db/prisma.js";
import crypto from "crypto";
import sendEmail from "../services/emailService.js";
import {
  compareTokenHash,
  hashToken,
  signAccessToken,
  signRefreshToken,
  REFRESH_TOKEN_MAX_AGE_MS,
} from "../utils/tokenHelper.js";
import { ALLOWED_ORIGIN } from "../config/secrets.js";

const EMAIL_VERIFICATION_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TOKEN_MAX_AGE_MS = 60 * 60 * 1000;
const TOKEN_CLEANUP_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_REFRESH_SESSIONS = 5;

type OneTimeTokenPurpose = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

type TokenDbClient = {
  oneTimeToken: {
    deleteMany(args: { where: Record<string, unknown> }): Promise<unknown>;
    create(args: {
      data: {
        userId: number;
        purpose: OneTimeTokenPurpose;
        tokenHash: string;
        expiresAt: Date;
      };
    }): Promise<unknown>;
  };
  refreshToken: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
      select?: { id: true };
    }): Promise<Array<{ id: number; tokenHash: string }>>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: { revoked: boolean };
    }): Promise<unknown>;
    deleteMany(args: { where: Record<string, unknown> }): Promise<unknown>;
    create(args: {
      data: {
        tokenHash: string;
        userId: number;
        expiresAt: Date;
      };
    }): Promise<unknown>;
  };
};

type UserLike = {
  password: string;
  [key: string]: unknown;
};

export const sanitizeUser = <T extends UserLike>(
  user: T,
): Omit<T, "password"> => {
  const { password, ...rest } = user;
  void password;
  return rest;
};

export const hashOneTimeToken = (token: string) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

const generateRawToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

export const cleanupOneTimeTokens = async (tx: TokenDbClient) => {
  const now = new Date();
  const usedCutoff = new Date(Date.now() - TOKEN_CLEANUP_RETENTION_MS);

  await tx.oneTimeToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: usedCutoff } }],
    },
  });
};

export const issueEmailVerificationToken = async (
  tx: TokenDbClient,
  userId: number,
) => {
  await tx.oneTimeToken.deleteMany({
    where: {
      userId,
      purpose: "EMAIL_VERIFICATION",
    },
  });

  const rawToken = generateRawToken();

  await tx.oneTimeToken.create({
    data: {
      userId,
      purpose: "EMAIL_VERIFICATION",
      tokenHash: hashOneTimeToken(rawToken),
      expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_MAX_AGE_MS),
    },
  });

  return rawToken;
};

export const issuePasswordResetToken = async (
  tx: TokenDbClient,
  userId: number,
) => {
  await tx.oneTimeToken.deleteMany({
    where: {
      userId,
      purpose: "PASSWORD_RESET",
    },
  });

  const rawToken = generateRawToken();

  await tx.oneTimeToken.create({
    data: {
      userId,
      purpose: "PASSWORD_RESET",
      tokenHash: hashOneTimeToken(rawToken),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_MAX_AGE_MS),
    },
  });

  return rawToken;
};

export const findMatchingRefreshToken = async (
  userId: number,
  rawToken: string,
) => {
  const tokens = await prismaClient.refreshToken.findMany({
    where: {
      userId,
      revoked: false,
      expiresAt: { gt: new Date() },
    },
  });

  for (const token of tokens) {
    if (compareTokenHash(rawToken, token.tokenHash)) {
      return token;
    }
  }

  return null;
};

const trimActiveRefreshTokens = async (
  userId: number,
  tx: Pick<TokenDbClient, "refreshToken"> = prismaClient,
) => {
  const activeTokens = await tx.refreshToken.findMany({
    where: {
      userId,
      revoked: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
    },
  });

  const excess = Math.max(
    0,
    activeTokens.length - MAX_ACTIVE_REFRESH_SESSIONS + 1,
  );

  if (excess === 0) return;

  const idsToRevoke = activeTokens.slice(0, excess).map((token) => token.id);

  await tx.refreshToken.updateMany({
    where: {
      id: { in: idsToRevoke },
    },
    data: {
      revoked: true,
    },
  });
};

const cleanupRefreshTokens = async (
  tx: Pick<TokenDbClient, "refreshToken"> = prismaClient,
) => {
  const now = new Date();
  const revokedCutoff = new Date(Date.now() - TOKEN_CLEANUP_RETENTION_MS);

  await tx.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: now } },
        { revoked: true, createdAt: { lt: revokedCutoff } },
      ],
    },
  });
};

export const issueTokens = async (userId: number) => {
  await cleanupRefreshTokens(prismaClient);
  await trimActiveRefreshTokens(userId, prismaClient);

  const accessToken = signAccessToken(userId);
  const refreshToken = signRefreshToken(userId);

  await prismaClient.refreshToken.create({
    data: {
      tokenHash: hashToken(refreshToken),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS),
    },
  });

  return { accessToken, refreshToken };
};

export const sendVerificationEmail = async (
  req: Request,
  user: { name: string; email: string },
  rawToken: string,
) => {
  const verificationUrl = `${ALLOWED_ORIGIN}/op-market-shop/verify-email?token=${encodeURIComponent(rawToken)}`;

  return sendEmail({
    to: user.email,
    subject: "Verify your email",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6">
        <h2>Verify your email</h2>
        <p>Hello ${user.name},</p>
        <p>Please verify your email by clicking the link below:</p>
        <p><a href="${verificationUrl}">${verificationUrl}</a></p>
        <p>This link expires in 24 hours.</p>
      </div>
    `,
  });
};

export const sendPasswordResetEmail = async (
  user: { name: string; email: string },
  rawToken: string,
) => {
  const resetUrl = `${ALLOWED_ORIGIN}/op-market-shop/reset-password?token=${encodeURIComponent(rawToken)}`;

  return sendEmail({
    to: user.email,
    subject: "Reset your password",
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6">
        <h2>Password reset request</h2>
        <p>Hello ${user.name},</p>
        <p>We received a request to reset your password.</p>
        <p><a href="${resetUrl}">Reset your password</a></p>
        <p>This link expires in 1 hour.</p>
      </div>
    `,
  });
};
