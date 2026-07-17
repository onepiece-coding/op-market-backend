import { afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Response } from "express";

const secretsPath = "../../src/config/secrets.js";
const tokenHelperPath = "../../src/utils/tokenHelper.js";

type SecretsMock = {
  ACCESS_TOKEN_EXPIRES_IN: string;
  JWT_SECRET: string;
  NODE_ENV: "development" | "test" | "production";
  REFRESH_TOKEN_EXPIRES_IN: string;
  REFRESH_TOKEN_SECRET: string;
};

async function loadTokenHelper(overrides: Partial<SecretsMock> = {}) {
  vi.resetModules();

  vi.doMock(secretsPath, () => ({
    ACCESS_TOKEN_EXPIRES_IN: "2m",
    JWT_SECRET: "a".repeat(32),
    NODE_ENV: "test",
    REFRESH_TOKEN_EXPIRES_IN: "3h",
    REFRESH_TOKEN_SECRET: "b".repeat(32),
    ...overrides,
  }));

  return import(tokenHelperPath);
}

describe("tokenHelper", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("signAccessToken and signRefreshToken create verifiable JWTs", async () => {
    const { signAccessToken, signRefreshToken } = await loadTokenHelper();

    const accessToken = signAccessToken(123);
    const refreshToken = signRefreshToken(456);

    expect(jwt.verify(accessToken, "a".repeat(32))).toMatchObject({
      userId: 123,
    });
    expect(jwt.verify(refreshToken, "b".repeat(32))).toMatchObject({
      userId: 456,
    });
  });

  it("hashToken and compareTokenHash work together", async () => {
    const { hashToken, compareTokenHash } = await loadTokenHelper();

    const rawToken = "plain-token-value";
    const hash = hashToken(rawToken);

    expect(hash).not.toBe(rawToken);
    expect(compareTokenHash(rawToken, hash)).toBe(true);
    expect(compareTokenHash("wrong-token", hash)).toBe(false);
  });

  it("computes ACCESS_TOKEN_MAX_AGE_MS and REFRESH_TOKEN_MAX_AGE_MS from duration strings", async () => {
    const { ACCESS_TOKEN_MAX_AGE_MS, REFRESH_TOKEN_MAX_AGE_MS } =
      await loadTokenHelper({
        ACCESS_TOKEN_EXPIRES_IN: "45s",
        REFRESH_TOKEN_EXPIRES_IN: "2h",
      });

    expect(ACCESS_TOKEN_MAX_AGE_MS).toBe(45_000);
    expect(REFRESH_TOKEN_MAX_AGE_MS).toBe(2 * 60 * 60 * 1000);
  });

  it("falls back to defaults for invalid duration strings", async () => {
    const { ACCESS_TOKEN_MAX_AGE_MS, REFRESH_TOKEN_MAX_AGE_MS } =
      await loadTokenHelper({
        ACCESS_TOKEN_EXPIRES_IN: "bad-value",
        REFRESH_TOKEN_EXPIRES_IN: "also-bad",
      });

    expect(ACCESS_TOKEN_MAX_AGE_MS).toBe(15 * 60 * 1000);
    expect(REFRESH_TOKEN_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("sets both auth cookies with the expected options", async () => {
    const {
      setAuthCookies,
      ACCESS_TOKEN_MAX_AGE_MS,
      REFRESH_TOKEN_MAX_AGE_MS,
    } = await loadTokenHelper();

    const res = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as Response;

    setAuthCookies(res, "access.jwt", "refresh.jwt");

    expect(res.cookie).toHaveBeenNthCalledWith(1, "accessToken", "access.jwt", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_TOKEN_MAX_AGE_MS,
    });

    expect(res.cookie).toHaveBeenNthCalledWith(
      2,
      "refreshToken",
      "refresh.jwt",
      {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: REFRESH_TOKEN_MAX_AGE_MS,
      },
    );
  });

  it("clears both auth cookies with matching options", async () => {
    const { clearAuthCookies } = await loadTokenHelper();

    const res = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as Response;

    clearAuthCookies(res);

    expect(res.clearCookie).toHaveBeenNthCalledWith(1, "accessToken", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    });

    expect(res.clearCookie).toHaveBeenNthCalledWith(2, "refreshToken", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
    });
  });

  it("sets auth cookies with secure=true and sameSite=none in production", async () => {
    const { setAuthCookies } = await loadTokenHelper({
      NODE_ENV: "production",
    });

    const res = {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as unknown as Response;

    setAuthCookies(res, "access.jwt", "refresh.jwt");

    expect(res.cookie).toHaveBeenNthCalledWith(1, "accessToken", "access.jwt", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
      maxAge: expect.any(Number),
    });

    expect(res.cookie).toHaveBeenNthCalledWith(
      2,
      "refreshToken",
      "refresh.jwt",
      {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: expect.any(Number),
      },
    );
  });
});
