import { z } from "zod";

export const cartSchema = z.object({
  productId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1),
});

export const changeQuantitySchema = z.object({
  quantity: z.coerce.number().int().min(1),
});
