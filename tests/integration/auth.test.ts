import request from "supertest";
import { compareSync } from "bcrypt";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../helpers/prisma.js";
import {
  authHeaderFor,
  accessCookieHeaderFor,
  refreshTokenFor,
} from "../helpers/auth.js";
import {
  createOneTimeTokenRecord,
  createRefreshTokenRecord,
  createUser,
  createVerifiedUser,
} from "../helpers/factories.js";
import {
  findUserByEmail,
  listOneTimeTokensForUser,
  listRefreshTokensForUser,
} from "../helpers/db.js";
import { extractCookieValue, hasCookie } from "../helpers/cookies.js";

const originalBrevoApiKey = process.env.BREVO_API_KEY;

describe("Auth routes integration", () => {
  beforeEach(() => {
    process.env.BREVO_API_KEY = "";
  });

  afterEach(() => {
    process.env.BREVO_API_KEY = originalBrevoApiKey;
    vi.unstubAllGlobals();
  });

  describe("POST /api/v1/auth/signup", () => {
    it("creates a valid user, makes the first user ADMIN, stores hashed password, sanitizes response, and creates a verification token", async () => {
      const payload = {
        name: "First User",
        email: "first@test.com",
        password: "password123",
      };

      const res = await request(app).post("/api/v1/auth/signup").send(payload);

      expect(res.status).toBe(201);
      expect(res.body.verificationEmailSent).toBe(true);
      expect(res.body.user.email).toBe(payload.email);
      expect(res.body.user.role).toBe("ADMIN");
      expect(res.body.user).not.toHaveProperty("password");

      const user = await findUserByEmail(payload.email);
      expect(user).not.toBeNull();
      expect(user?.role).toBe("ADMIN");
      expect(user?.password).not.toBe(payload.password);
      expect(compareSync(payload.password, user!.password)).toBe(true);

      const tokens = await listOneTimeTokensForUser(user!.id);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].purpose).toBe("EMAIL_VERIFICATION");
      expect(tokens[0].usedAt).toBeNull();
    });

    it("makes the second signed-up user USER", async () => {
      await request(app).post("/api/v1/auth/signup").send({
        name: "First User",
        email: "first2@test.com",
        password: "password123",
      });

      const res = await request(app).post("/api/v1/auth/signup").send({
        name: "Second User",
        email: "second2@test.com",
        password: "password123",
      });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe("USER");
    });

    it("returns 400 for duplicate email", async () => {
      await request(app).post("/api/v1/auth/signup").send({
        name: "Dup User",
        email: "dup@test.com",
        password: "password123",
      });

      const res = await request(app).post("/api/v1/auth/signup").send({
        name: "Dup User 2",
        email: "dup@test.com",
        password: "password123",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("User already exists!");
    });

    it("returns 400 for invalid payload", async () => {
      const res = await request(app).post("/api/v1/auth/signup").send({
        name: "Bad User",
        email: "not-an-email",
        password: "123",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Validation failed");
      expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it("does not fail signup when email sending fails and sets verificationEmailSent=false", async () => {
      process.env.BREVO_API_KEY = "dummy";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")),
      );

      const res = await request(app).post("/api/v1/auth/signup").send({
        name: "Email Fail",
        email: "emailfail@test.com",
        password: "password123",
      });

      expect(res.status).toBe(201);
      expect(res.body.verificationEmailSent).toBe(false);
      expect(res.body.message).toContain("could not be sent");

      const user = await findUserByEmail("emailfail@test.com");
      expect(user).not.toBeNull();

      const tokens = await listOneTimeTokensForUser(user!.id);
      expect(tokens).toHaveLength(1);
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("returns 400 for unknown email", async () => {
      const res = await request(app).post("/api/v1/auth/login").send({
        email: "missing@test.com",
        password: "password123",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid credentials!");
    });

    it("returns 403 for unverified user", async () => {
      const { user, rawPassword } = await createUser({
        email: "unverified@test.com",
      });

      const res = await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: rawPassword,
      });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe(
        "Please verify your email before logging in.",
      );
    });

    it("returns 400 for wrong password", async () => {
      const { user } = await createVerifiedUser({
        email: "wrongpass@test.com",
        password: "password123",
      });

      const res = await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: "wrong-password",
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid credentials!");
    });

    it("logs in verified user, sets cookies, and creates a refresh token row", async () => {
      const { user, rawPassword } = await createVerifiedUser({
        email: "loginok@test.com",
      });

      const res = await request(app).post("/api/v1/auth/login").send({
        email: user.email,
        password: rawPassword,
      });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(user.email);
      expect(hasCookie(res.headers["set-cookie"], "accessToken")).toBe(true);
      expect(hasCookie(res.headers["set-cookie"], "refreshToken")).toBe(true);

      const refreshTokens = await listRefreshTokensForUser(user.id);
      expect(refreshTokens).toHaveLength(1);
      expect(refreshTokens[0].revoked).toBe(false);
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("returns 401 with no auth", async () => {
      const res = await request(app).get("/api/v1/auth/me");

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("Unauthorized!");
    });

    it("returns 200 with valid access token cookie", async () => {
      const { user } = await createVerifiedUser({
        email: "cookieauth@test.com",
      });

      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Cookie", accessCookieHeaderFor(user.id));

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(user.email);
    });

    it("returns 200 with valid bearer token and 401 if user behind token was deleted", async () => {
      const { user } = await createVerifiedUser({
        email: "bearerauth@test.com",
      });

      const okRes = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", authHeaderFor(user.id));

      expect(okRes.status).toBe(200);
      expect(okRes.body.email).toBe(user.email);

      await prisma.user.delete({
        where: { id: user.id },
      });

      const deletedRes = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", authHeaderFor(user.id));

      expect(deletedRes.status).toBe(401);
      expect(deletedRes.body.message).toBe("Unauthorized!");
    });
  });

  describe("GET /api/v1/auth/verify-email", () => {
    it("returns 400 for missing token", async () => {
      const res = await request(app).get("/api/v1/auth/verify-email");

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Missing verification token");
    });

    it("returns 400 for invalid token", async () => {
      const res = await request(app).get(
        "/api/v1/auth/verify-email?token=totally-invalid",
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Invalid or expired verification token");
    });

    it("returns 400 for expired or already used token", async () => {
      const { user: expiredUser } = await createUser({
        email: "expired-verify@test.com",
      });

      const { rawToken: expiredToken } = await createOneTimeTokenRecord(
        expiredUser.id,
        {
          purpose: "EMAIL_VERIFICATION",
          expiresAt: new Date(Date.now() - 60_000),
        },
      );

      const expiredRes = await request(app).get(
        `/api/v1/auth/verify-email?token=${encodeURIComponent(expiredToken)}`,
      );

      expect(expiredRes.status).toBe(400);
      expect(expiredRes.body.message).toBe(
        "Invalid or expired verification token",
      );

      const { user: usedUser } = await createUser({
        email: "used-verify@test.com",
      });

      const { rawToken: usedToken } = await createOneTimeTokenRecord(
        usedUser.id,
        {
          purpose: "EMAIL_VERIFICATION",
          usedAt: new Date(),
        },
      );

      const usedRes = await request(app).get(
        `/api/v1/auth/verify-email?token=${encodeURIComponent(usedToken)}`,
      );

      expect(usedRes.status).toBe(400);
      expect(usedRes.body.message).toBe(
        "Invalid or expired verification token",
      );
    });

    it("verifies email, marks token used, issues cookies, and creates refresh token", async () => {
      const { user } = await createUser({
        email: "verifyok@test.com",
      });

      const { rawToken, record } = await createOneTimeTokenRecord(user.id, {
        purpose: "EMAIL_VERIFICATION",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });

      const res = await request(app).get(
        `/api/v1/auth/verify-email?token=${encodeURIComponent(rawToken)}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(user.email);
      expect(res.body.message).toBe("Email verified successfully.");
      expect(hasCookie(res.headers["set-cookie"], "accessToken")).toBe(true);
      expect(hasCookie(res.headers["set-cookie"], "refreshToken")).toBe(true);

      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.emailVerifiedAt).not.toBeNull();

      const updatedToken = await prisma.oneTimeToken.findUnique({
        where: { id: record.id },
      });
      expect(updatedToken?.usedAt).not.toBeNull();

      const refreshTokens = await listRefreshTokensForUser(user.id);
      expect(refreshTokens).toHaveLength(1);
    });
  });

  describe("POST /api/v1/auth/resend-verification", () => {
    it("returns generic 200 for unknown email and verified user", async () => {
      const unknownRes = await request(app)
        .post("/api/v1/auth/resend-verification")
        .send({ email: "unknown@test.com" });

      expect(unknownRes.status).toBe(200);
      expect(unknownRes.body.message).toBe(
        "If the email exists and is not verified, a verification email has been sent.",
      );

      const { user } = await createVerifiedUser({
        email: "alreadyverified@test.com",
      });

      const verifiedRes = await request(app)
        .post("/api/v1/auth/resend-verification")
        .send({ email: user.email });

      expect(verifiedRes.status).toBe(200);
      expect(verifiedRes.body.message).toBe(
        "If the email exists and is not verified, a verification email has been sent.",
      );
    });

    it("returns generic 200 for unverified user, replaces old token, and still returns 200 if email sending fails", async () => {
      const { user } = await createUser({
        email: "resend@test.com",
      });

      const first = await createOneTimeTokenRecord(user.id, {
        purpose: "EMAIL_VERIFICATION",
      });

      process.env.BREVO_API_KEY = "dummy";
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")),
      );

      const res = await request(app)
        .post("/api/v1/auth/resend-verification")
        .send({ email: user.email });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(
        "If the email exists and is not verified, a verification email has been sent.",
      );

      const tokens = await listOneTimeTokensForUser(user.id);
      expect(tokens).toHaveLength(1);
      expect(tokens[0].purpose).toBe("EMAIL_VERIFICATION");
      expect(tokens[0].id).not.toBe(first.record.id);
    });
  });

  describe("POST /api/v1/auth/forgot-password", () => {
    it("returns generic 200 for unknown email and creates a reset token for existing user while removing previous ones", async () => {
      const unknownRes = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "missing-reset@test.com" });

      expect(unknownRes.status).toBe(200);
      expect(unknownRes.body.message).toBe(
        "If the email exists, a password reset link has been sent.",
      );

      const { user } = await createVerifiedUser({
        email: "forgot@test.com",
      });

      const first = await createOneTimeTokenRecord(user.id, {
        purpose: "PASSWORD_RESET",
      });

      const existingRes = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: user.email });

      expect(existingRes.status).toBe(200);
      expect(existingRes.body.message).toBe(
        "If the email exists, a password reset link has been sent.",
      );

      const tokens = await prisma.oneTimeToken.findMany({
        where: {
          userId: user.id,
          purpose: "PASSWORD_RESET",
        },
        orderBy: { id: "asc" },
      });

      expect(tokens).toHaveLength(1);
      expect(tokens[0].id).not.toBe(first.record.id);
    });
  });

  describe("POST /api/v1/auth/reset-password", () => {
    it("returns 400 for invalid, expired, or used token", async () => {
      const invalidRes = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({
          token: "x".repeat(64),
          password: "newpassword123",
        });

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.message).toBe("Invalid or expired reset token");

      const { user: expiredUser } = await createVerifiedUser({
        email: "expired-reset@test.com",
      });

      const { rawToken: expiredToken } = await createOneTimeTokenRecord(
        expiredUser.id,
        {
          purpose: "PASSWORD_RESET",
          expiresAt: new Date(Date.now() - 60_000),
        },
      );

      const expiredRes = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({
          token: expiredToken,
          password: "newpassword123",
        });

      expect(expiredRes.status).toBe(400);
      expect(expiredRes.body.message).toBe("Invalid or expired reset token");

      const { user: usedUser } = await createVerifiedUser({
        email: "used-reset@test.com",
      });

      const { rawToken: usedToken } = await createOneTimeTokenRecord(
        usedUser.id,
        {
          purpose: "PASSWORD_RESET",
          usedAt: new Date(),
        },
      );

      const usedRes = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({
          token: usedToken,
          password: "newpassword123",
        });

      expect(usedRes.status).toBe(400);
      expect(usedRes.body.message).toBe("Invalid or expired reset token");
    });

    it("updates password, marks token used, revokes refresh tokens, clears cookies, and returns 200", async () => {
      const { user, rawPassword } = await createVerifiedUser({
        email: "resetok@test.com",
        password: "oldpassword123",
      });

      const { rawToken, record } = await createOneTimeTokenRecord(user.id, {
        purpose: "PASSWORD_RESET",
      });

      await createRefreshTokenRecord(user.id);

      const res = await request(app).post("/api/v1/auth/reset-password").send({
        token: rawToken,
        password: "newpassword123",
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe(
        "Password reset successfully. Please log in again.",
      );
      expect(res.body.user.email).toBe(user.email);

      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser).not.toBeNull();
      expect(updatedUser?.password).not.toBe(rawPassword);
      expect(compareSync("newpassword123", updatedUser!.password)).toBe(true);

      const updatedToken = await prisma.oneTimeToken.findUnique({
        where: { id: record.id },
      });
      expect(updatedToken?.usedAt).not.toBeNull();

      const refreshTokens = await listRefreshTokensForUser(user.id);
      expect(refreshTokens).toHaveLength(1);
      expect(refreshTokens[0].revoked).toBe(true);

      const setCookie = res.headers["set-cookie"];
      expect(hasCookie(setCookie, "accessToken")).toBe(true);
      expect(hasCookie(setCookie, "refreshToken")).toBe(true);

      const accessCookie = extractCookieValue(setCookie, "accessToken");
      const refreshCookie = extractCookieValue(setCookie, "refreshToken");
      expect(accessCookie).toBe("");
      expect(refreshCookie).toBe("");
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("returns 401 for no cookie, invalid token, revoked token, or missing matching DB token", async () => {
      const noCookieRes = await request(app).post("/api/v1/auth/refresh");

      expect(noCookieRes.status).toBe(401);
      expect(noCookieRes.body.message).toBe("No refresh token");

      const invalidRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", ["refreshToken=not-a-valid-jwt"]);

      expect(invalidRes.status).toBe(401);
      expect(invalidRes.body.message).toBe("Invalid refresh token");

      const { user: revokedUser } = await createVerifiedUser({
        email: "revoked-refresh@test.com",
      });

      const revokedRawToken = refreshTokenFor(revokedUser.id);

      await createRefreshTokenRecord(revokedUser.id, {
        token: revokedRawToken,
        revoked: true,
      });

      const revokedRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [`refreshToken=${revokedRawToken}`]);

      expect(revokedRes.status).toBe(401);
      expect(revokedRes.body.message).toBe("Refresh token revoked or invalid");

      const { user: missingUser } = await createVerifiedUser({
        email: "missing-refresh@test.com",
      });

      const agent = request.agent(app);
      const loginRes = await agent.post("/api/v1/auth/login").send({
        email: missingUser.email,
        password: "password123",
      });

      const refreshToken = extractCookieValue(
        loginRes.headers["set-cookie"],
        "refreshToken",
      );
      expect(refreshToken).toBeTruthy();

      await prisma.refreshToken.deleteMany({
        where: { userId: missingUser.id },
      });

      const missingRes = await request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", [`refreshToken=${refreshToken}`]);

      expect(missingRes.status).toBe(401);
      expect(missingRes.body.message).toBe("Refresh token revoked or invalid");
    });

    it("rotates refresh token, revokes old token, sets new cookies, and returns user payload", async () => {
      const { user, rawPassword } = await createVerifiedUser({
        email: "refreshok@test.com",
      });

      const agent = request.agent(app);

      const loginRes = await agent.post("/api/v1/auth/login").send({
        email: user.email,
        password: rawPassword,
      });

      expect(loginRes.status).toBe(200);

      const beforeTokens = await listRefreshTokensForUser(user.id);
      expect(beforeTokens).toHaveLength(1);
      expect(beforeTokens[0].revoked).toBe(false);

      const refreshRes = await agent.post("/api/v1/auth/refresh");

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.user.email).toBe(user.email);
      expect(hasCookie(refreshRes.headers["set-cookie"], "accessToken")).toBe(
        true,
      );
      expect(hasCookie(refreshRes.headers["set-cookie"], "refreshToken")).toBe(
        true,
      );

      const afterTokens = await listRefreshTokensForUser(user.id);
      expect(afterTokens).toHaveLength(2);
      expect(afterTokens.filter((t) => t.revoked)).toHaveLength(1);
      expect(afterTokens.filter((t) => !t.revoked)).toHaveLength(1);
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("returns 200 with no cookie and clears cookies even with invalid token", async () => {
      const noCookieRes = await request(app).post("/api/v1/auth/logout");

      expect(noCookieRes.status).toBe(200);
      expect(noCookieRes.body.message).toBe("Logged out");

      const invalidRes = await request(app)
        .post("/api/v1/auth/logout")
        .set("Cookie", ["refreshToken=not-a-valid-jwt"]);

      expect(invalidRes.status).toBe(200);
      expect(invalidRes.body.message).toBe("Logged out");
      expect(hasCookie(invalidRes.headers["set-cookie"], "accessToken")).toBe(
        true,
      );
      expect(hasCookie(invalidRes.headers["set-cookie"], "refreshToken")).toBe(
        true,
      );

      const accessCookie = extractCookieValue(
        invalidRes.headers["set-cookie"],
        "accessToken",
      );
      const refreshCookie = extractCookieValue(
        invalidRes.headers["set-cookie"],
        "refreshToken",
      );
      expect(accessCookie).toBe("");
      expect(refreshCookie).toBe("");
    });

    it("revokes valid refresh token and clears cookies", async () => {
      const { user, rawPassword } = await createVerifiedUser({
        email: "logoutok@test.com",
      });

      const agent = request.agent(app);

      const loginRes = await agent.post("/api/v1/auth/login").send({
        email: user.email,
        password: rawPassword,
      });

      expect(loginRes.status).toBe(200);

      const beforeTokens = await listRefreshTokensForUser(user.id);
      expect(beforeTokens).toHaveLength(1);
      expect(beforeTokens[0].revoked).toBe(false);

      const logoutRes = await agent.post("/api/v1/auth/logout");

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.message).toBe("Logged out");
      expect(hasCookie(logoutRes.headers["set-cookie"], "accessToken")).toBe(
        true,
      );
      expect(hasCookie(logoutRes.headers["set-cookie"], "refreshToken")).toBe(
        true,
      );

      const afterTokens = await listRefreshTokensForUser(user.id);
      expect(afterTokens).toHaveLength(1);
      expect(afterTokens[0].revoked).toBe(true);
    });
  });
});
