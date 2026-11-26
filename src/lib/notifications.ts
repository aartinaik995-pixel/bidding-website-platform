// Email notification templates and the send gate. Pure: nothing is sent from
// this file. Delivery needs a provider chosen by the operator and its API key,
// set as EMAIL_PROVIDER_API_KEY in the hosting environment.

import { formatMoney, PLATFORM } from "./platform";

export type EmailMessage = { subject: string; text: string };

export function emailDeliveryConfigured(
  env: Record<string, string | undefined>,
): boolean {
  return Boolean(env.EMAIL_PROVIDER_API_KEY?.trim());
}

export function renderBidReceipt(input: {
  title: string;
  slug: string;
  amountCents: number;
  feeCents: number;
  totalChargeCents: number;
  ownerName: string;
}): EmailMessage {
  return {
    subject: `Your bid on ${input.title} is confirmed`,
    text: [
      `Hi ${input.ownerName || "there"},`,
      "",
      `Your bid on ${input.title} has been confirmed.`,
      `Bid: ${formatMoney(input.amountCents)}`,
      `Platform fee: ${formatMoney(input.feeCents)}`,
      `Total charged: ${formatMoney(input.totalChargeCents)} ${PLATFORM.currency}`,
      "",
      `View the listing: /site/${input.slug}`,
      "",
      "Questions? Reply to this email or contact rajpurohitlalit2810@gmail.com.",
    ].join("\n"),
  };
}

export function renderRefundNotice(input: {
  title: string;
  refundCents: number;
}): EmailMessage {
  return {
    subject: `Refund processed for ${input.title}`,
    text: [
      `A refund of ${formatMoney(input.refundCents)} for your bid on ${input.title} has been processed.`,
      "",
      "Refunded bids no longer count toward the website's ranking.",
      "Questions? Contact rajpurohitlalit2810@gmail.com.",
    ].join("\n"),
  };
}
