import type { Metadata } from "next";
import { SiteNav } from "@/shared/ui/site-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "CVision",
  description: "Every application, made to fit.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
