import Link from "next/link";
import { useId } from "react";
import { cn, ErrorIcon } from "@/shared/ui";
import { privacyPage } from "../consent";

type ConsentBoxProps = {
  /** What the consent is for, for example "Before we read your CV". */
  legend: string;
  points: string[];
  /** The words the user agrees to, next to the box. */
  label: string;
  error?: string;
  /** The checkbox: a name and value inside a form, or checked and onChange when the page keeps the answer. */
  input: React.ComponentProps<"input">;
};

/** What we do with the user's details, and an unticked box to agree to it (UK GDPR: explicit, informed and specific). */
export function ConsentBox({ legend, points, label, error, input }: ConsentBoxProps) {
  const errorId = useId();
  return (
    <fieldset className={cn("rounded-md border p-4", error ? "border-error" : "border-line")}>
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text-muted">
        {points.map((point) => (
          <li key={point}>{linkPrivacyPage(point)}</li>
        ))}
      </ul>
      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          {...input}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="mt-0.5 size-5 shrink-0 accent-accent"
        />
        <span className="font-semibold">{label}</span>
      </label>
      {error && (
        <p id={errorId} className="mt-2 flex items-center gap-1.5 text-sm text-error">
          <ErrorIcon className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Shows the Privacy page's name in a consent point as a link to that page. */
function linkPrivacyPage(point: string): React.ReactNode {
  const at = point.indexOf(privacyPage.name);
  if (at === -1) return point;
  return (
    <>
      {point.slice(0, at)}
      <Link href={privacyPage.href} className="font-semibold text-accent hover:underline">
        {privacyPage.name}
      </Link>
      {point.slice(at + privacyPage.name.length)}
    </>
  );
}
