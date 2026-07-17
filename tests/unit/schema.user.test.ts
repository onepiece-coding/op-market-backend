import { describe, expect, it } from "vitest";
import {
  addressSchema,
  changeUserRoleSchema,
  forgotPasswordSchema,
  loginSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  signUpSchema,
  updateUserSchema,
} from "../../src/schema/userSchema.js";

describe("userSchema", () => {
  describe("signUpSchema", () => {
    it("accepts valid signup data", () => {
      const result = signUpSchema.parse({
        name: "Mina",
        email: "mina@example.com",
        password: "secret123",
      });

      expect(result).toEqual({
        name: "Mina",
        email: "mina@example.com",
        password: "secret123",
      });
    });

    it("rejects bad email", () => {
      expect(() =>
        signUpSchema.parse({
          name: "Mina",
          email: "not-an-email",
          password: "secret123",
        }),
      ).toThrow();
    });

    it("rejects password under 6 chars", () => {
      expect(() =>
        signUpSchema.parse({
          name: "Mina",
          email: "mina@example.com",
          password: "12345",
        }),
      ).toThrow();
    });
  });

  describe("loginSchema", () => {
    it("accepts valid login data", () => {
      const result = loginSchema.parse({
        email: "mina@example.com",
        password: "secret123",
      });

      expect(result).toEqual({
        email: "mina@example.com",
        password: "secret123",
      });
    });

    it("rejects invalid email", () => {
      expect(() =>
        loginSchema.parse({
          email: "bad-email",
          password: "secret123",
        }),
      ).toThrow();
    });

    it("rejects short password", () => {
      expect(() =>
        loginSchema.parse({
          email: "mina@example.com",
          password: "12345",
        }),
      ).toThrow();
    });
  });

  describe("resendVerificationSchema", () => {
    it("accepts valid email only", () => {
      const result = resendVerificationSchema.parse({
        email: "mina@example.com",
      });

      expect(result).toEqual({
        email: "mina@example.com",
      });
    });

    it("rejects invalid email", () => {
      expect(() =>
        resendVerificationSchema.parse({
          email: "bad-email",
        }),
      ).toThrow();
    });
  });

  describe("forgotPasswordSchema", () => {
    it("accepts valid email only", () => {
      const result = forgotPasswordSchema.parse({
        email: "mina@example.com",
      });

      expect(result).toEqual({
        email: "mina@example.com",
      });
    });

    it("rejects invalid email", () => {
      expect(() =>
        forgotPasswordSchema.parse({
          email: "bad-email",
        }),
      ).toThrow();
    });
  });

  describe("resetPasswordSchema", () => {
    it("accepts valid token and password", () => {
      const result = resetPasswordSchema.parse({
        token: "12345678901234567890",
        password: "secret123",
      });

      expect(result).toEqual({
        token: "12345678901234567890",
        password: "secret123",
      });
    });

    it("rejects token under 20 chars", () => {
      expect(() =>
        resetPasswordSchema.parse({
          token: "short-token",
          password: "secret123",
        }),
      ).toThrow();
    });

    it("rejects password under 6 chars", () => {
      expect(() =>
        resetPasswordSchema.parse({
          token: "12345678901234567890",
          password: "12345",
        }),
      ).toThrow();
    });
  });

  describe("addressSchema", () => {
    it("accepts valid address data", () => {
      const result = addressSchema.parse({
        lineOne: "123 Main St",
        lineTwo: "Apt 4",
        city: "Casablanca",
        country: "Morocco",
        pincode: "20000",
      });

      expect(result).toEqual({
        lineOne: "123 Main St",
        lineTwo: "Apt 4",
        city: "Casablanca",
        country: "Morocco",
        pincode: "20000",
      });
    });

    it("rejects pincode when length is not 5", () => {
      expect(() =>
        addressSchema.parse({
          lineOne: "123 Main St",
          city: "Casablanca",
          country: "Morocco",
          pincode: "2000",
        }),
      ).toThrow();

      expect(() =>
        addressSchema.parse({
          lineOne: "123 Main St",
          city: "Casablanca",
          country: "Morocco",
          pincode: "200000",
        }),
      ).toThrow();
    });
  });

  describe("updateUserSchema", () => {
    it("coerces shipping and billing ids from strings to positive ints", () => {
      const result = updateUserSchema.parse({
        defaultShippingAddress: "10",
        defaultBillingAddress: "20",
      });

      expect(result).toEqual({
        defaultShippingAddress: 10,
        defaultBillingAddress: 20,
      });
    });

    it("supports partial update with only name", () => {
      const result = updateUserSchema.parse({
        name: "New Name",
      });

      expect(result).toEqual({
        name: "New Name",
      });
    });

    it("rejects zero shipping/billing ids", () => {
      expect(() =>
        updateUserSchema.parse({
          defaultShippingAddress: "0",
        }),
      ).toThrow();

      expect(() =>
        updateUserSchema.parse({
          defaultBillingAddress: "0",
        }),
      ).toThrow();
    });

    it("rejects negative shipping/billing ids", () => {
      expect(() =>
        updateUserSchema.parse({
          defaultShippingAddress: "-1",
        }),
      ).toThrow();

      expect(() =>
        updateUserSchema.parse({
          defaultBillingAddress: "-2",
        }),
      ).toThrow();
    });

    it("rejects non-integer shipping/billing ids", () => {
      expect(() =>
        updateUserSchema.parse({
          defaultShippingAddress: "1.5",
        }),
      ).toThrow();

      expect(() =>
        updateUserSchema.parse({
          defaultBillingAddress: "2.7",
        }),
      ).toThrow();
    });
  });

  describe("changeUserRoleSchema", () => {
    it("accepts ADMIN", () => {
      const result = changeUserRoleSchema.parse({
        role: "ADMIN",
      });

      expect(result).toEqual({
        role: "ADMIN",
      });
    });

    it("accepts USER", () => {
      const result = changeUserRoleSchema.parse({
        role: "USER",
      });

      expect(result).toEqual({
        role: "USER",
      });
    });

    it("rejects any role other than ADMIN or USER", () => {
      expect(() =>
        changeUserRoleSchema.parse({
          role: "MANAGER",
        }),
      ).toThrow();
    });
  });
});
