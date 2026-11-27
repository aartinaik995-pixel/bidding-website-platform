-- Self-checking test for settle_verified_bid and refund_verified_bid.
-- Run against a database where all migrations are applied:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/db/settlement.test.sql
-- Everything runs in one transaction and is rolled back, so no data is kept.
BEGIN;
DO $$
DECLARE
  r text;
  t listings%ROWTYPE;
  n integer;
BEGIN
  INSERT INTO users (id, email, name) VALUES ('t-owner','o@example.com','Owner'), ('t-bidder','b@example.com','Bidder');
  INSERT INTO listings (slug,url,title,description,owner_id,owner_name,contact_email,status)
    VALUES ('t-site','https://t.example','Test site','A test listing here','t-owner','Owner','o@example.com','approved')
    RETURNING * INTO t;
  INSERT INTO bids (listing_id,bidder_id,bidder_name,amount_cents,fee_cents,total_charge_cents,status,paypal_order_id)
    VALUES (t.id,'t-bidder','Bidder',1000,100,1100,'pending','T-ORDER-1'),
           (t.id,'t-bidder','Bidder',500,50,550,'pending','T-ORDER-2');

  r := settle_verified_bid('T-ORDER-1','T-CAP-1',1100,'2026-11-27T04:00:00Z');
  IF r <> 'paid' THEN RAISE EXCEPTION 'first settle returned %', r; END IF;

  r := settle_verified_bid('T-ORDER-1','T-CAP-1',1100,'2026-11-27T04:00:09Z');
  IF r <> 'already-paid' THEN RAISE EXCEPTION 'replay returned %', r; END IF;

  BEGIN
    PERFORM settle_verified_bid('T-ORDER-2','T-CAP-2',999,now());
    RAISE EXCEPTION 'wrong amount was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%does not match%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM settle_verified_bid('T-NOPE','T-CAP-9',1,now());
    RAISE EXCEPTION 'unknown order was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%unknown PayPal order%' THEN RAISE; END IF;
  END;

  PERFORM settle_verified_bid('T-ORDER-2','T-CAP-2',550,'2026-11-27T05:00:00Z');
  SELECT * INTO t FROM listings WHERE id = t.id;
  IF t.total_cents <> 1500 OR t.highest_bid_cents <> 1000 OR t.bid_count <> 2 THEN
    RAISE EXCEPTION 'totals wrong: total=% hi=% n=%', t.total_cents, t.highest_bid_cents, t.bid_count;
  END IF;

  SELECT count(*) INTO n FROM platform_ledger pl JOIN bids b ON b.id = pl.bid_id WHERE b.listing_id = t.id AND pl.kind = 'fee';
  IF n <> 2 THEN RAISE EXCEPTION 'expected 2 fee rows, found %', n; END IF;

  r := refund_verified_bid((SELECT id FROM bids WHERE paypal_order_id = 'T-ORDER-1'), now());
  IF r <> 'refunded' THEN RAISE EXCEPTION 'refund returned %', r; END IF;
  r := refund_verified_bid((SELECT id FROM bids WHERE paypal_order_id = 'T-ORDER-1'), now());
  IF r <> 'already-refunded' THEN RAISE EXCEPTION 'refund replay returned %', r; END IF;

  SELECT * INTO t FROM listings WHERE id = t.id;
  IF t.total_cents <> 500 OR t.highest_bid_cents <> 500 OR t.bid_count <> 1 THEN
    RAISE EXCEPTION 'after refund totals wrong: total=% hi=% n=%', t.total_cents, t.highest_bid_cents, t.bid_count;
  END IF;

  RAISE NOTICE 'settlement tests passed';
END $$;
ROLLBACK;
