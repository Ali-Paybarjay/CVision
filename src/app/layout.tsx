import type { Metadata } from "next";
import { Suspense } from "react";
import { SignOutButton } from "@/features/account/sign-out-button";
import { brand } from "@/shared/brand";
import { InAppHistory } from "@/shared/in-app-history";
import { SiteFooter, SiteHeader, SkipLink } from "@/shared/ui";
import "./globals.css";
import { inter } from "./fonts/inter";

// Link previews in WhatsApp, Telegram and LinkedIn show opengraph-image.png, at its full address on the live site
// (#507). Next adds each page's own title and description as og: and twitter: tags, and summary_large_image.
export const metadata: Metadata = {
  metadataBase: new URL("https://cvision-eta.vercel.app"),
  title: { default: brand.name, template: `%s | ${brand.name}` },
  description: brand.tagline,
  openGraph: { type: "website", siteName: brand.name, locale: "en_GB" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* First, so Tab reaches it before the header's links (#507). */}
        <SkipLink />
        {/* It reads the page's address, which a prerendered page only knows at request time, so it waits in Suspense. */}
        <Suspense fallback={null}>
          <InAppHistory />
        </Suspense>
        <SiteHeader signOut={<SignOutButton appearance="link" />} />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
