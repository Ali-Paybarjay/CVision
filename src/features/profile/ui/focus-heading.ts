import { useEffect, useRef, type RefObject } from "react";

/**
 * Moves focus to a step's heading when the user moves to that step (`focusHeading`), once. While the user looks at
 * another page, such as the Privacy page, Next.js keeps this one as they left it and runs its effects again when they
 * come back: focus then stays where they were, instead of jumping to the top of the page.
 */
export function useFocusHeading(heading: RefObject<HTMLElement | null>, focusHeading: boolean) {
  const focused = useRef(false);
  useEffect(() => {
    if (!focusHeading || focused.current) return;
    focused.current = true;
    heading.current?.focus();
  }, [heading, focusHeading]);
}
