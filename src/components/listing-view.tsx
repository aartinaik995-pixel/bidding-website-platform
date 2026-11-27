import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { RankBadge, SiteInitial } from "@/components/leaderboard";
import { hostnameOf } from "@/lib/platform";
import { cn } from "@/lib/utils";

type ListingHeaderProps = {
  title: string;
  url: string;
  description: string;
  rank?: number;
  ownerName?: string;
  submittedLabel?: string;
  className?: string;
};

/** The top of a website details page. Also used as the live preview on the Submit page. */
export function ListingHeader({
  title,
  url,
  description,
  rank,
  ownerName,
  submittedLabel,
  className,
}: ListingHeaderProps) {
  const safeUrl = /^https?:\/\//i.test(url) ? url : undefined;
  return (
    <div className={cn("rounded-2xl border bg-card p-6 sm:p-8", className)}>
      <div className="flex items-start gap-4">
        <SiteInitial title={title} className="size-14 text-2xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {rank ? (
              <span className="inline-flex items-center gap-2">
                <RankBadge rank={rank} className="size-7 text-xs" />
                <span className="text-sm font-semibold">Rank #{rank}</span>
              </span>
            ) : (
              <Badge variant="outline">Not ranked yet</Badge>
            )}
          </div>
          <h2 className="mt-2 text-2xl font-extrabold break-words sm:text-3xl">
            {title || "Your website title"}
          </h2>
          {safeUrl ? (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {hostnameOf(safeUrl)} <ExternalLink className="size-3.5" />
            </a>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {url || "yourwebsite.com"}
            </p>
          )}
        </div>
      </div>
      <p className="mt-6 whitespace-pre-line text-muted-foreground">
        {description ||
          "A short description of what your website offers will appear here."}
      </p>
      {(ownerName || submittedLabel) && (
        <p className="mt-6 border-t pt-4 text-xs text-muted-foreground">
          {ownerName && <>Submitted by {ownerName}</>}
          {ownerName && submittedLabel && " · "}
          {submittedLabel}
        </p>
      )}
    </div>
  );
}
