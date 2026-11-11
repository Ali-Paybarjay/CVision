"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { WaitNote } from "@/shared/ui";

const noChanges = () => () => {};

/**
 * The note while the Tailor page is built, read by a screen reader after a click as well (#419). A live region is read
 * only when its words change while it is already on the page, so after a navigation inside the app the empty region
 * comes first and the sentence about 100 ms later. The server's HTML, for a full page load, has the sentence in the
 * region from the start: React does not hydrate a fallback that is still waiting, so this component never runs there.
 */
export function TailorWaitNote({ children }: { children: string }) {
  // True in the server's HTML and while hydrating; false when the note is first drawn in the browser.
  const fromServer = useSyncExternalStore(noChanges, () => false, () => true);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (fromServer) return;
    const timer = setTimeout(() => setShown(true), 100);
    return () => clearTimeout(timer);
  }, [fromServer]);
  return <WaitNote>{fromServer || shown ? children : null}</WaitNote>;
}
