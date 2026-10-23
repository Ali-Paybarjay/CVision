"use client";

import { useSyncExternalStore } from "react";
import { brand } from "@/shared/brand";
import { Button } from "@/shared/ui";
import { browserDataFile, readBrowserData } from "./browser-data";

// Another tab saving or clearing CVision's data fires "storage" here, so the note stays true.
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const countInBrowser = () => readBrowserData().length;
const noneOnServer = () => 0;

/**
 * Part of Download my data (issue #43): CVision data saved only in this browser, such as a profile that is not in
 * the account, is not in the account's ZIP. When there is some, say so and offer it as its own file, so "download
 * your data first" keeps everything. Renders nothing on the server or when this browser holds none.
 */
export function BrowserDataDownload() {
  const count = useSyncExternalStore(subscribe, countInBrowser, noneOnServer);
  if (count === 0) return null;

  return (
    <div className="mt-5 border-t border-line pt-5">
      <p className="max-w-[65ch] text-text-muted">
        This browser also holds {brand.name} data that is not saved in your account, such as a profile or interview
        practice. It is not in the ZIP file, and signing out or deleting your account clears it from this browser.
      </p>
      <Button className="mt-3" onClick={download}>
        Download this browser’s data
      </Button>
    </div>
  );
}

function download() {
  const { fileName, json } = browserDataFile(readBrowserData(), new Date());
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
