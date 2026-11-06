import { cn } from "./cn";

/**
 * The width of the site's wide frame: the header, the footer, the home page and every wide page share it, so the
 * logo lines up with the content below it. From 1536px it grows to 1440px, so a big screen is not 40% margin (#175).
 */
export const wideFrame = "max-w-6xl 2xl:max-w-[90rem]";

type PageProps = {
  title: string;
  /** One or two plain sentences under the title. */
  description?: React.ReactNode;
  /** Keep text pages narrow; use "wide" for dashboards and side-by-side views. */
  width?: "narrow" | "wide";
  children?: React.ReactNode;
};

/** The standard page frame: a title, an optional description and the content. */
export function Page({ title, description, width = "narrow", children }: PageProps) {
  return (
    <main className={cn("mx-auto w-full px-4 py-8 sm:py-12", width === "narrow" ? "max-w-3xl" : wideFrame)}>
      <h1 className="text-3xl leading-tight sm:text-4xl">{title}</h1>
      {description && <div className="mt-3 max-w-[65ch] text-lg text-text-muted">{description}</div>}
      {children && <div className="mt-8 flex flex-col gap-6">{children}</div>}
    </main>
  );
}
