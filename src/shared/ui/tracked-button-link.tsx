"use client";

import { ButtonLink } from "./button";

type TrackedButtonLinkProps = React.ComponentProps<typeof ButtonLink> & {
  /** A Server Action that records the click, e.g. `trackHomeCtaClick.bind(null, { cta, placement })`. */
  onTrack: () => Promise<void>;
};

/** A ButtonLink that records a usage event when clicked. The navigation never waits for it. */
export function TrackedButtonLink({ onTrack, onClick, ...props }: TrackedButtonLinkProps) {
  return (
    <ButtonLink
      {...props}
      onClick={(event) => {
        onClick?.(event);
        onTrack().catch(() => {});
      }}
    />
  );
}
