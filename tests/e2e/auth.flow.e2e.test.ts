import request from "supertest";
import { compareSync } from "bcrypt";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../helpers/prisma.js";
import { findUserByEmail, listOneTimeTokensForUser } from "../helpers/db.js";
import { hashOneTimeToken } from "../../src/utils/authHelper.js";
import { hasCookie } from "../helpers/cookies.js";

const originalBrevoApiKey = process.env.BREVO_API_KEY;

describe("Auth E2E flow", () => {
  beforeEach(() => {
    process.env.BREVO_API_KEY = "";
  });

  afterEach(() => {
    process.env.BREVO_API_KEY = originalBrevoApiKey;
    vi.unstubAllGlobals();
  });

  it("signup → verify email → login → me", async () => {
    const agent = request.agent(app);

    const signupPayload = {
      name: "E2E User",
      email: "e2e-user@test.com",
      password: "password123",
    };

    const signupRes = await agent
      .post("/api/v1/auth/signup")
      .send(signupPayload);

    expect(signupRes.status).toBe(201);
    expect(signupRes.body.verificationEmailSent).toBe(true);
    expect(signupRes.body.user.name).toBe(signupPayload.name);
    expect(signupRes.body.user.email).toBe(signupPayload.email);
    expect(signupRes.body.user.role).toBe("ADMIN");
    expect(signupRes.body.user).not.toHaveProperty("password");

    const createdUser = await findUserByEmail(signupPayload.email);

    expect(createdUser).not.toBeNull();
    expect(createdUser?.emailVerifiedAt).toBeNull();
    expect(createdUser?.password).not.toBe(signupPayload.password);
    expect(compareSync(signupPayload.password, createdUser!.password)).toBe(
      true,
    );

    const verificationTokens = await listOneTimeTokensForUser(createdUser!.id);

    expect(verificationTokens).toHaveLength(1);
    expect(verificationTokens[0].purpose).toBe("EMAIL_VERIFICATION");
    expect(verificationTokens[0].usedAt).toBeNull();

    const tokenRecord = await prisma.oneTimeToken.findFirst({
      where: {
        userId: createdUser!.id,
        purpose: "EMAIL_VERIFICATION",
        usedAt: null,
      },
      orderBy: { id: "desc" },
    });

    expect(tokenRecord).not.toBeNull();

    const rawToken = "known-e2e-verification-token";

    await prisma.oneTimeToken.update({
      where: { id: tokenRecord!.id },
      data: {
        tokenHash: hashOneTimeToken(rawToken),
      },
    });

    const verifyRes = await agent.get(
      `/api/v1/auth/verify-email?token=${encodeURIComponent(rawToken)}`,
    );

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.user.email).toBe(signupPayload.email);
    expect(verifyRes.body.message).toBe("Email verified successfully.");
    expect(hasCookie(verifyRes.headers["set-cookie"], "accessToken")).toBe(
      true,
    );
    expect(hasCookie(verifyRes.headers["set-cookie"], "refreshToken")).toBe(
      true,
    );

    const verifiedUser = await findUserByEmail(signupPayload.email);
    expect(verifiedUser?.emailVerifiedAt).not.toBeNull();

    const usedToken = await prisma.oneTimeToken.findUnique({
      where: { id: tokenRecord!.id },
    });
    expect(usedToken?.usedAt).not.toBeNull();

    const tokensAfterVerify = await prisma.refreshToken.findMany({
      where: { userId: createdUser!.id },
    });
    expect(tokensAfterVerify.length).toBeGreaterThan(0);

    const loginRes = await agent.post("/api/v1/auth/login").send({
      email: signupPayload.email,
      password: signupPayload.password,
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.email).toBe(signupPayload.email);
    expect(hasCookie(loginRes.headers["set-cookie"], "accessToken")).toBe(true);
    expect(hasCookie(loginRes.headers["set-cookie"], "refreshToken")).toBe(
      true,
    );

    const meRes = await agent.get("/api/v1/auth/me");

    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe(signupPayload.email);
    expect(meRes.body.name).toBe(signupPayload.name);
    expect(meRes.body.role).toBe("ADMIN");
    expect(meRes.body).not.toHaveProperty("password");
  });
});
