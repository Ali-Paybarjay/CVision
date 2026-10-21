import { cn } from "./cn";
import { CheckIcon, ErrorIcon, InfoIcon, WarningIcon } from "./icons";

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
