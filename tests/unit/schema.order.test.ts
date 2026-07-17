import { describe, expect, it } from "vitest";
import { createOrderSchema } from "../../src/schema/orderSchema.js";

describe("createOrderSchema", () => {
  it('defaults paymentMethod to "CASH_ON_DELIVERY"', () => {
    const result = createOrderSchema.parse({});

    expect(result).toEqual({
      paymentMethod: "CASH_ON_DELIVERY",
    });
  });

  it("accepts PAYPAL as a valid paymentMethod", () => {
    const result = createOrderSchema.parse({
      paymentMethod: "PAYPAL",
    });

    expect(result).toEqual({
      paymentMethod: "PAYPAL",
    });
  });

  it("rejects invalid paymentMethod values", () => {
    expect(() =>
      createOrderSchema.parse({
        paymentMethod: "STRIPE",
      }),
    ).toThrow();
  });
});
