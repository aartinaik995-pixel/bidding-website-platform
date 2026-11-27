ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "paypal_order_id" text;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN IF NOT EXISTS "paypal_capture_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bids_paypal_order_idx" ON "bids" ("paypal_order_id") WHERE "paypal_order_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bids_paypal_capture_idx" ON "bids" ("paypal_capture_id") WHERE "paypal_capture_id" IS NOT NULL;--> statement-breakpoint
-- Settles one verified PayPal capture atomically.
-- Returns 'paid' on the first settlement and 'already-paid' when the same capture
-- is delivered again, so retries cannot double-count a bid or its fee.
-- Raises an exception when the order is unknown, the amount does not match what
-- was charged (bid plus fee), or the bid is no longer pending.
CREATE OR REPLACE FUNCTION settle_verified_bid(
  p_order_id text,
  p_capture_id text,
  p_captured_cents integer,
  p_paid_at timestamptz
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  b bids%ROWTYPE;
BEGIN
  SELECT * INTO b FROM bids WHERE paypal_order_id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown PayPal order';
  END IF;

  IF b.status = 'paid' THEN
    IF b.paypal_capture_id = p_capture_id THEN
      RETURN 'already-paid';
    END IF;
    RAISE EXCEPTION 'order already settled by a different capture';
  END IF;

  IF b.status <> 'pending' THEN
    RAISE EXCEPTION 'bid is %, not pending', b.status;
  END IF;

  IF p_captured_cents <> b.total_charge_cents THEN
    RAISE EXCEPTION 'captured amount does not match the bid total';
  END IF;

  UPDATE bids
    SET status = 'paid', paid_at = p_paid_at, paypal_capture_id = p_capture_id
    WHERE id = b.id;

  INSERT INTO platform_ledger (bid_id, kind, gross_cents, fee_cents, created_at)
    VALUES (b.id, 'fee', b.amount_cents, b.fee_cents, p_paid_at);

  UPDATE listings
    SET total_cents = total_cents + b.amount_cents,
        highest_bid_cents = GREATEST(highest_bid_cents, b.amount_cents),
        bid_count = bid_count + 1,
        last_bid_at = p_paid_at
    WHERE id = b.listing_id;

  RETURN 'paid';
END;
$$;
--> statement-breakpoint
-- Reverses one paid bid after a confirmed PayPal refund. Totals are recomputed
-- from the bids that remain paid, so highest bid and last bid time stay correct.
-- Returns 'refunded', or 'already-refunded' if this bid was refunded before.
CREATE OR REPLACE FUNCTION refund_verified_bid(
  p_bid_id integer,
  p_refunded_at timestamptz
) RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  b bids%ROWTYPE;
BEGIN
  SELECT * INTO b FROM bids WHERE id = p_bid_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown bid';
  END IF;

  IF b.status = 'refunded' THEN
    RETURN 'already-refunded';
  END IF;

  IF b.status <> 'paid' THEN
    RAISE EXCEPTION 'only a paid bid can be refunded (bid is %)', b.status;
  END IF;

  UPDATE bids SET status = 'refunded', refunded_at = p_refunded_at WHERE id = b.id;

  INSERT INTO platform_ledger (bid_id, kind, gross_cents, fee_cents, created_at)
    VALUES (b.id, 'refund', -b.amount_cents, -b.fee_cents, p_refunded_at);

  UPDATE listings
    SET total_cents = total_cents - b.amount_cents,
        bid_count = bid_count - 1,
        highest_bid_cents = COALESCE((
          SELECT MAX(x.amount_cents) FROM bids x
          WHERE x.listing_id = b.listing_id AND x.status = 'paid'), 0),
        last_bid_at = (
          SELECT MAX(x.paid_at) FROM bids x
          WHERE x.listing_id = b.listing_id AND x.status = 'paid')
    WHERE id = b.listing_id;

  RETURN 'refunded';
END;
$$;
