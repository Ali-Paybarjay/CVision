"use client";

import { brand } from "@/shared/brand";
import ErrorPage from "./error";
import { inter } from "./fonts/inter";
import "./globals.css";

/**
 * An error in the root layout itself, which error.tsx can't catch (#508). It replaces the whole document, so it brings
 * its own html and body, with layout.tsx's classes, styles and font. Next reads no metadata here, so the title is
 * React's <title>, as one string: with two children React leaves it empty.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en-GB" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <title>{`Something went wrong | ${brand.name}`}</title>
        <ErrorPage error={error} retry={retry} />
      </body>
    </html>
  );
}
