"use client";

import { useEffect } from "react";
import { clearBrowserData } from "./browser-data";

/** Clears CVision's data from this browser as soon as the page shows. Renders nothing. */
export function ClearBrowserData() {
  useEffect(() => {
    clearBrowserData();
  }, []);
  return null;
}
