import {
  APP_NAME,
  BREVO_API_KEY,
  EMAIL_TIMEOUT_MS,
  FROM_EMAIL,
  NODE_ENV,
} from "../config/secrets.js";
import logger from "../utils/logger.js";

type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  from?: string;
};

type EmailMockResponse = {
  ok: true;
  message: string;
  to: string;
  subject: string;
};

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function getConfig() {
  return {
    NODE_ENV: process.env.NODE_ENV ?? NODE_ENV,
    BREVO_API_KEY: process.env.BREVO_API_KEY ?? BREVO_API_KEY ?? undefined,
    DEFAULT_FROM: process.env.FROM_EMAIL ?? FROM_EMAIL ?? undefined,
    DEFAULT_TIMEOUT_MS: process.env.EMAIL_TIMEOUT_MS
      ? Number(process.env.EMAIL_TIMEOUT_MS)
      : EMAIL_TIMEOUT_MS,
    APP_NAME: process.env.APP_NAME ?? APP_NAME,
  };
}

async function timeoutFetch(
  input: RequestInfo,
  init: RequestInit = {},
  timeout: number,
  fetchFn: (
    input: RequestInfo,
    init?: RequestInit,
  ) => Promise<Response> = fetch,
): Promise<Response> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), timeout);

  try {
    return await fetchFn(input, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function sendEmail(
  { to, subject, html, from }: EmailPayload,
  fetchFn?: (input: RequestInfo, init?: RequestInit) => Promise<Response>,
): Promise<unknown> {
  const cfg = getConfig();

  if (cfg.NODE_ENV === "test" && !cfg.BREVO_API_KEY) {
    logger.info(
      "sendEmail: test env without BREVO_API_KEY — returning mock response",
    );

    const mockResponse: EmailMockResponse = {
      ok: true,
      message: "Email send mocked in test env",
      to,
      subject,
    };

    return mockResponse;
  }

  if (!cfg.BREVO_API_KEY) {
    throw new Error(
      "Email provider not configured. Set BREVO_API_KEY (or run tests with NODE_ENV=test).",
    );
  }

  const senderEmail = from ?? cfg.DEFAULT_FROM;
  if (!senderEmail) {
    throw new Error("FROM_EMAIL is required for sending emails.");
  }

  const payload = {
    sender: {
      email: senderEmail,
      name: cfg.APP_NAME,
    },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };

  let res: Response;
  try {
    res = await timeoutFetch(
      BREVO_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": cfg.BREVO_API_KEY,
        },
        body: JSON.stringify(payload),
      },
      cfg.DEFAULT_TIMEOUT_MS,
      fetchFn,
    );
  } catch (networkErr: unknown) {
    const err =
      networkErr instanceof Error
        ? networkErr
        : new Error("Unknown network error");
    const message =
      err.name === "AbortError" ? "Request timed out" : err.message;

    logger.error("Brevo network error", {
      message,
      stack: err.stack,
    });

    const error = new Error("Internal Server Error (email network)");
    error.cause = err;
    throw error;
  }

  const contentType = res.headers.get("content-type") ?? "";
  let responseBody: unknown;

  if (contentType.includes("application/json")) {
    try {
      responseBody = await res.json();
    } catch (parseErr: unknown) {
      responseBody = null;
      logger.warn("Brevo JSON parse failed", {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
    }
  } else {
    try {
      responseBody = await res.text();
    } catch (readErr: unknown) {
      responseBody = null;
      logger.warn("Brevo text read failed", {
        error: readErr instanceof Error ? readErr.message : String(readErr),
      });
    }
  }

  if (!res.ok) {
    logger.error("Brevo API error", {
      status: res.status,
      statusText: res.statusText,
      body: responseBody,
    });
    const error = new Error("Internal Server Error (email send)");
    error.cause = new Error(`Brevo API error: ${res.status} ${res.statusText}`);
    throw error;
  }

  logger.info("Brevo send success", { status: res.status, body: responseBody });
  return responseBody;
}

export default sendEmail;
