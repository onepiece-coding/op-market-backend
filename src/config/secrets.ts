import { env } from "./env.js";

export const PORT = env.PORT;
export const DATABASE_URL = env.DATABASE_URL;
export const JWT_SECRET = env.JWT_SECRET;
export const REFRESH_TOKEN_SECRET = env.REFRESH_TOKEN_SECRET;
export const TRUST_PROXY = process.env.TRUST_PROXY ?? "1";
export const ALLOWED_ORIGIN = env.CLIENT_DOMAIN;
export const NODE_ENV = env.NODE_ENV;

export const ACCESS_TOKEN_EXPIRES_IN = env.ACCESS_TOKEN_EXPIRES_IN;
export const REFRESH_TOKEN_EXPIRES_IN = env.REFRESH_TOKEN_EXPIRES_IN;

export const BREVO_API_KEY = env.BREVO_API_KEY ?? "";
export const FROM_EMAIL = env.FROM_EMAIL ?? "";
export const EMAIL_TIMEOUT_MS = env.EMAIL_TIMEOUT_MS;

export const APP_NAME = env.APP_NAME;

export const CLOUDINARY_CLOUD_NAME = env.CLOUDINARY_CLOUD_NAME ?? "";
export const CLOUDINARY_API_KEY = env.CLOUDINARY_API_KEY ?? "";
export const CLOUDINARY_API_SECRET = env.CLOUDINARY_API_SECRET ?? "";

export const PAYPAL_CLIENT_ID = env.PAYPAL_CLIENT_ID ?? "";
export const PAYPAL_CLIENT_SECRET = env.PAYPAL_CLIENT_SECRET ?? "";
export const PAYPAL_ENV = env.PAYPAL_ENV;
export const PAYPAL_CURRENCY = env.PAYPAL_CURRENCY;
