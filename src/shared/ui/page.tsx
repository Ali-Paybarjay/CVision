import { cn } from "./cn";

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
    <main className={cn("mx-auto w-full px-4 py-8 sm:py-12", width === "narrow" ? "max-w-3xl" : "max-w-6xl")}>
      <h1 className="text-3xl leading-tight sm:text-4xl">{title}</h1>
      {description && <div className="mt-3 max-w-[65ch] text-lg text-text-muted">{description}</div>}
      {children && <div className="mt-8 flex flex-col gap-6">{children}</div>}
    </main>
  );
}
