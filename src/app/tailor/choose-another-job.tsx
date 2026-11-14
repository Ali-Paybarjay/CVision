import Link from "next/link";

/** The way back from one job to the list of jobs, for a user who picked the wrong one (#462). */
export function ChooseAnotherJob() {
  return (
    <Link href="/tailor" className="w-fit text-accent underline underline-offset-4">
      ← Choose another job
    </Link>
  );
}
