import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Eye, LogIn } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ListingHeader } from "@/components/listing-view";
import { getSessionUser } from "@/lib/account.functions";
import { submitListing } from "@/lib/listings.functions";
import { feePercentLabel, formatMoney, PLATFORM } from "@/lib/platform";

export const Route = createFileRoute("/submit")({
  head: () => ({ meta: [{ title: "Submit your website · BidMySite" }] }),
  loader: async () => {
    const user = await getSessionUser();
    return { user };
  },
  component: SubmitPage,
});

type State = "idle" | "pending" | "success" | "error";

const DESCRIPTION_MAX = 280;

function SubmitPage() {
  const { user } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(submitListing);
  const [state, setState] = useState<State>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [preview, setPreview] = useState({
    url: "",
    title: "",
    description: "",
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "pending") return;
    const fields = new FormData(event.currentTarget);
    const value = (key: string) => String(fields.get(key) ?? "");
    setState("pending");
    setErrorMessage(null);
    try {
      const { slug } = await save({
        data: {
          url: value("url"),
          title: value("title"),
          description: value("description"),
          ownerName: value("name"),
        },
      });
      setSavedSlug(slug);
      setState("success");
      void router.invalidate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Validation errors from the server arrive as JSON issue lists; keep the copy friendly.
      setErrorMessage(message && !message.startsWith("[") ? message : null);
      setState("error");
    }
  }

  return (
    <div className="mx-auto max-w-content px-4 py-12 sm:px-6">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold tracking-widest text-primary uppercase">
          Submit a website
        </p>
        <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">
          Put your site on the board
        </h1>
        <p className="mt-3 text-muted-foreground">
          Tell us about your website. Your public listing is published as soon
          as you submit it; it joins the leaderboard after its first bid is
          verified.
        </p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_1fr]">
        {state === "success" ? (
          <div className="rounded-2xl border bg-card p-8">
            <CheckCircle2 className="size-10 text-live" />
            <h2 className="mt-4 text-2xl font-bold">
              Your website is published
            </h2>
            <p className="mt-2 text-muted-foreground">
              Your public listing is live. It appears in rankings only after a
              payment provider confirms its first bid. You can share its page
              now or follow bids from your dashboard.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {savedSlug ? (
                <Button asChild>
                  <Link to="/site/$slug" params={{ slug: savedSlug }}>
                    View your listing
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/dashboard">Go to your dashboard</Link>
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setPreview({ url: "", title: "", description: "" });
                  setState("idle");
                }}
              >
                Submit another website
              </Button>
            </div>
          </div>
        ) : !user ? (
          <div className="rounded-2xl border bg-card p-8">
            <LogIn className="size-10 text-primary" />
            <h2 className="mt-4 text-2xl font-bold">Sign in to submit</h2>
            <p className="mt-2 text-muted-foreground">
              Listings belong to an account so you can track their rank, bids
              and receipts. It's free and takes a minute.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link to="/login" search={{ redirect: "/submit" }}>
                  Sign in or create an account
                </Link>
              </Button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={submit}
            onChange={(e) => {
              if (state !== "pending") setState("idle");
              const form = e.currentTarget;
              setPreview({
                url: (form.elements.namedItem("url") as HTMLInputElement).value,
                title: (form.elements.namedItem("title") as HTMLInputElement)
                  .value,
                description: (
                  form.elements.namedItem("description") as HTMLTextAreaElement
                ).value,
              });
            }}
            className="rounded-2xl border bg-card p-6 sm:p-8"
          >
            <fieldset disabled={state === "pending"} className="space-y-6">
              <legend className="sr-only">Website details</legend>
              <div className="space-y-2">
                <Label htmlFor="url">Website URL</Label>
                <Input
                  id="url"
                  name="url"
                  type="url"
                  required
                  maxLength={300}
                  placeholder="https://yourwebsite.com"
                  pattern="https?://.+"
                  title="Start with http:// or https://"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  required
                  minLength={2}
                  maxLength={60}
                  placeholder="What should the leaderboard call your site?"
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label htmlFor="description">Description</Label>
                  <span className="tabular text-xs text-muted-foreground">
                    {preview.description.length}/{DESCRIPTION_MAX}
                  </span>
                </div>
                <Textarea
                  id="description"
                  name="description"
                  required
                  rows={4}
                  minLength={10}
                  maxLength={DESCRIPTION_MAX}
                  placeholder="One or two sentences about what visitors will find."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Submitted by</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="name"
                  defaultValue={user.name}
                />
                <p className="text-xs text-muted-foreground">
                  Shown publicly on the listing. We contact you at {user.email}.
                </p>
              </div>

              {state === "error" && (
                <Alert variant="destructive" role="alert">
                  <AlertTitle>Your listing wasn't saved</AlertTitle>
                  <AlertDescription>
                    {errorMessage ??
                      "Check the website address (it must be a public http:// or https:// URL), a title of at least 2 characters and a description of at least 10."}{" "}
                    Your details are still here.
                  </AlertDescription>
                </Alert>
              )}

              <Button type="submit" size="lg" className="w-full">
                {state === "pending" ? "Publishing…" : "Publish website"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Submitting is free. Bids start at{" "}
                {formatMoney(PLATFORM.minBidCents)} plus a {feePercentLabel()}{" "}
                platform fee.{" "}
                Bidding is not available yet, because no payment provider is connected.
              </p>
            </fieldset>
          </form>
        )}

        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Eye className="size-4" /> Live preview of your details page
          </p>
          <ListingHeader
            title={preview.title}
            url={preview.url}
            description={preview.description}
            submittedLabel="Preview — not yet published"
          />
          <ul className="mt-6 space-y-3 text-sm text-muted-foreground">
            <li>
              • Your listing gets a public page with its rank, bid total and bid
              history.
            </li>
            <li>
              • Anyone can bid on any listing; every verified bid raises its
              total.
            </li>
            <li>• Links open in a new tab and are marked as user-submitted.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
