// Decides whether PayPal may be used at all. Pure, so it can be tested without
// any network or database access.
//
// Payments stay off unless the operator sets PAYPAL_ENABLED="true". The sandbox
// and live environments are both supported, and each needs its own credentials.
// Nothing turns live payments on by itself: PAYPAL_ENABLED must be set on purpose.

export const PAYPAL_API = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
} as const;

export type PaypalEnvironment = keyof typeof PAYPAL_API;

export type PaypalConfig =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      environment: PaypalEnvironment;
      apiBase: string;
      clientId: string;
      clientSecret: string;
    };

type Env = Record<string, string | undefined>;

export function resolvePaypalConfig(env: Env): PaypalConfig {
  if (env.PAYPAL_ENABLED !== "true")
    return { enabled: false, reason: "Payments are disabled." };
  const environment = env.PAYPAL_ENVIRONMENT;
  if (environment !== "sandbox" && environment !== "live")
    return {
      enabled: false,
      reason: "PAYPAL_ENVIRONMENT must be set to sandbox or live.",
    };
  const clientId = env.PAYPAL_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret)
    return {
      enabled: false,
      reason: "PayPal credentials are not configured for this environment.",
    };
  return {
    enabled: true,
    environment,
    apiBase: PAYPAL_API[environment],
    clientId,
    clientSecret,
  };
}
