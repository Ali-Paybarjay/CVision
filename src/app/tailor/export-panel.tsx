"use client";

import { useState, useTransition } from "react";
import { exportDocument } from "@/features/tailor/actions";
import type { ExportDocument, ExportFormat } from "@/features/tailor/export";
import type { TailoringChange } from "@/shared/contracts";
import { Button, Card, Notice } from "@/shared/ui";
import type { LetterState } from "./cover-letter-panel";

type ExportPanelProps = {
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

/** Download the tailored CV and the approved cover letter as PDF or Word: what the preview shows, without the highlight. */
export function ExportPanel({ jobId, changes, letter }: ExportPanelProps) {
  const [pending, startTransition] = useTransition();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const waiting = changes.filter((change) => change.status === "proposed").length;
  const approvedLetter = letter?.approved ? letter.text : null;

  const download = (kind: ExportDocument, format: ExportFormat) => {
    setWorking(`${kind}-${format}`);
    setError(null);
    startTransition(async () => {
      const result = await exportDocument({ jobId, document: kind, format, changes, letter: approvedLetter });
      if (result.ok) save(result.base64, result.mimeType, result.fileName);
      else setError(result.message);
      setWorking(null);
    });
  };

  const label = (kind: ExportDocument, format: ExportFormat, text: string) =>
    working === `${kind}-${format}` ? "Making your file…" : text;

  return (
    <Card as="section" aria-labelledby="download-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="download-heading" className="text-xl">
          Download
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          The file matches the preview, without the highlight: one column and plain headings, so employers’ systems read it correctly.
        </p>
      </div>

      {waiting > 0 && (
        <Notice tone="info">
          {waiting} {waiting === 1 ? "change is" : "changes are"} still waiting for your decision and will not be in the file.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Your CV</p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => download("cv", "pdf")} disabled={pending}>
            {label("cv", "pdf", "Download PDF")}
          </Button>
          <Button onClick={() => download("cv", "docx")} disabled={pending}>
            {label("cv", "docx", "Download Word")}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">Your cover letter</p>
        {approvedLetter ? (
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => download("cover-letter", "pdf")} disabled={pending}>
              {label("cover-letter", "pdf", "Download PDF")}
            </Button>
            <Button onClick={() => download("cover-letter", "docx")} disabled={pending}>
              {label("cover-letter", "docx", "Download Word")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-text-muted">Approve your cover letter above to download it.</p>
        )}
      </div>
    </Card>
  );
}
