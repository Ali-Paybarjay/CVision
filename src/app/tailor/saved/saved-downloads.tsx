"use client";

import { useState, useTransition } from "react";
import { exportSavedDocument } from "@/features/tailor/actions";
import type { ExportDocument, ExportFormat } from "@/features/tailor/export";
import { Button, Notice } from "@/shared/ui";
import { saveFile } from "../download-bar";
import { unreachableMessage } from "../messages";

/** The files of the saved copy, built from what was sent rather than today's Profile (#207). The letter buttons only when a letter was sent. */
export function SavedDownloads({ jobId, hasLetter }: { jobId: string; hasLetter: boolean }) {
  const [pending, startTransition] = useTransition();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const download = (document: ExportDocument, format: ExportFormat) => {
    setWorking(`${document}-${format}`);
    setError(null);
    setWarning(null);
    startTransition(async () => {
      try {
        const result = await exportSavedDocument({ jobId, document, format });
        if (result.ok) {
          saveFile(result.base64, result.mimeType, result.fileName);
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

  const button = (document: ExportDocument, format: ExportFormat, text: string) => (
    <Button onClick={() => download(document, format)} disabled={pending} className="px-2 sm:px-5">
      {working === `${document}-${format}` ? "Making your file…" : text}
    </Button>
  );

  return (
    <section aria-labelledby="saved-download-heading" className="flex flex-col gap-3">
      <h2 id="saved-download-heading" className="text-xl">
        Download
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        {button("cv", "pdf", "Download CV (PDF)")}
        {button("cv", "docx", "Download CV (Word)")}
        {hasLetter && (
          <>
            {button("cover-letter", "pdf", "Download letter (PDF)")}
            {button("cover-letter", "docx", "Download letter (Word)")}
          </>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {warning && <Notice tone="warning">{warning}</Notice>}
    </section>
  );
}
