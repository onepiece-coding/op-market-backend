import { afterEach, describe, expect, it, vi } from "vitest";

const envPath = "../../src/config/env.js";
const loggerPath = "../../src/utils/logger.js";

type EnvInput = Record<string, string | undefined>;

const ORIGINAL_ENV = { ...process.env };

function setEnv(values: EnvInput) {
  process.env = Object.fromEntries(
    Object.entries({
      NODE_ENV: values.NODE_ENV,
      DATABASE_URL: values.DATABASE_URL,
      JWT_SECRET: values.JWT_SECRET,
      REFRESH_TOKEN_SECRET: values.REFRESH_TOKEN_SECRET,
      CLIENT_DOMAIN: values.CLIENT_DOMAIN,
      PORT: values.PORT,
      ACCESS_TOKEN_EXPIRES_IN: values.ACCESS_TOKEN_EXPIRES_IN,
      REFRESH_TOKEN_EXPIRES_IN: values.REFRESH_TOKEN_EXPIRES_IN,
      EMAIL_TIMEOUT_MS: values.EMAIL_TIMEOUT_MS,
      APP_NAME: values.APP_NAME,
      BREVO_API_KEY: values.BREVO_API_KEY,
      FROM_EMAIL: values.FROM_EMAIL,
      CLOUDINARY_CLOUD_NAME: values.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: values.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: values.CLOUDINARY_API_SECRET,
      PAYPAL_CLIENT_ID: values.PAYPAL_CLIENT_ID,
      PAYPAL_CLIENT_SECRET: values.PAYPAL_CLIENT_SECRET,
      PAYPAL_ENV: values.PAYPAL_ENV,
      PAYPAL_CURRENCY: values.PAYPAL_CURRENCY,
      SHADOW_DATABASE_URL: values.SHADOW_DATABASE_URL,
    }).filter(([, value]) => value !== undefined),
  );
}

async function loadEnvModule() {
  vi.resetModules();

  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };

  vi.doMock(loggerPath, () => ({
    default: logger,
  }));

  return {
    mod: await import(envPath),
    logger,
  };
}

