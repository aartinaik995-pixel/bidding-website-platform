// Server functions for bidding. Every handler requires a signed-in user and
// refuses while payments are disabled.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireUser } from "./auth.server";
import { startBid } from "./bidding.server";
import { getPaymentStatus } from "./paypal.server";

export const getPaymentsStatus = createServerFn({ method: "GET" }).handler(() =>
  getPaymentStatus(),
);

export const placeBid = createServerFn({ method: "POST" })
  .validator(
    z.object({
      listingId: z.coerce.number().int().positive(),
      amountCents: z.coerce.number().int().positive(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUser();
    return startBid(user, data);
  });
