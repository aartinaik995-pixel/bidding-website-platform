// Decides whether PayPal may be used at all. Pure, so it can be tested without
// any network or database access.
//
// Live money is refused in every case until legal review and PayPal approval
// are complete. Only the sandbox environment can be enabled, and only when the
// operator sets PAYPAL_ENABLED="true" and both sandbox credentials are present.

export type PaypalConfig =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      environment: 'sandbox';
      clientId: string;
      clientSecret: string;
    };

type Env = Record<string, string | undefined>;

export function resolvePaypalConfig(env: Env): PaypalConfig {
  if (env.PAYPAL_ENABLED !== 'true')
    return { enabled: false, reason: 'Payments are disabled.' }
  if (env.PAYPAL_ENVIRONMENT !== 'sandbox')
    return {
      enabled: false,
      reason:
        'Only the PayPal sandbox can be enabled until legal review and PayPal approval are complete.',
    }
  const clientId = env.PAYPAL_CLIENT_ID?.trim() ?? ''
  const clientSecret = env.PAYPAL_CLIENT_SECRET?.trim() ?? ''
  if (!clientId || !clientSecret)
    return {
      enabled: false,
      reason: 'PayPal sandbox credentials are not configured.',
    }
  return { enabled: true, environment: 'sandbox', clientId, clientSecret }
}