describe("config/env", () => {
  afterEach(() => {
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it("parses valid minimal NODE_ENV=test env without Brevo/Cloudinary/PayPal values", async () => {
    setEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/testdb",
      JWT_SECRET: "a".repeat(32),
      REFRESH_TOKEN_SECRET: "b".repeat(32),
      CLIENT_DOMAIN: "http://localhost:3000/op-market-shop",
      BREVO_API_KEY: undefined,
      FROM_EMAIL: undefined,
      CLOUDINARY_CLOUD_NAME: undefined,
      CLOUDINARY_API_KEY: undefined,
      CLOUDINARY_API_SECRET: undefined,
      PAYPAL_CLIENT_ID: undefined,
      PAYPAL_CLIENT_SECRET: undefined,
    });

    const { mod } = await loadEnvModule();

    expect(mod.env.NODE_ENV).toBe("test");
    expect(mod.env.DATABASE_URL).toBe(
      "postgresql://user:pass@localhost:5432/testdb",
    );
    expect(mod.env.JWT_SECRET).toBe("a".repeat(32));
    expect(mod.env.REFRESH_TOKEN_SECRET).toBe("b".repeat(32));
    expect(mod.env.CLIENT_DOMAIN).toBe("http://localhost:3000/op-market-shop");
  });

  it("applies defaults for PORT, token expirations, EMAIL_TIMEOUT_MS, APP_NAME, PAYPAL_ENV, and PAYPAL_CURRENCY", async () => {
    setEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/testdb",
      JWT_SECRET: "a".repeat(32),
      REFRESH_TOKEN_SECRET: "b".repeat(32),
      CLIENT_DOMAIN: "http://localhost:3000/op-market-shop",
      PORT: undefined,
      ACCESS_TOKEN_EXPIRES_IN: undefined,
      REFRESH_TOKEN_EXPIRES_IN: undefined,
      EMAIL_TIMEOUT_MS: undefined,
      APP_NAME: undefined,
      PAYPAL_ENV: undefined,
      PAYPAL_CURRENCY: undefined,
    });

    const { mod } = await loadEnvModule();

    expect(mod.env.PORT).toBe(3000);
    expect(mod.env.ACCESS_TOKEN_EXPIRES_IN).toBe("15m");
    expect(mod.env.REFRESH_TOKEN_EXPIRES_IN).toBe("7d");
    expect(mod.env.EMAIL_TIMEOUT_MS).toBe(10_000);
    expect(mod.env.APP_NAME).toBe("op-market");
    expect(mod.env.PAYPAL_ENV).toBe("sandbox");
    expect(mod.env.PAYPAL_CURRENCY).toBe("USD");
  });

  it("fails on invalid CLIENT_DOMAIN", async () => {
    setEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/testdb",
      JWT_SECRET: "a".repeat(32),
      REFRESH_TOKEN_SECRET: "b".repeat(32),
      CLIENT_DOMAIN: "not-a-url",
    });

    const { logger } = await loadEnvModule().catch(() => ({
      logger: null,
    }));

    await expect(loadEnvModule()).rejects.toThrow(
      "Invalid environment variables — see log for details",
    );

    if (logger) {
      expect(logger.error).toHaveBeenCalled();
    }
  });

  it("fails on short JWT_SECRET", async () => {
    setEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/testdb",
      JWT_SECRET: "short",
      REFRESH_TOKEN_SECRET: "b".repeat(32),
      CLIENT_DOMAIN: "http://localhost:3000/op-market-shop",
    });

    await expect(loadEnvModule()).rejects.toThrow(
      "Invalid environment variables — see log for details",
    );
  });

  it("fails on short REFRESH_TOKEN_SECRET", async () => {
    setEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/testdb",
      JWT_SECRET: "a".repeat(32),
      REFRESH_TOKEN_SECRET: "short",
      CLIENT_DOMAIN: "http://localhost:3000/op-market-shop",
    });

    await expect(loadEnvModule()).rejects.toThrow(
      "Invalid environment variables — see log for details",
    );
  });

  it("fails in development when BREVO_API_KEY is missing", async () => {
    setEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/appdb",
      JWT_SECRET: "a".repeat(32),
      REFRESH_TOKEN_SECRET: "b".repeat(32),
      CLIENT_DOMAIN: "http://localhost:3000/op-market-shop",
      BREVO_API_KEY: "",
      FROM_EMAIL: "test@example.com",
      CLOUDINARY_CLOUD_NAME: "cloud",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
      PAYPAL_CLIENT_ID: "paypal-id",
      PAYPAL_CLIENT_SECRET: "paypal-secret",
    });

    await expect(loadEnvModule()).rejects.toThrow(
      "Invalid environment variables — see log for details",
    );
  });

  it("fails in production when Cloudinary values are missing", async () => {
    setEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/appdb",
      JWT_SECRET: "a".repeat(32),
      REFRESH_TOKEN_SECRET: "b".repeat(32),
      CLIENT_DOMAIN: "http://localhost:3000/op-market-shop",
      BREVO_API_KEY: "brevo-key",
      FROM_EMAIL: "test@example.com",
      CLOUDINARY_CLOUD_NAME: "",
      CLOUDINARY_API_KEY: "",
      CLOUDINARY_API_SECRET: "",
      PAYPAL_CLIENT_ID: "paypal-id",
      PAYPAL_CLIENT_SECRET: "paypal-secret",
    });

    await expect(loadEnvModule()).rejects.toThrow(
      "Invalid environment variables — see log for details",
    );
  });

  it("fails in development when PayPal values are missing", async () => {
    setEnv({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://user:pass@localhost:5432/appdb",
      JWT_SECRET: "a".repeat(32),
      REFRESH_TOKEN_SECRET: "b".repeat(32),
      CLIENT_DOMAIN: "http://localhost:3000/op-market-shop",
      BREVO_API_KEY: "brevo-key",
      FROM_EMAIL: "test@example.com",
      CLOUDINARY_CLOUD_NAME: "cloud",
      CLOUDINARY_API_KEY: "key",
      CLOUDINARY_API_SECRET: "secret",
      PAYPAL_CLIENT_ID: "",
      PAYPAL_CLIENT_SECRET: "",
    });

    await expect(loadEnvModule()).rejects.toThrow(
      "Invalid environment variables — see log for details",
    );
  });

  it("logs pretty and tree errors before throwing on invalid env", async () => {
    setEnv({
      NODE_ENV: "test",
      DATABASE_URL: "",
      JWT_SECRET: "short",
      REFRESH_TOKEN_SECRET: "tiny",
      CLIENT_DOMAIN: "not-a-url",
    });

    try {
      await loadEnvModule();
      throw new Error("expected module import to fail");
    } catch (error) {
      expect((error as Error).message).toBe(
        "Invalid environment variables — see log for details",
      );
    }

    vi.resetModules();

    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    };

    vi.doMock(loggerPath, () => ({
      default: logger,
    }));

    await import(envPath).catch(() => undefined);

    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenNthCalledWith(
      1,
      "❌ Invalid environment variables:\n",
      expect.any(String),
    );
    expect(logger.error).toHaveBeenNthCalledWith(
      2,
      "❯ Error details (tree):\n",
      expect.any(String),
    );
  });
});
