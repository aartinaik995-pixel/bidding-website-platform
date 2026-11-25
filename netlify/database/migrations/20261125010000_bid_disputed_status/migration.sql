ALTER TABLE "bids" DROP CONSTRAINT "bids_status_check";
--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_status_check" CHECK ("status" in ('pending', 'paid', 'failed', 'refunded', 'disputed'));
