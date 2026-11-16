import localFont from "next/font/local";

// Inter lives in the repo (SIL Open Font License in OFL.txt, beside this file), so no build downloads it from Google:
// a failed download used to break the e2e build in CI (#311). One variable file, Latin only, covers 400, 600 and 700.
// Defined once, as Next.js asks of a font used in more than one file: layout.tsx and global-error.tsx (#508).
export const inter = localFont({
  src: "./inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});
