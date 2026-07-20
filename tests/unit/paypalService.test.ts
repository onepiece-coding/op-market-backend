import { afterEach, describe, expect, it, vi } from "vitest";
// global error
const secretsPath = "../../src/config/secrets.js";
const paypalServicePath = "../../src/services/paypalService.js";

type SecretsMock = {
  PAYPAL_CLIENT_ID: string;
  PAYPAL_CLIENT_SECRET: string;
  PAYPAL_ENV: "sandbox" | "live";
  PAYPAL_CURRENCY: string;
  ALLOWED_ORIGIN: string;
};

async function loadPayPalService(overrides: Partial<SecretsMock> = {}) {
  vi.resetModules();

  vi.doMock(secretsPath, () => ({
    PAYPAL_CLIENT_ID: "client-id",
    PAYPAL_CLIENT_SECRET: "client-secret",
    PAYPAL_ENV: "sandbox",
    PAYPAL_CURRENCY: "USD",
    ALLOWED_ORIGIN: "http://localhost:3000/op-market-shop",
    ...overrides,
  }));

  return import(paypalServicePath);
}

describe("paypalService", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("auth/token fetch builds the correct request and returns access token", async () => {
    const { createPayPalOrder } = await loadPayPalService();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "access-123" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "order-1",
          links: [
            { rel: "approve", href: "https://paypal.test/approve/order-1" },
          ],
        }),
      });

    globalThis.fetch = fetchMock as typeof fetch;

    await createPayPalOrder(25.5, 123);

    const [url, init] = fetchMock.mock.calls[0];
    const expectedAuth = Buffer.from("client-id:client-secret").toString(
      "base64",
    );

    expect(url).toBe("https://api-m.sandbox.paypal.com/v1/oauth2/token");
    expect(init).toEqual({
      method: "POST",
      headers: {
        Authorization: `Basic ${expectedAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
  });

  it("create order sends the correct payload and extracts PayPal order id and approval URL", async () => {
    const { createPayPalOrder } = await loadPayPalService({
      PAYPAL_CURRENCY: "USD",
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "access-123" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "paypal-order-123",
          links: [
            { rel: "self", href: "https://paypal.test/self" },
            {
              rel: "approve",
              href: "https://paypal.test/approve/paypal-order-123",
            },
          ],
        }),
      });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await createPayPalOrder(25.5, 123);

    const [url, init] = fetchMock.mock.calls[1];

    expect(url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(init).toEqual({
      method: "POST",
      headers: {
        Authorization: "Bearer access-123",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: "123",
            amount: {
              currency_code: "USD",
              value: "25.50",
            },
          },
        ],
        application_context: {
          return_url:
            "http://localhost:3000/op-market-shop/checkout/paypal/return?orderId=123",
          cancel_url:
            "http://localhost:3000/op-market-shop/checkout/paypal/cancel?orderId=123",
        },
      }),
    });

    expect(result).toEqual({
      paypalOrderId: "paypal-order-123",
      approvalUrl: "https://paypal.test/approve/paypal-order-123",
      raw: {
        id: "paypal-order-123",
        links: [
          { rel: "self", href: "https://paypal.test/self" },
          {
            rel: "approve",
            href: "https://paypal.test/approve/paypal-order-123",
          },
        ],
      },
    });
  });

  it("create order throws on non-OK auth response", async () => {
    const { createPayPalOrder } = await loadPayPalService();

    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    globalThis.fetch = fetchMock as typeof fetch;

    await expect(createPayPalOrder(10)).rejects.toThrow(
      "PayPal auth failed: 401 Unauthorized",
    );
  });

  it("create order throws on non-OK order creation response", async () => {
    const { createPayPalOrder } = await loadPayPalService();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "access-123" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Create failed",
      });

    globalThis.fetch = fetchMock as typeof fetch;

    await expect(createPayPalOrder(10)).rejects.toThrow(
      "PayPal create order failed: 500 Create failed",
    );
  });

  it("create order returns null approvalUrl when approval link is missing", async () => {
    const { createPayPalOrder } = await loadPayPalService();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "access-123" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "paypal-order-123",
          links: [{ rel: "self", href: "https://paypal.test/self" }],
        }),
      });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await createPayPalOrder(10, 123);

    expect(result).toEqual({
      paypalOrderId: "paypal-order-123",
      approvalUrl: null,
      raw: {
        id: "paypal-order-123",
        links: [{ rel: "self", href: "https://paypal.test/self" }],
      },
    });
  });

  it("capture order sends the correct endpoint request", async () => {
    const { capturePayPalOrder } = await loadPayPalService();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "access-123" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "COMPLETED", id: "capture-1" }),
      });

    globalThis.fetch = fetchMock as typeof fetch;

    await capturePayPalOrder("paypal-order-123");

    const [url, init] = fetchMock.mock.calls[1];

    expect(url).toBe(
      "https://api-m.sandbox.paypal.com/v2/checkout/orders/paypal-order-123/capture",
    );
    expect(init).toEqual({
      method: "POST",
      headers: {
        Authorization: "Bearer access-123",
        "Content-Type": "application/json",
      },
    });
  });

  it("capture order returns parsed JSON", async () => {
    const { capturePayPalOrder } = await loadPayPalService();

    const capturePayload = {
      status: "COMPLETED",
      id: "capture-1",
      purchase_units: [],
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "access-123" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => capturePayload,
      });

    globalThis.fetch = fetchMock as typeof fetch;

    const result = await capturePayPalOrder("paypal-order-123");

    expect(result).toEqual(capturePayload);
  });

  it("capture order throws on non-OK response", async () => {
    const { capturePayPalOrder } = await loadPayPalService();

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "access-123" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: async () => "Capture failed",
      });

    globalThis.fetch = fetchMock as typeof fetch;

    await expect(capturePayPalOrder("paypal-order-123")).rejects.toThrow(
      "PayPal capture failed: 422 Capture failed",
    );
  });

  it("throws if PayPal config is missing", async () => {
    const { createPayPalOrder } = await loadPayPalService({
      PAYPAL_CLIENT_ID: "",
      PAYPAL_CLIENT_SECRET: "",
    });

    await expect(createPayPalOrder(10)).rejects.toThrow(
      "PayPal is not configured. Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
    );
  });
});
