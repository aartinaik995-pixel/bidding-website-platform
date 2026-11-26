// PayPal payment scaffolding. Server-only.
//
// Real-money payments stay OFF until all of these are true:
//   1. Legal review of terms, refund policy and privacy policy is complete.
//   2. PayPal has approved the account for the auction model.
//   3. Sandbox order create, capture and refund tests pass.
//   4. PAYPAL_ENABLED is set to exactly "true" in the hosting environment.
//
// Until then every entry point below fails closed: no network calls are made,
// and nothing is ranked or recorded as paid.

export const PAYPAL_NOT_ENABLED_MESSAGE =
  "Bidding is not open yet, because payments are not enabled.";

/** Fail-closed flag. Anything other than the exact string "true" means disabled. */
export function paypalEnabled(): boolean {
  return (
    typeof process !== "undefined" && process.env.PAYPAL_ENABLED === "true"
  );
}

export type PaymentStatus = {
  enabled: boolean;
  message: string;
};

export function getPaymentStatus(): PaymentStatus {
  const enabled = paypalEnabled();
  return {
    enabled,
    message: enabled
      ? "Payments are enabled."
      : PAYPAL_NOT_ENABLED_MESSAGE,
  };
}

/**
 * Creates a PayPal order for a bid. Not implemented yet: it refuses while
 * payments are disabled, and the enabled path still needs the sandbox work
 * listed above before it can be written and tested.
 */
export async function createBidOrder(_input: {
  listingId: number;
  bidderId: string;
  amountCents: number;
}): Promise<never> {
  if (!paypalEnabled()) throw new Error(PAYPAL_NOT_ENABLED_MESSAGE);
  throw new Error(
    "PayPal order creation is not implemented yet. Sandbox testing is required first.",
  );
}

/**
 * Captures a PayPal order and marks the bid paid. Ranking changes only after a
 * capture that PayPal confirms as COMPLETED. Same fail-closed rule as above.
 */
export async function captureBidOrder(_orderId: string): Promise<never> {
  if (!paypalEnabled()) throw new Error(PAYPAL_NOT_ENABLED_MESSAGE);
  throw new Error(
    "PayPal capture is not implemented yet. Sandbox testing is required first.",
  );
}
