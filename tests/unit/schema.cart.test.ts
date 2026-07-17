import { describe, expect, it } from "vitest";
import {
  cartSchema,
  changeQuantitySchema,
} from "../../src/schema/cartSchema.js";

describe("cartSchema", () => {
  it("coerces productId and quantity from strings to numbers", () => {
    const result = cartSchema.parse({
      productId: "12",
      quantity: "3",
    });

    expect(result).toEqual({
      productId: 12,
      quantity: 3,
    });
  });

  it("rejects invalid productId values", () => {
    expect(() =>
      cartSchema.parse({
        productId: "0",
        quantity: "1",
      }),
    ).toThrow();

    expect(() =>
      cartSchema.parse({
        productId: "-5",
        quantity: "1",
      }),
    ).toThrow();

    expect(() =>
      cartSchema.parse({
        productId: "1.5",
        quantity: "1",
      }),
    ).toThrow();
  });

  it("rejects invalid quantity values", () => {
    expect(() =>
      cartSchema.parse({
        productId: "1",
        quantity: "0",
      }),
    ).toThrow();

    expect(() =>
      cartSchema.parse({
        productId: "1",
        quantity: "-1",
      }),
    ).toThrow();

    expect(() =>
      cartSchema.parse({
        productId: "1",
        quantity: "1.5",
      }),
    ).toThrow();
  });
});

describe("changeQuantitySchema", () => {
  it("coerces quantity from string to number", () => {
    const result = changeQuantitySchema.parse({
      quantity: "4",
    });

    expect(result).toEqual({
      quantity: 4,
    });
  });

  it("rejects zero quantity", () => {
    expect(() =>
      changeQuantitySchema.parse({
        quantity: "0",
      }),
    ).toThrow();
  });

  it("rejects negative quantity", () => {
    expect(() =>
      changeQuantitySchema.parse({
        quantity: "-2",
      }),
    ).toThrow();
  });
});
