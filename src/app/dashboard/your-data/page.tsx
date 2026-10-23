import type { Metadata } from "next";
import { Suspense } from "react";
import { YourData, YourDataFallback } from "@/features/account/your-data";
import { Page } from "@/shared/ui";

export const metadata: Metadata = { title: "Your data" };

// Your data is yours (issue #43): see what we hold, download all of it, or delete the account.
export default function YourDataPage({ searchParams }: PageProps<"/dashboard/your-data">) {
  return (
    <Page title="Your data" description="Your data is yours. See what we hold about you, download all of it, or delete it for good.">
      <Suspense fallback={<YourDataFallback />}>
        <YourDataSection searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function YourDataSection({ searchParams }: Pick<PageProps<"/dashboard/your-data">, "searchParams">) {
  const { download } = await searchParams;
  return <YourData downloadFailed={download === "failed"} />;
}
