import { createFileRoute } from '@tanstack/react-router'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { bids } from '../../db/schema.js'
import { currentUser } from '@/lib/auth.server'

export const Route = createFileRoute('/api/admin/revenue-csv')({
  server: { handlers: { GET: async () => {
    const headers = { 'Cache-Control': 'private, no-store' }
    const user = await currentUser()
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers })
    if (!user.isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403, headers })
    const { db: database } = await import('../../db/index.js')
    const { platformLedger, listings: listingTable, bids: bidTable } = await import('../../db/schema.js')
    const rows = await database.select({ entry: platformLedger, bid: bidTable, listing: listingTable }).from(platformLedger).innerJoin(bidTable, eq(platformLedger.bidId, bidTable.id)).innerJoin(listingTable, eq(bidTable.listingId, listingTable.id)).orderBy(platformLedger.createdAt)
    const cell = (value: string | number) => { const text = String(value); const safe = /^[=+\-@\t\r]/.test(text) && typeof value === 'string' ? `'${text}` : text; return `"${safe.replace(/"/g, '""')}"` }
    const cents = (value: number) => (value / 100).toFixed(2)
    const lines = [['date_utc','type','bid_id','website','bidder','bid_usd','platform_fee_usd','charged_usd'], ...rows.map(({ entry, bid, listing }) => [entry.createdAt.toISOString(), entry.kind, bid.id, listing.title, bid.bidderName, cents(entry.grossCents), cents(entry.feeCents), cents(entry.grossCents + entry.feeCents)])].map((line) => line.map(cell).join(','))
    return new Response(lines.join('\n') + '\n', { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bidmysite-revenue-${new Date().toISOString().slice(0, 10)}.csv"` } })
  } } },
})
