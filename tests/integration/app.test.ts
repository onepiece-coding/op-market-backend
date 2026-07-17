import request from "supertest";
import { describe, it, expect } from "vitest";
import app from "../../src/app.js";

describe("App integration (app shell)", () => {
  it("GET /health → 200 and returns status + timestamp", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);

    expect(res.body).toHaveProperty("status", "ok");
    expect(res.body).toHaveProperty("timestamp");

    const date = new Date(res.body.timestamp);
    expect(isNaN(date.getTime())).toBe(false);
  });

  it("unknown route → 404 via notFound middleware", async () => {
    const res = await request(app).get("/some-random-route");

    expect(res.status).toBe(404);

    expect(res.body).toHaveProperty("message");
  });

  it("error pipeline returns JSON (invalid JSON body)", async () => {
    const res = await request(app)
      .post("/api/v1/auth/signup")
      .set("Content-Type", "application/json")
      .send('{"invalidJson":'); // broken JSON

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.headers["content-type"]).toContain("application/json");

    expect(res.body).toHaveProperty("message");
  });

  it("sanity: /api routes are mounted (auth route exists)", async () => {
    const res = await request(app).get("/api/v1/auth/me");

    expect(res.status).toBe(401);

    expect(res.body).toHaveProperty("message");
  });
});
