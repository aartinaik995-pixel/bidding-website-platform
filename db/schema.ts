import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const users = pgTable('users', {
  id: text().primaryKey(),
  email: text().notNull(),
  name: text().notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
})

export const listings = pgTable('listings', {
  id: serial().primaryKey(),
  slug: text().notNull(),
  url: text().notNull(),
  title: text().notNull(),
  description: text().notNull(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  ownerName: text('owner_name').notNull(),
  contactEmail: text('contact_email').notNull(),
  /** pending | approved | removed. New submissions are approved immediately. */
  status: text().notNull().default('approved'),
  totalCents: integer('total_cents').notNull().default(0),
  highestBidCents: integer('highest_bid_cents').notNull().default(0),
  bidCount: integer('bid_count').notNull().default(0),
  lastBidAt: timestamp('last_bid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('listings_slug_idx').on(t.slug),
  index('listings_status_total_idx').on(t.status, t.totalCents),
  index('listings_owner_idx').on(t.ownerId),
  check('listings_status_check', sql`${t.status} in ('pending', 'approved', 'removed')`),
])

export const bids = pgTable('bids', {
  id: serial().primaryKey(),
  listingId: integer('listing_id').notNull().references(() => listings.id),
  bidderId: text('bidder_id').notNull().references(() => users.id),
  bidderName: text('bidder_name').notNull(),
  amountCents: integer('amount_cents').notNull(),
  feeCents: integer('fee_cents').notNull(),
  totalChargeCents: integer('total_charge_cents').notNull(),
  currency: text().notNull().default('usd'),
  /** pending | paid | failed | refunded */
  status: text().notNull().default('pending'),
  paypalOrderId: text('paypal_order_id'),
  paypalCaptureId: text('paypal_capture_id'),
  // Retained for compatibility with any historical Stripe data.
  stripeSessionId: text('stripe_session_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  refundedAt: timestamp('refunded_at', { withTimezone: true }),
}, (t) => [
  uniqueIndex('bids_stripe_session_idx').on(t.stripeSessionId),
  uniqueIndex('bids_paypal_order_idx').on(t.paypalOrderId),
  index('bids_paypal_capture_idx').on(t.paypalCaptureId),
  index('bids_payment_intent_idx').on(t.stripePaymentIntentId),
  index('bids_listing_status_idx').on(t.listingId, t.status),
  index('bids_bidder_idx').on(t.bidderId),
  check('bids_status_check', sql`${t.status} in ('pending', 'paid', 'failed', 'refunded')`),
  check('bids_amount_check', sql`${t.amountCents} > 0 and ${t.feeCents} >= 0`),
])

export const platformLedger = pgTable('platform_ledger', {
  id: serial().primaryKey(),
  bidId: integer('bid_id').notNull().references(() => bids.id),
  kind: text().notNull(),
  grossCents: integer('gross_cents').notNull(),
  feeCents: integer('fee_cents').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('platform_ledger_bid_kind_idx').on(t.bidId, t.kind),
  check('platform_ledger_kind_check', sql`${t.kind} in ('fee', 'refund')`),
])

/** PayPal webhook IDs already handled, for safe provider retries. */
export const paypalEvents = pgTable('paypal_events', {
  id: text().primaryKey(),
  type: text().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Historical Stripe events retained to keep existing migrations and data intact. */
export const stripeEvents = pgTable('stripe_events', {
  id: text().primaryKey(),
  type: text().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
})
