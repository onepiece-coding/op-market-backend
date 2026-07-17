import "dotenv/config";
import { z } from "zod";
import logger from "../utils/logger.js";

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3000),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
    REFRESH_TOKEN_SECRET: z
      .string()
      .min(32, "REFRESH_TOKEN_SECRET must be at least 32 characters"),

    CLIENT_DOMAIN: z.url("CLIENT_DOMAIN must be a valid URL"),

    ACCESS_TOKEN_EXPIRES_IN: z.string().default("15m"),
    REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),

    EMAIL_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    APP_NAME: z.string().min(1).default("op-market"),

    // Optional in test, required in dev/prod
    BREVO_API_KEY: z.string().optional(),
    FROM_EMAIL: z.email().optional(),

    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),

    PAYPAL_CLIENT_ID: z.string().optional(),
    PAYPAL_CLIENT_SECRET: z.string().optional(),
    PAYPAL_ENV: z.enum(["sandbox", "live"]).default("sandbox"),
    PAYPAL_CURRENCY: z.string().length(3).default("USD"),

    // Only for Prisma migrations, not runtime
    SHADOW_DATABASE_URL: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "test") return;

    const requireValue = (
      value: string | undefined,
      path: string,
      message: string,
    ) => {
      if (!value || !value.trim()) {
        ctx.addIssue({
          code: "custom",
          path: [path],
          message,
        });
      }
    };

    requireValue(
      data.BREVO_API_KEY,
      "BREVO_API_KEY",
      "BREVO_API_KEY is required",
    );
    requireValue(data.FROM_EMAIL, "FROM_EMAIL", "FROM_EMAIL is required");

    requireValue(
      data.CLOUDINARY_CLOUD_NAME,
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_CLOUD_NAME is required",
    );
    requireValue(
      data.CLOUDINARY_API_KEY,
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_KEY is required",
    );
    requireValue(
      data.CLOUDINARY_API_SECRET,
      "CLOUDINARY_API_SECRET",
      "CLOUDINARY_API_SECRET is required",
    );

    requireValue(
      data.PAYPAL_CLIENT_ID,
      "PAYPAL_CLIENT_ID",
      "PAYPAL_CLIENT_ID is required",
    );
    requireValue(
      data.PAYPAL_CLIENT_SECRET,
      "PAYPAL_CLIENT_SECRET",
      "PAYPAL_CLIENT_SECRET is required",
    );
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.error(
    "❌ Invalid environment variables:\n",
    z.prettifyError(parsed.error),
  );
  // logger.error("❌ Invalid environment variables:\n", parsed.error.format()); //use this if the prev crashes
  logger.error(
    "❯ Error details (tree):\n",
    JSON.stringify(z.treeifyError(parsed.error), null, 2),
  );
  throw new Error("Invalid environment variables — see log for details");
}

export const env = parsed.data as z.infer<typeof envSchema>;
export type Env = typeof env;
