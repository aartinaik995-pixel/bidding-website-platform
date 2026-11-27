import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn(
        "inline-flex items-center gap-2 font-display text-lg font-extrabold tracking-tight",
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-[0_3px_0_0_var(--ink)]"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none">
          <path
            d="M5 19V9M12 19V5M19 19v-7"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span>
        BidMy<span className="text-primary">Site</span>
      </span>
    </Link>
  );
}
