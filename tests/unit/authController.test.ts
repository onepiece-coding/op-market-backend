import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const asyncHandlerPath = "express-async-handler";
const prismaPath = "../../src/db/prisma.js";
const bcryptPath = "bcrypt";
const jwtPath = "jsonwebtoken";
const secretsPath = "../../src/config/secrets.js";
const loggerPath = "../../src/utils/logger.js";
const tokenHelperPath = "../../src/utils/tokenHelper.js";
const authHelperPath = "../../src/utils/authHelper.js";
const authControllerPath = "../../src/controllers/authController.js";

type TestRequest = Partial<Request> & {
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  cookies?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  user?: {
    id: number;
    name?: string;
    email?: string;
    role?: "ADMIN" | "USER";
    defaultShippingAddress?: number | null;
    defaultBillingAddress?: number | null;
  };
};

function createRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  } as unknown as Response;

  (res.status as unknown as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

async function loadAuthController() {
  vi.resetModules();

  const tx = {
    user: {
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    oneTimeToken: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    refreshToken: {
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  };

  const prismaClient = {
    $transaction: vi.fn(),
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    oneTimeToken: {
      findFirst: vi.fn(),
    },
    refreshToken: {
      update: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  };

  const compareSync = vi.fn();
  const hashSync = vi.fn((value: string) => `hashed:${value}`);
  const verify = vi.fn();

  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };

  const clearAuthCookies = vi.fn();
  const hashToken = vi.fn((token: string) => `hashed:${token}`);
  const setAuthCookies = vi.fn();
  const signAccessToken = vi.fn((userId: number) => `access-${userId}`);
  const signRefreshToken = vi.fn((userId: number) => `refresh-${userId}`);

  const cleanupOneTimeTokens = vi.fn();
  const findMatchingRefreshToken = vi.fn();
  const hashOneTimeToken = vi.fn((token: string) => `hashed:${token}`);
  const issueEmailVerificationToken = vi.fn();
  const issuePasswordResetToken = vi.fn();
  const issueTokens = vi.fn();
  const sanitizeUser = vi.fn((user: unknown) => user);
  const sendPasswordResetEmail = vi.fn();
  const sendVerificationEmail = vi.fn();

  vi.doMock(asyncHandlerPath, () => ({
    default: <T extends (...args: any[]) => any>(fn: T) => fn,
  }));

  vi.doMock(prismaPath, () => ({
    prismaClient,
  }));

  vi.doMock(bcryptPath, () => ({
    compareSync,
    hashSync,
  }));

  vi.doMock(jwtPath, () => ({
    default: {
      verify,
    },
  }));

  vi.doMock(secretsPath, () => ({
    REFRESH_TOKEN_SECRET: "r".repeat(32),
  }));

  vi.doMock(loggerPath, () => ({
    default: logger,
  }));

  vi.doMock(tokenHelperPath, () => ({
    clearAuthCookies,
    hashToken,
    setAuthCookies,
    signAccessToken,
    signRefreshToken,
    REFRESH_TOKEN_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  }));

  vi.doMock(authHelperPath, () => ({
    cleanupOneTimeTokens,
    findMatchingRefreshToken,
    hashOneTimeToken,
    issueEmailVerificationToken,
    issuePasswordResetToken,
    issueTokens,
    sanitizeUser,
    sendPasswordResetEmail,
    sendVerificationEmail,
  }));

  const mod = await import(authControllerPath);

  return {
    ...mod,
    mocks: {
      tx,
      prismaClient,
      compareSync,
      hashSync,
      verify,
      logger,
      clearAuthCookies,
      hashToken,
      setAuthCookies,
      signAccessToken,
      signRefreshToken,
      cleanupOneTimeTokens,
      findMatchingRefreshToken,
      hashOneTimeToken,
      issueEmailVerificationToken,
      issuePasswordResetToken,
      issueTokens,
      sanitizeUser,
      sendPasswordResetEmail,
      sendVerificationEmail,
    },
  };
}

describe("authController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe("signUpCtrl", () => {
    it("blocks duplicate email with 400", async () => {
      const { signUpCtrl, mocks } = await loadAuthController();
      const req = {
        body: { name: "A", email: "a@test.com", password: "secret123" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.user.findFirst.mockResolvedValue({ id: 1 });
        return cb(mocks.tx);
      });

      await expect(signUpCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "User already exists!",
      });
    });

    it("makes the first user ADMIN and returns verificationEmailSent=true when email succeeds", async () => {
      const { signUpCtrl, mocks } = await loadAuthController();
      const req = {
        body: { name: "A", email: "a@test.com", password: "secret123" },
      } as TestRequest as Request;
      const res = createRes();

      const createdUser = {
        id: 1,
        name: "A",
        email: "a@test.com",
        password: "hashed:secret123",
        role: "ADMIN",
        emailVerifiedAt: null,
      };

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.user.findFirst.mockResolvedValue(null);
        mocks.tx.user.count.mockResolvedValue(0);
        mocks.tx.user.create.mockResolvedValue(createdUser);
        mocks.issueEmailVerificationToken.mockResolvedValue("verify-token");
        return cb(mocks.tx);
      });

      mocks.sendVerificationEmail.mockResolvedValue(undefined);
      mocks.sanitizeUser.mockReturnValue({
        id: 1,
        name: "A",
        email: "a@test.com",
        role: "ADMIN",
      });

      await signUpCtrl(req, res);

      expect(mocks.tx.user.create).toHaveBeenCalledWith({
        data: {
          name: "A",
          email: "a@test.com",
          password: "hashed:secret123",
          role: "ADMIN",
          emailVerifiedAt: null,
        },
      });
      expect(mocks.cleanupOneTimeTokens).toHaveBeenCalledWith(mocks.tx);
      expect(mocks.issueEmailVerificationToken).toHaveBeenCalledWith(
        mocks.tx,
        1,
      );
      expect(mocks.sendVerificationEmail).toHaveBeenCalledWith(
        req,
        createdUser,
        "verify-token",
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        user: {
          id: 1,
          name: "A",
          email: "a@test.com",
          role: "ADMIN",
        },
        verificationEmailSent: true,
        message: "Account created. Please verify your email.",
      });
    });

    it("makes non-first users USER", async () => {
      const { signUpCtrl, mocks } = await loadAuthController();
      const req = {
        body: { name: "B", email: "b@test.com", password: "secret123" },
      } as TestRequest as Request;
      const res = createRes();

      const createdUser = {
        id: 2,
        name: "B",
        email: "b@test.com",
        password: "hashed:secret123",
        role: "USER",
        emailVerifiedAt: null,
      };

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.user.findFirst.mockResolvedValue(null);
        mocks.tx.user.count.mockResolvedValue(3);
        mocks.tx.user.create.mockResolvedValue(createdUser);
        mocks.issueEmailVerificationToken.mockResolvedValue("verify-token");
        return cb(mocks.tx);
      });

      mocks.sendVerificationEmail.mockResolvedValue(undefined);
      mocks.sanitizeUser.mockReturnValue({
        id: 2,
        name: "B",
        email: "b@test.com",
        role: "USER",
      });

      await signUpCtrl(req, res);

      expect(mocks.tx.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          role: "USER",
        }),
      });
    });

    it("still returns 201 with fallback message when verification email fails", async () => {
      const { signUpCtrl, mocks } = await loadAuthController();
      const req = {
        body: { name: "A", email: "a@test.com", password: "secret123" },
      } as TestRequest as Request;
      const res = createRes();

      const createdUser = {
        id: 1,
        name: "A",
        email: "a@test.com",
        password: "hashed:secret123",
        role: "ADMIN",
        emailVerifiedAt: null,
      };

      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.user.findFirst.mockResolvedValue(null);
        mocks.tx.user.count.mockResolvedValue(0);
        mocks.tx.user.create.mockResolvedValue(createdUser);
        mocks.issueEmailVerificationToken.mockResolvedValue("verify-token");
        return cb(mocks.tx);
      });

      mocks.sendVerificationEmail.mockRejectedValue(new Error("smtp down"));
      mocks.sanitizeUser.mockReturnValue({
        id: 1,
        name: "A",
        email: "a@test.com",
        role: "ADMIN",
      });

      await signUpCtrl(req, res);

      expect(mocks.logger.error).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        user: {
          id: 1,
          name: "A",
          email: "a@test.com",
          role: "ADMIN",
        },
        verificationEmailSent: false,
        message:
          "Account created, but the verification email could not be sent. Please request a new one.",
      });
    });
  });

  describe("loginCtrl", () => {
    it("returns 400 when user is not found", async () => {
      const { loginCtrl, mocks } = await loadAuthController();
      const req = {
        body: { email: "x@test.com", password: "secret123" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.user.findFirst.mockResolvedValue(null);

      await expect(loginCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid credentials!",
      });
    });

    it("returns 403 when user is unverified", async () => {
      const { loginCtrl, mocks } = await loadAuthController();
      const req = {
        body: { email: "x@test.com", password: "secret123" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.user.findFirst.mockResolvedValue({
        id: 1,
        emailVerifiedAt: null,
        password: "hashed",
      });

      await expect(loginCtrl(req, res)).rejects.toMatchObject({
        statusCode: 403,
        message: "Please verify your email before logging in.",
      });
    });

    it("returns 400 when password is wrong", async () => {
      const { loginCtrl, mocks } = await loadAuthController();
      const req = {
        body: { email: "x@test.com", password: "wrong" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.user.findFirst.mockResolvedValue({
        id: 1,
        email: "x@test.com",
        password: "hashed-pass",
        emailVerifiedAt: new Date(),
      });
      mocks.compareSync.mockReturnValue(false);

      await expect(loginCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid credentials!",
      });
    });

    it("issues tokens, sets cookies, and returns sanitized user on success", async () => {
      const { loginCtrl, mocks } = await loadAuthController();
      const req = {
        body: { email: "x@test.com", password: "secret123" },
      } as TestRequest as Request;
      const res = createRes();

      const user = {
        id: 1,
        name: "X",
        email: "x@test.com",
        password: "hashed-pass",
        role: "USER",
        emailVerifiedAt: new Date(),
      };

      mocks.prismaClient.user.findFirst.mockResolvedValue(user);
      mocks.compareSync.mockReturnValue(true);
      mocks.issueTokens.mockResolvedValue({
        accessToken: "access-1",
        refreshToken: "refresh-1",
      });
      mocks.sanitizeUser.mockReturnValue({
        id: 1,
        name: "X",
        email: "x@test.com",
        role: "USER",
      });

      await loginCtrl(req, res);

      expect(mocks.issueTokens).toHaveBeenCalledWith(1);
      expect(mocks.setAuthCookies).toHaveBeenCalledWith(
        res,
        "access-1",
        "refresh-1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        user: {
          id: 1,
          name: "X",
          email: "x@test.com",
          role: "USER",
        },
      });
    });
  });

  describe("verifyEmailCtrl", () => {
    it("returns 400 when token is missing", async () => {
      const { verifyEmailCtrl } = await loadAuthController();
      const req = { query: {} } as TestRequest as Request;
      const res = createRes();

      await expect(verifyEmailCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Missing verification token",
      });
    });

    it("returns 400 when token record is missing / expired / used", async () => {
      const { verifyEmailCtrl, mocks } = await loadAuthController();
      const req = {
        query: { token: "abc" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.oneTimeToken.findFirst.mockResolvedValue(null);

      await expect(verifyEmailCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid or expired verification token",
      });
    });

    it("marks token used, verifies user, sets cookies, and returns success", async () => {
      const { verifyEmailCtrl, mocks } = await loadAuthController();
      const req = {
        query: { token: "abc" },
      } as TestRequest as Request;
      const res = createRes();

      const tokenRecord = {
        id: 11,
        userId: 7,
      };
      const updatedUser = {
        id: 7,
        email: "x@test.com",
        role: "USER",
        emailVerifiedAt: new Date(),
      };

      mocks.prismaClient.oneTimeToken.findFirst.mockResolvedValue(tokenRecord);
      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.oneTimeToken.updateMany.mockResolvedValue({ count: 1 });
        mocks.tx.user.update.mockResolvedValue(updatedUser);
        return cb(mocks.tx);
      });
      mocks.issueTokens.mockResolvedValue({
        accessToken: "access-7",
        refreshToken: "refresh-7",
      });
      mocks.sanitizeUser.mockReturnValue({
        id: 7,
        email: "x@test.com",
        role: "USER",
      });

      await verifyEmailCtrl(req, res);

      expect(mocks.tx.oneTimeToken.updateMany).toHaveBeenCalledWith({
        where: {
          id: 11,
          usedAt: null,
        },
        data: {
          usedAt: new Date("2026-04-08T10:00:00.000Z"),
        },
      });
      expect(mocks.tx.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: {
          emailVerifiedAt: new Date("2026-04-08T10:00:00.000Z"),
        },
      });
      expect(mocks.cleanupOneTimeTokens).toHaveBeenCalledWith(mocks.tx);
      expect(mocks.setAuthCookies).toHaveBeenCalledWith(
        res,
        "access-7",
        "refresh-7",
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        user: {
          id: 7,
          email: "x@test.com",
          role: "USER",
        },
        message: "Email verified successfully.",
      });
    });
  });

  describe("resendVerificationCtrl", () => {
    it("returns the generic 200 response for nonexistent user", async () => {
      const { resendVerificationCtrl, mocks } = await loadAuthController();
      const req = {
        body: { email: "x@test.com" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.user.findFirst.mockResolvedValue(null);

      await resendVerificationCtrl(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message:
          "If the email exists and is not verified, a verification email has been sent.",
      });
    });

    it("returns the generic 200 response for already-verified user", async () => {
      const { resendVerificationCtrl, mocks } = await loadAuthController();
      const req = {
        body: { email: "x@test.com" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.user.findFirst.mockResolvedValue({
        id: 1,
        emailVerifiedAt: new Date(),
      });

      await resendVerificationCtrl(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message:
          "If the email exists and is not verified, a verification email has been sent.",
      });
    });

    it("issues a token and attempts email for a valid unverified user", async () => {
      const { resendVerificationCtrl, mocks } = await loadAuthController();
      const req = {
        body: { email: "x@test.com" },
      } as TestRequest as Request;
      const res = createRes();

      const user = { id: 1, email: "x@test.com", emailVerifiedAt: null };

      mocks.prismaClient.user.findFirst.mockResolvedValue(user);
      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.issueEmailVerificationToken.mockResolvedValue("verify-token");
        return cb(mocks.tx);
      });

      await resendVerificationCtrl(req, res);

      expect(mocks.cleanupOneTimeTokens).toHaveBeenCalledWith(mocks.tx);
      expect(mocks.issueEmailVerificationToken).toHaveBeenCalledWith(
        mocks.tx,
        1,
      );
      expect(mocks.sendVerificationEmail).toHaveBeenCalledWith(
        req,
        user,
        "verify-token",
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("still returns the generic 200 response when email sending fails", async () => {
      const { resendVerificationCtrl, mocks } = await loadAuthController();
      const req = {
        body: { email: "x@test.com" },
      } as TestRequest as Request;
      const res = createRes();

      const user = { id: 1, email: "x@test.com", emailVerifiedAt: null };

      mocks.prismaClient.user.findFirst.mockResolvedValue(user);
      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.issueEmailVerificationToken.mockResolvedValue("verify-token");
        return cb(mocks.tx);
      });
      mocks.sendVerificationEmail.mockRejectedValue(new Error("smtp down"));

      await resendVerificationCtrl(req, res);

      expect(mocks.logger.error).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message:
          "If the email exists and is not verified, a verification email has been sent.",
      });
    });
  });

  describe("forgotPasswordCtrl", () => {
    it("returns the generic 200 response for nonexistent user", async () => {
      const { forgotPasswordCtrl, mocks } = await loadAuthController();
      const req = {
        body: { email: "x@test.com" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.user.findFirst.mockResolvedValue(null);

      await forgotPasswordCtrl(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "If the email exists, a password reset link has been sent.",
      });
    });

    it("issues a reset token and attempts email for existing user", async () => {
      const { forgotPasswordCtrl, mocks } = await loadAuthController();
      const req = {
        body: { email: "x@test.com" },
      } as TestRequest as Request;
      const res = createRes();

      const user = { id: 1, email: "x@test.com" };

      mocks.prismaClient.user.findFirst.mockResolvedValue(user);
      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.issuePasswordResetToken.mockResolvedValue("reset-token");
        return cb(mocks.tx);
      });

      await forgotPasswordCtrl(req, res);

      expect(mocks.cleanupOneTimeTokens).toHaveBeenCalledWith(mocks.tx);
      expect(mocks.issuePasswordResetToken).toHaveBeenCalledWith(mocks.tx, 1);
      expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith(
        user,
        "reset-token",
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it("still returns the generic 200 response when reset email fails", async () => {
      const { forgotPasswordCtrl, mocks } = await loadAuthController();
      const req = {
        body: { email: "x@test.com" },
      } as TestRequest as Request;
      const res = createRes();

      const user = { id: 1, email: "x@test.com" };

      mocks.prismaClient.user.findFirst.mockResolvedValue(user);
      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.issuePasswordResetToken.mockResolvedValue("reset-token");
        return cb(mocks.tx);
      });
      mocks.sendPasswordResetEmail.mockRejectedValue(new Error("smtp down"));

      await forgotPasswordCtrl(req, res);

      expect(mocks.logger.error).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "If the email exists, a password reset link has been sent.",
      });
    });
  });

  describe("resetPasswordCtrl", () => {
    it("returns 400 for invalid or expired reset token", async () => {
      const { resetPasswordCtrl, mocks } = await loadAuthController();
      const req = {
        body: { token: "bad-token", password: "new-secret123" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.prismaClient.oneTimeToken.findFirst.mockResolvedValue(null);

      await expect(resetPasswordCtrl(req, res)).rejects.toMatchObject({
        statusCode: 400,
        message: "Invalid or expired reset token",
      });
    });

    it("marks token used, hashes password, revokes refresh tokens, clears cookies, and returns success", async () => {
      const { resetPasswordCtrl, mocks } = await loadAuthController();
      const req = {
        body: { token: "good-token", password: "new-secret123" },
      } as TestRequest as Request;
      const res = createRes();

      const tokenRecord = { id: 9, userId: 4 };
      const updatedUser = {
        id: 4,
        email: "x@test.com",
        role: "USER",
      };

      mocks.prismaClient.oneTimeToken.findFirst.mockResolvedValue(tokenRecord);
      mocks.prismaClient.$transaction.mockImplementation(async (cb: any) => {
        mocks.tx.oneTimeToken.updateMany.mockResolvedValue({ count: 1 });
        mocks.tx.user.update.mockResolvedValue(updatedUser);
        mocks.tx.refreshToken.updateMany.mockResolvedValue({ count: 3 });
        return cb(mocks.tx);
      });
      mocks.sanitizeUser.mockReturnValue(updatedUser);

      await resetPasswordCtrl(req, res);

      expect(mocks.tx.oneTimeToken.updateMany).toHaveBeenCalledWith({
        where: {
          id: 9,
          usedAt: null,
        },
        data: {
          usedAt: new Date("2026-04-08T10:00:00.000Z"),
        },
      });
      expect(mocks.tx.user.update).toHaveBeenCalledWith({
        where: { id: 4 },
        data: {
          password: "hashed:new-secret123",
        },
      });
      expect(mocks.tx.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 4,
        },
        data: {
          revoked: true,
        },
      });
      expect(mocks.cleanupOneTimeTokens).toHaveBeenCalledWith(mocks.tx);
      expect(mocks.clearAuthCookies).toHaveBeenCalledWith(res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Password reset successfully. Please log in again.",
        user: updatedUser,
      });
    });
  });

  describe("refreshCtrl", () => {
    it("returns 401 when refresh cookie is missing", async () => {
      const { refreshCtrl } = await loadAuthController();
      const req = { cookies: {} } as TestRequest as Request;
      const res = createRes();

      await expect(refreshCtrl(req, res)).rejects.toMatchObject({
        statusCode: 401,
        message: "No refresh token",
      });
    });

    it("returns 401 when refresh JWT is invalid", async () => {
      const { refreshCtrl, mocks } = await loadAuthController();
      const req = {
        cookies: { refreshToken: "bad.jwt" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.verify.mockImplementation(() => {
        throw new Error("invalid");
      });

      await expect(refreshCtrl(req, res)).rejects.toMatchObject({
        statusCode: 401,
        message: "Invalid refresh token",
      });
    });

    it("returns 401 when there is no matching stored refresh token", async () => {
      const { refreshCtrl, mocks } = await loadAuthController();
      const req = {
        cookies: { refreshToken: "refresh-1" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.verify.mockReturnValue({ userId: 1 });
      mocks.findMatchingRefreshToken.mockResolvedValue(null);

      await expect(refreshCtrl(req, res)).rejects.toMatchObject({
        statusCode: 401,
        message: "Refresh token revoked or invalid",
      });
    });

    it("revokes old refresh token, stores a new one, resets cookies, and returns user", async () => {
      const { refreshCtrl, mocks } = await loadAuthController();
      const req = {
        cookies: { refreshToken: "refresh-1" },
      } as TestRequest as Request;
      const res = createRes();

      const user = {
        id: 1,
        name: "X",
        email: "x@test.com",
        role: "USER",
      };

      mocks.verify.mockReturnValue({ userId: 1 });
      mocks.findMatchingRefreshToken.mockResolvedValue({ id: 99 });
      mocks.prismaClient.user.findUnique.mockResolvedValue(user);

      await refreshCtrl(req, res);

      expect(mocks.prismaClient.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 99 },
        data: { revoked: true },
      });
      expect(mocks.signAccessToken).toHaveBeenCalledWith(1);
      expect(mocks.signRefreshToken).toHaveBeenCalledWith(1);
      expect(mocks.hashToken).toHaveBeenCalledWith("refresh-1");
      expect(mocks.prismaClient.refreshToken.create).toHaveBeenCalledWith({
        data: {
          tokenHash: "hashed:refresh-1",
          userId: 1,
          expiresAt: new Date("2026-04-15T10:00:00.000Z"),
        },
      });
      expect(mocks.setAuthCookies).toHaveBeenCalledWith(
        res,
        "access-1",
        "refresh-1",
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ user });
    });
  });

  describe("logoutCtrl", () => {
    it("clears cookies and returns 200 when no token exists", async () => {
      const { logoutCtrl, mocks } = await loadAuthController();
      const req = { cookies: {} } as TestRequest as Request;
      const res = createRes();

      await logoutCtrl(req, res);

      expect(mocks.clearAuthCookies).toHaveBeenCalledWith(res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Logged out" });
    });

    it("clears cookies and returns 200 even when token is invalid", async () => {
      const { logoutCtrl, mocks } = await loadAuthController();
      const req = {
        cookies: { refreshToken: "bad.jwt" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.verify.mockImplementation(() => {
        throw new Error("invalid");
      });

      await logoutCtrl(req, res);

      expect(mocks.clearAuthCookies).toHaveBeenCalledWith(res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Logged out" });
    });

    it("revokes matching token, clears cookies, and returns 200", async () => {
      const { logoutCtrl, mocks } = await loadAuthController();
      const req = {
        cookies: { refreshToken: "refresh-1" },
      } as TestRequest as Request;
      const res = createRes();

      mocks.verify.mockReturnValue({ userId: 1 });
      mocks.findMatchingRefreshToken.mockResolvedValue({ id: 77 });

      await logoutCtrl(req, res);

      expect(mocks.prismaClient.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 77 },
        data: { revoked: true },
      });
      expect(mocks.clearAuthCookies).toHaveBeenCalledWith(res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Logged out" });
    });
  });
});
