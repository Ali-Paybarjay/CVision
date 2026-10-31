import Link from "next/link";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "quiet";
type Size = "default" | "compact";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const sizes: Record<Size, string> = {
  default: "px-5",
  // Less side padding where room is tight, such as the top menu on a phone. Same height, so still easy to tap.
  compact: "px-3.5",
};

const variants: Record<Variant, string> = {
  // Coral: the ONE main action on a screen. Never use it twice on a page.
  primary: "bg-cta text-on-cta hover:brightness-95",
  secondary: "border border-accent text-accent hover:bg-fit",
  quiet: "text-accent underline-offset-4 hover:underline",
};

type ButtonProps = React.ComponentProps<"button"> & { variant?: Variant; size?: Size };

export function Button({ variant = "secondary", size = "default", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(base, sizes[size], variants[variant], className)} {...props} />;
}

type ButtonLinkProps = React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function ButtonLink({ variant = "secondary", size = "default", className, ...props }: ButtonLinkProps) {
  return <Link className={cn(base, sizes[size], variants[variant], className)} {...props} />;
}
