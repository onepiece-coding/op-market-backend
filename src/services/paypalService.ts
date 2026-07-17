import {
  ALLOWED_ORIGIN,
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  PAYPAL_ENV,
  PAYPAL_CURRENCY,
} from "../config/secrets.js";

const baseUrl =
  PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const PAYPAL_RETURN_PATH = "/op-market-shop/checkout/paypal/return";
const PAYPAL_CANCEL_PATH = "/op-market-shop/checkout/paypal/cancel";

const assertPayPalConfig = () => {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error(
      "PayPal is not configured. Check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.",
    );
  }
};

const buildFrontendUrl = (path: string, orderId: number) => {
  const url = new URL(path, ALLOWED_ORIGIN);
  url.searchParams.set("orderId", String(orderId));
  return url.toString();
};

async function getAccessToken() {
  assertPayPalConfig();

  const auth = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal auth failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function createPayPalOrder(amount: number, orderId: number) {
  const token = await getAccessToken();

  const res = await fetch(`${baseUrl}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: String(orderId),
          amount: {
            currency_code: PAYPAL_CURRENCY,
            value: amount.toFixed(2),
          },
        },
      ],
      application_context: {
        return_url: buildFrontendUrl(PAYPAL_RETURN_PATH, orderId),
        cancel_url: buildFrontendUrl(PAYPAL_CANCEL_PATH, orderId),
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal create order failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    id: string;
    links?: Array<{ rel: string; href: string }>;
  };

  const approvalUrl =
    data.links?.find((l) => l.rel === "approve")?.href ?? null;

  return {
    paypalOrderId: data.id as string,
    approvalUrl,
    raw: data,
  };
}

export async function capturePayPalOrder(paypalOrderId: string) {
  const token = await getAccessToken();

  const res = await fetch(
    `${baseUrl}/v2/checkout/orders/${paypalOrderId}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal capture failed: ${res.status} ${text}`);
  }

  return res.json();
}
