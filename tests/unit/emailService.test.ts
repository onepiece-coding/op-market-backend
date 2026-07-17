import { afterEach, describe, expect, it, vi } from "vitest";

const secretsPath = "../../src/config/secrets.js";
const loggerPath = "../../src/utils/logger.js";
const emailServicePath = "../../src/services/emailService.js";

type SecretsMock = {
  APP_NAME: string;
  BREVO_API_KEY: string;
  EMAIL_TIMEOUT_MS: number;
  FROM_EMAIL: string;
  NODE_ENV: "development" | "test" | "production";
};

async function loadEmailService(overrides: Partial<SecretsMock> = {}) {
  vi.resetModules();

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  vi.doMock(secretsPath, () => ({
    APP_NAME: "op-market-test",
    BREVO_API_KEY: "",
    EMAIL_TIMEOUT_MS: 50,
    FROM_EMAIL: "",
    NODE_ENV: "test",
    ...overrides,
  }));

  vi.doMock(loggerPath, () => ({
    default: logger,
    logger,
  }));

  const mod = await import(emailServicePath);

  return {
    sendEmail: mod.sendEmail,
    logger,
  };
}

describe("emailService", () => {
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    BREVO_API_KEY: process.env.BREVO_API_KEY,
    FROM_EMAIL: process.env.FROM_EMAIL,
    EMAIL_TIMEOUT_MS: process.env.EMAIL_TIMEOUT_MS,
    APP_NAME: process.env.APP_NAME,
  };

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    process.env.NODE_ENV = originalEnv.NODE_ENV;
    process.env.BREVO_API_KEY = originalEnv.BREVO_API_KEY;
    process.env.FROM_EMAIL = originalEnv.FROM_EMAIL;
    process.env.EMAIL_TIMEOUT_MS = originalEnv.EMAIL_TIMEOUT_MS;
    process.env.APP_NAME = originalEnv.APP_NAME;
  });

  it("returns the mock response in NODE_ENV=test with no Brevo key", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.BREVO_API_KEY;
    delete process.env.FROM_EMAIL;

    const { sendEmail } = await loadEmailService({
      NODE_ENV: "test",
      BREVO_API_KEY: "",
      FROM_EMAIL: "",
      EMAIL_TIMEOUT_MS: 50,
    });

    const result = await sendEmail({
      to: "user@example.com",
      subject: "Welcome",
      html: "<p>Hello</p>",
    });

    expect(result).toEqual({
      ok: true,
      message: "Email send mocked in test env",
      to: "user@example.com",
      subject: "Welcome",
    });
  });

  it("throws in non-test mode with no API key", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.BREVO_API_KEY;
    process.env.FROM_EMAIL = "sender@example.com";

    const { sendEmail } = await loadEmailService({
      NODE_ENV: "development",
      BREVO_API_KEY: "",
      FROM_EMAIL: "sender@example.com",
    });

    await expect(
      sendEmail({
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hello</p>",
      }),
    ).rejects.toThrow(
      "Email provider not configured. Set BREVO_API_KEY (or run tests with NODE_ENV=test).",
    );
  });

  it("throws when FROM_EMAIL is missing", async () => {
    process.env.NODE_ENV = "development";
    process.env.BREVO_API_KEY = "dummy-key";
    delete process.env.FROM_EMAIL;

    const { sendEmail } = await loadEmailService({
      NODE_ENV: "development",
      BREVO_API_KEY: "dummy-key",
      FROM_EMAIL: "",
    });

    await expect(
      sendEmail({
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hello</p>",
      }),
    ).rejects.toThrow("FROM_EMAIL is required for sending emails.");
  });

  it("aborts after the configured timeout", async () => {
    vi.useFakeTimers();

    process.env.NODE_ENV = "development";
    process.env.BREVO_API_KEY = "dummy-key";
    process.env.FROM_EMAIL = "sender@example.com";
    process.env.EMAIL_TIMEOUT_MS = "25";
    process.env.APP_NAME = "op-market-test";

    const { sendEmail } = await loadEmailService({
      NODE_ENV: "development",
      BREVO_API_KEY: "dummy-key",
      FROM_EMAIL: "sender@example.com",
      EMAIL_TIMEOUT_MS: 25,
      APP_NAME: "op-market-test",
    });

    const abortSpy = vi.fn();

    const fetchFn = vi.fn(
      (_input: RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            abortSpy();
            const err = new Error("Request aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );

    const promise = sendEmail(
      {
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hello</p>",
      },
      fetchFn,
    );

    const assertion = expect(promise).rejects.toThrow(
      "Internal Server Error (email network)",
    );

    await vi.advanceTimersByTimeAsync(30);
    await assertion;

    expect(abortSpy).toHaveBeenCalledTimes(1);
  });

  it("uses the correct payload shape on success", async () => {
    process.env.NODE_ENV = "development";
    process.env.BREVO_API_KEY = "dummy-key";
    process.env.FROM_EMAIL = "sender@example.com";
    process.env.EMAIL_TIMEOUT_MS = "1000";
    process.env.APP_NAME = "op-market";

    const { sendEmail } = await loadEmailService({
      NODE_ENV: "development",
      BREVO_API_KEY: "dummy-key",
      FROM_EMAIL: "sender@example.com",
      EMAIL_TIMEOUT_MS: 1000,
      APP_NAME: "op-market",
    });

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: {
        get: (key: string) =>
          key.toLowerCase() === "content-type" ? "application/json" : null,
      },
      json: async () => ({ id: "brevo-123" }),
    } as Response);

    const result = await sendEmail(
      {
        to: "user@example.com",
        subject: "Welcome",
        html: "<p>Hello</p>",
      },
      fetchFn,
    );

    expect(result).toEqual({ id: "brevo-123" });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json",
      "api-key": "dummy-key",
    });

    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      sender: {
        email: "sender@example.com",
        name: "op-market",
      },
      to: [{ email: "user@example.com" }],
      subject: "Welcome",
      htmlContent: "<p>Hello</p>",
    });

    expect(init?.signal).toBeDefined();
  });
});
