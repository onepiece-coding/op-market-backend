import { z } from "zod";

export const signUpSchema = z.object({
  name: z.string(),
  email: z.email(),
  password: z.string().min(6),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
});

export const resendVerificationSchema = z.object({
  email: z.email(),
});

export const forgotPasswordSchema = z.object({
  email: z.email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(6),
});

export const addressSchema = z.object({
  lineOne: z.string(),
  lineTwo: z.string().optional(),
  city: z.string(),
  country: z.string(),
  pincode: z.string().length(5),
});

export const updateUserSchema = z.object({
  name: z.string().optional(),
  defaultShippingAddress: z.coerce.number().int().positive().optional(),
  defaultBillingAddress: z.coerce.number().int().positive().optional(),
});

export const changeUserRoleSchema = z.object({
  role: z.enum(["ADMIN", "USER"]),
});
