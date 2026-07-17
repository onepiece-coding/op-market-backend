import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

const prismaPath = "../../src/db/prisma.js";
const tokenHelperPath = "../../src/utils/tokenHelper.js";
const emailServicePath = "../../src/services/emailService.js";
const secretsPath = "../../src/config/secrets.js";
const authHelperPath = "../../src/utils/authHelper.js";

async function loadAuthHelper() {
  vi.resetModules();

  const prismaClientMock = {
    oneTimeToken: {
      deleteMany: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
    },
    refreshToken: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue(undefined),
      deleteMany: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
    },
  };

  const signAccessTokenMock = vi.fn((userId: number) => `access-${userId}`);
  const signRefreshTokenMock = vi.fn((userId: number) => `refresh-${userId}`);
  const hashTokenMock = vi.fn((token: string) => `hashed:${token}`);
  const compareTokenHashMock = vi.fn();

  const sendEmailMock = vi.fn().mockResolvedValue({ ok: true });

  vi.doMock(prismaPath, () => ({
    prismaClient: prismaClientMock,
  }));

  vi.doMock(tokenHelperPath, () => ({
    compareTokenHash: compareTokenHashMock,
    hashToken: hashTokenMock,
    signAccessToken: signAccessTokenMock,
    signRefreshToken: signRefreshTokenMock,
    REFRESH_TOKEN_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,
  }));

  vi.doMock(emailServicePath, () => ({
    default: sendEmailMock,
  }));

  vi.doMock(secretsPath, () => ({
    ALLOWED_ORIGIN: "http://localhost:3000",
  }));

  const mod = await import(authHelperPath);

  return {
    ...mod,
    prismaClientMock,
    signAccessTokenMock,
    signRefreshTokenMock,
    hashTokenMock,
    compareTokenHashMock,
    sendEmailMock,
  };
}

describe("authHelper", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("cleanupOneTimeTokens deletes expired or old used tokens", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00.000Z"));

    const { cleanupOneTimeTokens, prismaClientMock } = await loadAuthHelper();

    await cleanupOneTimeTokens(prismaClientMock);

    expect(prismaClientMock.oneTimeToken.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaClientMock.oneTimeToken.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { expiresAt: { lt: new Date("2026-04-08T00:00:00.000Z") } },
          {
            usedAt: {
              lt: new Date("2026-04-07T00:00:00.000Z"),
            },
          },
        ],
      },
    });
  });

  it("issueTokens creates access/refresh tokens and persists a hashed refresh token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00.000Z"));

    const {
      issueTokens,
      prismaClientMock,
      signAccessTokenMock,
      signRefreshTokenMock,
      hashTokenMock,
    } = await loadAuthHelper();

    prismaClientMock.refreshToken.findMany.mockResolvedValue([
      { id: 1, tokenHash: "t1" },
      { id: 2, tokenHash: "t2" },
      { id: 3, tokenHash: "t3" },
      { id: 4, tokenHash: "t4" },
      { id: 5, tokenHash: "t5" },
      { id: 6, tokenHash: "t6" },
    ]);

    const result = await issueTokens(42);

    expect(result).toEqual({
      accessToken: "access-42",
      refreshToken: "refresh-42",
    });

    expect(signAccessTokenMock).toHaveBeenCalledWith(42);
    expect(signRefreshTokenMock).toHaveBeenCalledWith(42);

    expect(prismaClientMock.refreshToken.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaClientMock.refreshToken.findMany).toHaveBeenCalledTimes(1);
    expect(prismaClientMock.refreshToken.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaClientMock.refreshToken.create).toHaveBeenCalledTimes(1);

    expect(prismaClientMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [1, 2] },
      },
      data: {
        revoked: true,
      },
    });

    expect(hashTokenMock).toHaveBeenCalledWith("refresh-42");

    expect(prismaClientMock.refreshToken.create).toHaveBeenCalledWith({
      data: {
        tokenHash: "hashed:refresh-42",
        userId: 42,
        expiresAt: new Date("2026-04-15T00:00:00.000Z"),
      },
    });
  });

  it("sendVerificationEmail builds the correct verification URL", async () => {
    const { sendVerificationEmail, sendEmailMock } = await loadAuthHelper();

    const req = {
      protocol: "https",
      get: vi.fn((name: string) =>
        name === "host" ? "example.com" : undefined,
      ),
    } as unknown as Request;

    await sendVerificationEmail(
      req,
      { name: "Mina", email: "mina@example.com" },
      "token 123",
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "mina@example.com",
        subject: "Verify your email",
        html: expect.stringContaining(
          "http://localhost:3000/op-market-shop/verify-email?token=token%20123",
        ),
      }),
    );
  });

  it("sendPasswordResetEmail builds the correct frontend reset URL", async () => {
    const { sendPasswordResetEmail, sendEmailMock } = await loadAuthHelper();

    await sendPasswordResetEmail(
      { name: "Mina", email: "mina@example.com" },
      "reset/token",
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "mina@example.com",
        subject: "Reset your password",
        html: expect.stringContaining(
          "http://localhost:3000/op-market-shop/reset-password?token=reset%2Ftoken",
        ),
      }),
    );
  });
});
