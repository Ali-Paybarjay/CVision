import type { Metadata } from "next";
import { Suspense } from "react";
import { SignOutButton } from "@/features/account/sign-out-button";
import { brand } from "@/shared/brand";
import { InAppHistory } from "@/shared/in-app-history";
import { SiteFooter, SiteHeader } from "@/shared/ui";
import "./globals.css";
import { inter } from "./fonts/inter";

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s | ${brand.name}` },
  description: brand.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
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
