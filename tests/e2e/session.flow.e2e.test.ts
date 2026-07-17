import request from "supertest";
import { describe, it, expect } from "vitest";
import app from "../../src/app.js";
import { createVerifiedUser } from "../helpers/factories.js";
import { extractCookieValue, hasCookie } from "../helpers/cookies.js";
import { listRefreshTokensForUser } from "../helpers/db.js";

describe("Session lifecycle E2E flow", () => {
  it("login → refresh → logout → protected route fails", async () => {
    const agent = request.agent(app);

    const { user, rawPassword } = await createVerifiedUser({
      email: "session-e2e-user@test.com",
      password: "password123",
    });

    const loginRes = await agent.post("/api/v1/auth/login").send({
      email: user.email,
      password: rawPassword,
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.email).toBe(user.email);
    expect(hasCookie(loginRes.headers["set-cookie"], "accessToken")).toBe(true);
    expect(hasCookie(loginRes.headers["set-cookie"], "refreshToken")).toBe(
      true,
    );

    const loginRefreshToken = extractCookieValue(
      loginRes.headers["set-cookie"],
      "refreshToken",
    );

    expect(loginRefreshToken).toBeTruthy();

    const tokensAfterLogin = await listRefreshTokensForUser(user.id);
    expect(tokensAfterLogin).toHaveLength(1);
    expect(tokensAfterLogin[0].revoked).toBe(false);

    const refreshRes = await agent.post("/api/v1/auth/refresh");

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.user.email).toBe(user.email);
    expect(hasCookie(refreshRes.headers["set-cookie"], "accessToken")).toBe(
      true,
    );
    expect(hasCookie(refreshRes.headers["set-cookie"], "refreshToken")).toBe(
      true,
    );

    const refreshedToken = extractCookieValue(
      refreshRes.headers["set-cookie"],
      "refreshToken",
    );

    expect(refreshedToken).toBeTruthy();

    const tokensAfterRefresh = await listRefreshTokensForUser(user.id);
    expect(tokensAfterRefresh).toHaveLength(2);
    expect(tokensAfterRefresh.filter((t) => t.revoked)).toHaveLength(1);
    expect(tokensAfterRefresh.filter((t) => !t.revoked)).toHaveLength(1);

    const logoutRes = await agent.post("/api/v1/auth/logout");

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.message).toBe("Logged out");
    expect(hasCookie(logoutRes.headers["set-cookie"], "accessToken")).toBe(
      true,
    );
    expect(hasCookie(logoutRes.headers["set-cookie"], "refreshToken")).toBe(
      true,
    );

    const clearedAccessToken = extractCookieValue(
      logoutRes.headers["set-cookie"],
      "accessToken",
    );
    const clearedRefreshToken = extractCookieValue(
      logoutRes.headers["set-cookie"],
      "refreshToken",
    );

    expect(clearedAccessToken).toBe("");
    expect(clearedRefreshToken).toBe("");

    const tokensAfterLogout = await listRefreshTokensForUser(user.id);
    expect(tokensAfterLogout).toHaveLength(2);
    expect(tokensAfterLogout.every((t) => t.revoked)).toBe(true);

    const meRes = await agent.get("/api/v1/auth/me");

    expect(meRes.status).toBe(401);
    expect(meRes.body.message).toBe("Unauthorized!");
  });
});
