// TEMPORARY: a copy of the shared UI kit from PR #25 (src/shared/ui), which is not on main yet.
// Same names and props, so once #25 is merged: delete this file and import from "@/shared/ui" instead.
import Link from "next/link";
import { useId } from "react";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "quiet";

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants: Record<Variant, string> = {
  // Coral: the ONE main action on a screen. Never use it twice on a page.
  primary: "bg-cta text-on-cta hover:brightness-95",
  secondary: "border border-accent text-accent hover:bg-fit",
  quiet: "text-accent underline-offset-4 hover:underline",
};

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export function Button({ variant = "secondary", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonBase, buttonVariants[variant], className)} {...props} />;
}

type ButtonLinkProps = React.ComponentProps<typeof Link> & { variant?: Variant };

export function ButtonLink({ variant = "secondary", className, ...props }: ButtonLinkProps) {
  return <Link className={cn(buttonBase, buttonVariants[variant], className)} {...props} />;
}

type CardProps = React.HTMLAttributes<HTMLElement> & { as?: "section" | "article" | "div" };

/** A surface panel with a Line edge. */
export function Card({ as: Tag = "section", className, ...props }: CardProps) {
  return <Tag className={cn("rounded-lg border border-line bg-surface p-5 sm:p-6", className)} {...props} />;
}

const control =
  "w-full rounded-md border border-text-muted bg-surface px-3 py-2.5 text-base text-text placeholder:text-text-muted aria-invalid:border-error";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: true }) => React.ReactNode;
};

/** A label, the control, an optional hint and an error with an icon. */
export function Field({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      )}
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-sm text-error">
          <ErrorIcon className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, "min-h-40", className)} {...props} />;
}

type Tone = "info" | "success" | "warning" | "error";

const tones: Record<Tone, { className: string; Icon: typeof InfoIcon; label: string }> = {
  info: { className: "border-line bg-surface text-text", Icon: InfoIcon, label: "Note" },
  // Success has no green: it is the accent colour on Fit.
  success: { className: "border-fit-bar bg-fit text-accent", Icon: CheckIcon, label: "Done" },
  warning: { className: "border-warning bg-warning-bg text-warning", Icon: WarningIcon, label: "Check this" },
  error: { className: "border-error bg-surface text-error", Icon: ErrorIcon, label: "Error" },
};

type NoticeProps = {
  tone: Tone;
  /** The first words, shown in bold. Defaults to a word for the tone, so status never relies on colour alone. */
  title?: string;
  children?: React.ReactNode;
  className?: string;
};

/** A status message: always an icon and words, never colour alone. */
export function Notice({ tone, title, children, className }: NoticeProps) {
  const { className: toneClass, Icon, label } = tones[tone];

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-md border px-4 py-3 text-sm", toneClass, className)}
    >
      <Icon className="mt-px size-5 shrink-0" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{title ?? label}</p>
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

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

// Small line icons for status messages. Always paired with words.
type IconProps = { className?: string };

function Svg({ className = "size-5", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Svg>
  );
}

export function WarningIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </Svg>
  );
}

export function ErrorIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-6 6M9 9l6 6" />
    </Svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </Svg>
  );
}
