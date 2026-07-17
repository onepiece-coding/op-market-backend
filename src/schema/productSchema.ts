import { z } from "zod";

const tagsSchema = z.preprocess(
  (val) => {
    if (Array.isArray(val)) return val;

    if (typeof val === "string") {
      const trimmed = val.trim();
      if (!trimmed) return [];
      return trimmed
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }

    return [];
  },
  z.array(z.string().min(1, "Tag cannot be empty")).default([]),
);

const priceSchema = z.preprocess((val) => {
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return NaN;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : val;
  }

  return val;
}, z.number().nonnegative());

export const createProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  price: priceSchema,
  tags: tagsSchema,
});

export const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  price: priceSchema.optional(),
  tags: tagsSchema.optional(),
});
