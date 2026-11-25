import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { ArrowLeft, EyeOff } from 'lucide-react'
import { useEffect } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BidPanel } from '@/components/bid-panel'
import { ListingHeader } from '@/components/listing-view'
import { getListingPage } from '@/lib/listings.functions'
import { formatMoney, timeAgo } from '@/lib/platform'
import { useLiveRefresh } from '@/lib/use-live-refresh'

export const Route = createFileRoute('/site/$slug')({
  validateSearch: (search: Record<string, unknown>): { checkout?: 'cancelled' } => search.checkout === 'cancelled' ? { checkout: 'cancelled' } : {},
  loader: async ({ params }) => {
    const page = await getListingPage({ data: { slug: params.slug } })
    if (!page) throw notFound()
    return page
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: `${loaderData.listing.title} · BidMySite` }, { name: 'description', content: loaderData.listing.description.slice(0, 160) }] : [] }),
  component: ListingPage,
})

function ListingPage() {
  const { listing, bids, leaderTotalCents, signedIn, isOwner, paymentsReady } = Route.useLoaderData()
  const { checkout } = Route.useSearch()
  const navigate = Route.useNavigate()
  useLiveRefresh()
  useEffect(() => {
    if (checkout !== 'cancelled') return
    toast('Checkout cancelled. You were not charged.')
    void navigate({ search: {}, replace: true })
  }, [checkout, navigate])

  return <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
    <Link to="/leaderboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to leaderboard</Link>
    <h1 className="sr-only">{listing.title}</h1>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        {listing.status === 'removed' && <Alert variant="destructive"><EyeOff /><AlertTitle>Removed from BidMySite</AlertTitle><AlertDescription>This listing is hidden from the public and can't receive bids.</AlertDescription></Alert>}
        <ListingHeader title={listing.title} url={listing.url} description={listing.description} rank={listing.rank} ownerName={listing.ownerName} submittedLabel={`Listed ${timeAgo(listing.createdAt)}`} />
        <dl className="grid grid-cols-3 gap-3">{[['Total bid', formatMoney(listing.totalCents)], ['Highest bid', formatMoney(listing.highestBidCents)], ['Bids', String(listing.bidCount)]].map(([label, value]) => <div key={label} className="rounded-xl border bg-card p-4"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="tabular mt-1 text-xl font-bold sm:text-2xl">{value}</dd></div>)}</dl>
        <section className="rounded-2xl border bg-card p-6"><h2 className="text-lg font-bold">Bid history</h2>{bids.length === 0 ? <p className="mt-4 rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No verified bids on this website yet.</p> : <div className="mt-4 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Bidder</TableHead><TableHead>When</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{bids.map((bid) => <TableRow key={bid.id}><TableCell className="font-medium">{bid.bidderName}</TableCell><TableCell className="text-muted-foreground">{timeAgo(bid.createdAt)}</TableCell><TableCell className="tabular text-right font-semibold">{formatMoney(bid.amountCents)}</TableCell></TableRow>)}</TableBody></Table></div>}</section>
      </div>
      <aside className="lg:sticky lg:top-24 lg:self-start"><BidPanel listingId={listing.id} currentTotalCents={listing.totalCents} leaderTotalCents={leaderTotalCents} isLeader={listing.rank === 1} open={listing.status === 'approved'} signedIn={signedIn} paymentsReady={paymentsReady} /></aside>
    </div>
  </div>
}
