import { describe, expect, it } from "vitest";
import { publicUserSelect } from "../../src/utils/publicUserSelect.js";

describe("publicUserSelect", () => {
  it("includes the expected public fields", () => {
    expect(publicUserSelect).toEqual({
      id: true,
      name: true,
      email: true,
      emailVerifiedAt: true,
      createdAt: true,
      updatedAt: true,
      role: true,
      defaultShippingAddress: true,
      defaultBillingAddress: true,
    });
  });

  it("does not expose sensitive fields", () => {
    expect(publicUserSelect).not.toHaveProperty("password");
    expect(publicUserSelect).not.toHaveProperty("refreshTokens");
    expect(publicUserSelect).not.toHaveProperty("oneTimeTokens");
  });
});
