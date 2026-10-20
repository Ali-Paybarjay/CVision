import { cn } from "./cn";

type CvPaperProps = React.HTMLAttributes<HTMLElement> & { as?: "article" | "div" };

/**
 * The CV preview. Always Paper with Ink text, in light and dark mode,
 * because it shows the file people download. Everything inside uses the light palette.
 */
export function CvPaper({ as: Tag = "article", className, ...props }: CvPaperProps) {
  return (
    <Tag
      className={cn(
        "light-palette mx-auto w-full max-w-[210mm] rounded-sm border border-line bg-cv-paper px-6 py-8 text-cv-ink sm:px-12 sm:py-12",
        className,
      )}
      {...props}
    />
  );
}
