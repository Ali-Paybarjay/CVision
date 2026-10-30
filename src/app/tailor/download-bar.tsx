"use client";

import { useState, useTransition } from "react";
import { exportDocument } from "@/features/tailor/actions";
import type { ExportDocument, ExportFormat } from "@/features/tailor/export";
import type { TailoringChange } from "@/shared/contracts";
import { Button, Notice } from "@/shared/ui";
import type { LetterState } from "./cover-letter-panel";
import { unreachableMessage } from "./messages";

type DownloadBarProps = {
  jobId: string;
  changes: TailoringChange[];
  letter: LetterState | null;
};

function save(base64: string, mimeType: string, fileName: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  const link = Object.assign(document.createElement("a"), { href: url, download: fileName });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Stays at the top of the Tailor page, so the downloads are always in sight: the tailored CV and the approved cover
 * letter as PDF or Word, which match the preview without the highlight.
 */
export function DownloadBar({ jobId, changes, letter }: DownloadBarProps) {
  const [pending, startTransition] = useTransition();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const waiting = changes.filter((change) => change.status === "proposed").length;
  const approvedLetter = letter?.approved ? letter.text : null;

  const download = (kind: ExportDocument, format: ExportFormat) => {
    setWorking(`${kind}-${format}`);
    setError(null);
    setWarning(null);
    startTransition(async () => {
      try {
        const result = await exportDocument({ jobId, document: kind, format, changes, letter: approvedLetter });
        if (result.ok) {
          save(result.base64, result.mimeType, result.fileName);
          setWarning(result.warning);
        } else {
          setError(result.message);
        }
      } catch {
        setError(unreachableMessage);
      }
      setWorking(null);
    });
  };

  const label = (kind: ExportDocument, format: ExportFormat, text: string) =>
    working === `${kind}-${format}` ? "Making your file…" : text;

  return (
    <section aria-label="Download" className="sticky top-0 z-10 flex flex-col gap-2 rounded-md border border-line bg-surface p-3">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <Button onClick={() => download("cv", "pdf")} disabled={pending} className="px-2 sm:px-5">
          {label("cv", "pdf", "Download CV (PDF)")}
        </Button>
        <Button onClick={() => download("cv", "docx")} disabled={pending} className="px-2 sm:px-5">
          {label("cv", "docx", "Download CV (Word)")}
        </Button>
        {approvedLetter ? (
          <>
            <Button onClick={() => download("cover-letter", "pdf")} disabled={pending} className="px-2 sm:px-5">
              {label("cover-letter", "pdf", "Download letter (PDF)")}
            </Button>
            <Button onClick={() => download("cover-letter", "docx")} disabled={pending} className="px-2 sm:px-5">
              {label("cover-letter", "docx", "Download letter (Word)")}
            </Button>
          </>
        ) : (
          <a href="#letter-heading" className="col-span-2 text-center text-sm text-accent underline underline-offset-4 sm:text-left">
            Approve your cover letter to download it
          </a>
        )}
      </div>
      {waiting > 0 && (
        <p className="text-xs text-text-muted">
          {waiting} {waiting === 1 ? "change is" : "changes are"} still waiting for your decision and will not be in the file.
        </p>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {warning && <Notice tone="warning">{warning}</Notice>}
    </section>
  );
}
