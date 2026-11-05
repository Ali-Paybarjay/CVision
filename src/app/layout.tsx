import type { Metadata } from "next";
import localFont from "next/font/local";
import { brand } from "@/shared/brand";
import { SiteFooter, SiteHeader } from "@/shared/ui";
import "./globals.css";

// Inter lives in the repo (fonts/, SIL Open Font License in fonts/OFL.txt), so no build downloads it from Google:
// a failed download used to break the e2e build in CI (#311). One variable file, Latin only, covers 400, 600 and 700.
const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s | ${brand.name}` },
  description: brand.tagline,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
