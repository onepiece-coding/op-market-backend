import { describe, expect, it } from "vitest";
import {
  createProductSchema,
  updateProductSchema,
} from "../../src/schema/productSchema.js";

describe("createProductSchema", () => {
  it("normalizes tags from an array", () => {
    const result = createProductSchema.parse({
      name: "Phone",
      description: "Nice phone",
      price: 100,
      tags: ["electronics", "mobile"],
    });

    expect(result.tags).toEqual(["electronics", "mobile"]);
  });

  it("normalizes tags from a comma-separated string", () => {
    const result = createProductSchema.parse({
      name: "Phone",
      description: "Nice phone",
      price: 100,
      tags: " electronics, mobile, gadgets ",
    });

    expect(result.tags).toEqual(["electronics", "mobile", "gadgets"]);
  });

  it("turns an empty tag string into an empty array", () => {
    const result = createProductSchema.parse({
      name: "Phone",
      description: "Nice phone",
      price: 100,
      tags: "   ",
    });

    expect(result.tags).toEqual([]);
  });

  it("defaults tags to an empty array when missing", () => {
    const result = createProductSchema.parse({
      name: "Phone",
      description: "Nice phone",
      price: 100,
    });

    expect(result.tags).toEqual([]);
  });

  it("coerces numeric price strings into numbers", () => {
    const result = createProductSchema.parse({
      name: "Phone",
      description: "Nice phone",
      price: "199.99",
      tags: "electronics",
    });

    expect(result.price).toBe(199.99);
  });

  it("rejects an empty price string", () => {
    expect(() =>
      createProductSchema.parse({
        name: "Phone",
        description: "Nice phone",
        price: "",
        tags: "electronics",
      }),
    ).toThrow();
  });

  it("rejects negative prices", () => {
    expect(() =>
      createProductSchema.parse({
        name: "Phone",
        description: "Nice phone",
        price: -5,
        tags: "electronics",
      }),
    ).toThrow();
  });
});

describe("updateProductSchema", () => {
  it("allows partial updates", () => {
    const result = updateProductSchema.parse({
      name: "Updated name",
    });

    expect(result).toEqual({
      name: "Updated name",
    });
  });

  it("normalizes tags for updates from comma-separated strings", () => {
    const result = updateProductSchema.parse({
      tags: " one, two , three ",
    });

    expect(result.tags).toEqual(["one", "two", "three"]);
  });

  it("allows tags to be omitted in updates", () => {
    const result = updateProductSchema.parse({
      price: "25",
    });

    expect(result).toEqual({
      price: 25,
    });
  });
});
