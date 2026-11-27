import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NotFoundPage } from "@/components/error-pages";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { IdentityProvider } from "@/components/identity-provider";

import "../styles.css";

const siteName = "BidMySite — Bid your website to the top";
const siteDescription =
  "Submit your website to a public leaderboard. Bidding is not open yet.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: siteName,
      },
      {
        name: "description",
        content: siteDescription,
      },
      {
        property: "og:title",
        content: siteName,
      },
      {
        property: "og:description",
        content: siteDescription,
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "theme-color",
        content: "#f8f6f1",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Instrument+Sans:wght@400..700&family=JetBrains+Mono:wght@500;700&display=swap",
      },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <IdentityProvider>
          <TooltipProvider>
            <div className="flex min-h-screen flex-col">
              <SiteHeader />
              <main className="flex-1">{children}</main>
              <SiteFooter />
            </div>
          </TooltipProvider>
        </IdentityProvider>
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}
