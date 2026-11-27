// Sends transactional email through a configurable HTTP provider. Server-only.
// Nothing is sent unless EMAIL_API_URL, EMAIL_PROVIDER_API_KEY and EMAIL_FROM
// are all set. Pick the provider and fill these in the hosting environment.

import type { EmailMessage } from "./notifications";

export type EmailResult = "sent" | "skipped";

export async function sendEmail(
  to: string,
  message: EmailMessage,
): Promise<EmailResult> {
  const url = process.env.EMAIL_API_URL?.trim();
  const key = process.env.EMAIL_PROVIDER_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!url || !key || !from) return "skipped";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: message.subject,
      text: message.text,
    }),
  });
  if (!response.ok) throw new Error("The email provider rejected the message.");
  return "sent";
}
