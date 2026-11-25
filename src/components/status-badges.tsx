import { Badge } from '@/components/ui/badge'
import type { BidStatus, ListingStatus } from '@/lib/platform'
import { cn } from '@/lib/utils'

const bidStyles: Record<BidStatus, { label: string; className: string }> = {
  paid: {
    label: 'Paid',
    className: 'border-live/40 bg-live/10 text-foreground',
  },
  pending: {
    label: 'Awaiting payment',
    className: 'border-primary/40 bg-primary/10 text-foreground',
  },
  failed: { label: 'Not completed', className: 'text-muted-foreground' },
  refunded: { label: 'Refunded', className: 'text-muted-foreground' },
  disputed: {
    label: 'Disputed',
    className: 'border-primary/40 bg-primary/10 text-foreground',
  },
}

const listingStyles: Record<
  ListingStatus,
  { label: string; className: string }
> = {
  approved: {
    label: 'Live',
    className: 'border-live/40 bg-live/10 text-foreground',
  },
  pending: {
    label: 'In review',
    className: 'border-primary/40 bg-primary/10 text-foreground',
  },
  removed: {
    label: 'Removed',
    className: 'border-destructive/40 text-destructive',
  },
}

export function BidStatusBadge({ status }: { status: BidStatus }) {
  const style = bidStyles[status]
  return (
    <Badge
      variant="outline"
      className={cn('whitespace-nowrap', style.className)}
    >
      {style.label}
    </Badge>
  )
}

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  const style = listingStyles[status]
  return (
    <Badge
      variant="outline"
      className={cn('whitespace-nowrap', style.className)}
    >
      {style.label}
    </Badge>
  )
}
