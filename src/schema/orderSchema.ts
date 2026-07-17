import { z } from "zod";

export const createOrderSchema = z.object({
  paymentMethod: z
    .enum(["CASH_ON_DELIVERY", "PAYPAL"])
    .default("CASH_ON_DELIVERY"),
});
