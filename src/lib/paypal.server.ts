// PayPal REST client for the sandbox. Server-only.
//
// Every call goes through resolvePaypalConfig(), which refuses unless
// PAYPAL_ENABLED="true", PAYPAL_ENVIRONMENT="sandbox" and both sandbox
// credentials are set. Live PayPal is never reachable from this module.
// Nothing here is called from the UI, so no money can move while the flag is off.

import { resolvePaypalConfig } from "./payment-config";
import { feeBreakdown } from "./platform";

const SANDBOX_API = "https://api-m.sandbox.paypal.com";

export const PAYMENTS_DISABLED_MESSAGE =
  "Bidding is not open yet, because payments are not enabled.";

export type PaymentStatus = { enabled: boolean; message: string };

export function getPaymentStatus(): PaymentStatus {
  const config = resolvePaypalConfig(process.env);
  return config.enabled
    ? { enabled: true, message: "Payments are enabled in the PayPal sandbox." }
    : { enabled: false, message: PAYMENTS_DISABLED_MESSAGE };
}

function requireSandbox() {
  const config = resolvePaypalConfig(process.env);
  if (!config.enabled)
    throw new Error(`${PAYMENTS_DISABLED_MESSAGE} ${config.reason}`);
  return config;
}

async function accessToken(clientId: string, clientSecret: string) {
  const response = await fetch(`${SANDBOX_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("PayPal authentication failed.");
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== "string")
    throw new Error("PayPal authentication returned no token.");
  return body.access_token;
}

function formatUsd(cents: number) {
  return (cents / 100).toFixed(2);
}

export type CreatedOrder = {
  orderId: string;
  totalChargeCents: number;
  approveUrl: string;
};

/**
 * Creates a sandbox order for a bid. The bid amount plus the platform fee is
 * charged. The caller stores a pending bid with this order id before sending
 * the payer to approveUrl.
 */
export async function createBidOrder(input: {
  listingId: number;
  bidderId: string;
  amountCents: number;
  returnUrl: string;
  cancelUrl: string;
}): Promise<CreatedOrder> {
  const config = requireSandbox();
  const { totalChargeCents } = feeBreakdown(input.amountCents);
  const token = await accessToken(config.clientId, config.clientSecret);
  const response = await fetch(`${SANDBOX_API}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": crypto.randomUUID(),
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: `listing-${input.listingId}`,
          custom_id: `${input.listingId}:${input.bidderId}`,
          description: "Website bid",
          amount: { currency_code: "USD", value: formatUsd(totalChargeCents) },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
            user_action: "PAY_NOW",
            shipping_preference: "NO_SHIPPING",
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error("PayPal could not create the order.");
  const body = (await response.json()) as {
    id?: unknown;
    links?: { rel?: unknown; href?: unknown }[];
  };
  if (typeof body.id !== "string")
    throw new Error("PayPal returned no order id.");
  const approve = body.links?.find(
    (link) => link.rel === "payer-action" || link.rel === "approve",
  );
  if (typeof approve?.href !== "string")
    throw new Error("PayPal returned no approval link.");
  return { orderId: body.id, totalChargeCents, approveUrl: approve.href };
}

export type CapturedOrder = {
  captureId: string;
  amountCents: number;
  customId: string | null;
};

/**
 * Captures a sandbox order. Only a COMPLETED capture counts; the caller must
 * then check amountCents and customId against the pending bid before ranking.
 */
export async function captureBidOrder(orderId: string): Promise<CapturedOrder> {
  const config = requireSandbox();
  const token = await accessToken(config.clientId, config.clientSecret);
  const response = await fetch(
    `${SANDBOX_API}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": crypto.randomUUID(),
      },
    },
  );
  if (!response.ok) throw new Error("PayPal could not capture the order.");
  const body = (await response.json()) as {
    status?: unknown;
    purchase_units?: {
      custom_id?: unknown;
      payments?: {
        captures?: {
          id?: unknown;
          status?: unknown;
          amount?: { value?: unknown };
        }[];
      };
    }[];
  };
  const unit = body.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  if (body.status !== "COMPLETED" || capture?.status !== "COMPLETED")
    throw new Error("The PayPal payment is not completed.");
  if (
    typeof capture.id !== "string" ||
    typeof capture.amount?.value !== "string"
  )
    throw new Error("PayPal returned an incomplete capture.");
  const amountCents = Math.round(Number(capture.amount.value) * 100);
  return {
    captureId: capture.id,
    amountCents,
    customId: typeof unit?.custom_id === "string" ? unit.custom_id : null,
  };
}

/**
 * Asks PayPal whether a webhook really came from PayPal. Only a SUCCESS result
 * counts. The raw body must be passed through unchanged.
 */
export async function verifyWebhookSignature(
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  const config = requireSandbox();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  if (!webhookId) throw new Error("PAYPAL_WEBHOOK_ID is not configured.");
  const token = await accessToken(config.clientId, config.clientSecret);
  const response = await fetch(
    `${SANDBOX_API}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody) as unknown,
      }),
    },
  );
  if (!response.ok) return false;
  const body = (await response.json()) as { verification_status?: unknown };
  return body.verification_status === "SUCCESS";
}

/** Refunds a sandbox capture in full. Returns PayPal's refund id once COMPLETED. */
export async function refundCapture(
  captureId: string,
  amountCents: number,
): Promise<string> {
  const config = requireSandbox();
  const token = await accessToken(config.clientId, config.clientSecret);
  const response = await fetch(
    `${SANDBOX_API}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        amount: { value: formatUsd(amountCents), currency_code: "USD" },
      }),
    },
  );
  if (!response.ok) throw new Error("PayPal could not refund the capture.");
  const body = (await response.json()) as { id?: unknown; status?: unknown };
  if (body.status !== "COMPLETED" || typeof body.id !== "string")
    throw new Error("The PayPal refund is not completed.");
  return body.id;
}
