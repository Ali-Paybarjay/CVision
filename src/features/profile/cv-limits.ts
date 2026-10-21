// What a CV upload may be. Shared by the upload form (to warn early) and the server (which decides).

/** Kept under Vercel's 4.5 MB request limit, with room for the form around the file. */
export const MAX_CV_BYTES = 4 * 1024 * 1024;

/** For the file picker. The server checks the file's contents, not its name. */
export const ACCEPTED_CV_FILES =
  ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const cvFileMessages = {
  missing: "Choose your CV file to upload.",
  empty: "This file is empty. Choose your CV and try again.",
  tooLarge: "This file is over 4 MB. Save a smaller copy, for example without photos, and try again.",
  wrongType: "Upload your CV as a PDF or a Word (.docx) file.",
  oldWord: "This is an older Word file (.doc). Save it as .docx or PDF, then upload it again.",
  password: "This file is password-protected. Remove the password, then upload it again.",
  unreadable: "We couldn’t open this file. Check that it opens on your computer, then try again.",
  tooSlow: "This PDF takes too long to read. Upload the Word version, or save the PDF again from Word or Google Docs.",
  noText:
    "We couldn’t find any text in this file. If it is a scanned image, upload the Word version, or a PDF saved from Word or Google Docs.",
} as const;
