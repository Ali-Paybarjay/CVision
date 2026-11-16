import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/shared/ui";
import ErrorPage from "./error";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/** Each link's address and words, in page order. */
const links = (html: string) => [...html.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map(([, href, text]) => ({ href, text }));

/** The first Button in a tree of elements, found without rendering it, as React would hand it its props. */
function findButton(node: ReactNode): ReactElement<{ onClick: () => void }> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === Button) return node as ReactElement<{ onClick: () => void }>;
  return Children.toArray(node.props.children).map(findButton).find(Boolean);
}

// What a bug's error may say: words for developers, which the page must never show.
const error = new Error("Cannot read properties of undefined (reading skills) at TailorWorkspace");

describe("the error page (#508)", () => {
  const html = renderToStaticMarkup(<ErrorPage error={error} retry={() => {}} />);

  it("says something went wrong on our side in one heading, and never the error's own words", () => {
    expect(html.match(/<h1[^>]*>([^<]*)<\/h1>/g)).toEqual([expect.stringContaining(">Something went wrong on our side</h1>")]);
    expect(html).toContain("Try again in a moment.");
    expect(html).not.toContain(error.message);
    expect(html).not.toContain("TailorWorkspace");
  });

  it("offers Try again as the one Coral button, and a link to the home page", () => {
    expect(html.match(/bg-cta/g)).toHaveLength(1);
    expect(html).toMatch(/<button type="button" class="[^"]*bg-cta[^"]*">Try again<\/button>/);
    expect(links(html)).toEqual([{ href: "/", text: "Go to the home page" }]);
  });

  it("asks Next to try once more when Try again is pressed", () => {
    const retry = vi.fn();
    const tryAgain = findButton(ErrorPage({ error, retry }));

    tryAgain?.props.onClick();

    expect(retry).toHaveBeenCalledTimes(1);
  });
});
