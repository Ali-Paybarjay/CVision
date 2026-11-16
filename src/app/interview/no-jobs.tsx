import { ButtonLink, Notice } from "@/shared/ui";

/**
 * Interview practice for a signed-in user with no job yet: the note says what to do, and the button under it takes
 * them there (#502), as Profile's "Next: find a job to apply for" does. It is the page's one Coral button.
 */
export function NoJobsYet() {
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="info" title="No jobs yet">
        Add a job ad on the Check a job page, then come back here for interview practice.
      </Notice>
      {/* self-start: in a flex column the button would otherwise fill the whole width. */}
      <ButtonLink href="/jobs" variant="primary" className="self-start">
        Paste a job ad
      </ButtonLink>
    </div>
  );
}
