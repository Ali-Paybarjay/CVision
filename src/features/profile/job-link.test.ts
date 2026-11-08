import { describe, expect, it } from "vitest";
import { brand } from "@/shared/brand";
import { adLinkFailureMessage, jobSite, needsPersonSpecHint, personSpecHint, siteLabel, type AdLinkFailure } from "./job-link";

describe("jobSite", () => {
  it("knows a site by its address and its subdomains, whatever the case", () => {
    expect(jobSite("https://uk.linkedin.com/jobs/view/4012345678")).toMatchObject({ name: "LinkedIn", textOnly: true });
    expect(jobSite("https://www.linkedin.com/jobs/view/4012345678/")).toMatchObject({ name: "LinkedIn", textOnly: true });
    expect(jobSite("https://lnkd.in/eAbCdEf")).toMatchObject({ name: "LinkedIn", textOnly: true });
    expect(jobSite("HTTPS://WWW.REED.CO.UK/jobs/data-analyst/55512345")).toMatchObject({ name: "Reed" });
    expect(jobSite("https://pennine.wd3.myworkdayjobs.com/en-GB/careers/job/Leeds/Analyst_R123")).toMatchObject({ name: "Workday" });
  });

  it("matches whole names only, so a look-alike address is not the site", () => {
    expect(jobSite("https://notlinkedin.com/jobs/view/1")).toBeNull();
    expect(jobSite("https://linkedin.com.example.net/jobs/view/1")).toBeNull();
    expect(jobSite("https://careers.pennine-health.co.uk/jobs/42")).toBeNull();
    expect(jobSite("not a link")).toBeNull();
  });

  it("asks for the text at once only for the sites that never show an ad to another website", () => {
    expect(jobSite("https://uk.indeed.com/viewjob?jk=0123456789abcdef")?.textOnly).toBe(true);
    expect(jobSite("https://www.totaljobs.com/job/administrator/pennine-health-job108000001")?.textOnly).toBe(true);
    expect(jobSite("https://www.civilservicejobs.service.gov.uk/csr/jobs.cgi?jcode=1900001")?.textOnly).toBe(true);
    expect(jobSite("https://apps.trac.jobs/job-advert/1234567")).toMatchObject({ name: "Trac", textOnly: true });
    expect(jobSite("https://www.reed.co.uk/jobs/data-analyst/55512345")?.textOnly).toBeUndefined();
    expect(jobSite("https://www.jobs.nhs.uk/candidate/jobadvert/C9123-25-0001")?.textOnly).toBeUndefined();
  });

  it("lets a subdomain's own rule come before its site's", () => {
    expect(jobSite("https://app.welcometothejungle.com/jobs/AbCdEf12")).toMatchObject({ textOnly: true });
    expect(jobSite("https://www.welcometothejungle.com/en/companies/pennine/jobs/analyst_london")?.textOnly).toBeUndefined();
  });
});

describe("siteLabel", () => {
  it("names the site as people write it", () => {
    expect(siteLabel("https://www.reed.co.uk/jobs/data-analyst/55512345")).toBe("reed.co.uk");
    expect(siteLabel("https://jobs.nhs.uk/candidate/jobadvert/C9123-25-0001")).toBe("jobs.nhs.uk");
  });
});

describe("adLinkFailureMessage", () => {
  const reasons: AdLinkFailure[] = [
    "invalid-url",
    "blocked",
    "not-found",
    "too-slow",
    "too-large",
    "not-a-page",
    "no-text",
    "no-ad",
    "failed",
    "text-only-site",
  ];

  it.each(reasons)("says why, then asks for the ad's text in the box below: %s", (reason) => {
    const message = adLinkFailureMessage(reason, "https://jobs.example.com/ad/1");

    expect(message).toMatch(/\. Copy the ad from the (page|file) and paste it below\.$/);
  });

  it("names the site that doesn't show its ads to other websites", () => {
    expect(adLinkFailureMessage("text-only-site", "https://uk.linkedin.com/jobs/view/4012345678")).toBe(
      "LinkedIn doesn’t let other websites open its job ads. Copy the ad from the page and paste it below.",
    );
  });

  it("asks for the text from the file when the link opens one", () => {
    expect(adLinkFailureMessage("not-a-page", "https://jobs.example.com/ad.pdf")).toContain("Copy the ad from the file");
  });
});

describe("needsPersonSpecHint (#400)", () => {
  const nhsAd = "Staff Nurse, Band 5. Main duties of the job: care for patients on the ward. Closing date 30 November.";

  it("asks for the PDF's criteria when an NHS Jobs or Trac ad has none on the page", () => {
    expect(needsPersonSpecHint(nhsAd, "https://www.jobs.nhs.uk/candidate/jobadvert/C9999-26-0001")).toBe(true);
    expect(needsPersonSpecHint(nhsAd, "https://apps.trac.jobs/job-advert/999999")).toBe(true);
    expect(needsPersonSpecHint("Staff Nurse with an NHS trust. Main duties: care for patients.", "")).toBe(true);
  });

  it("stays quiet when the ad has its criteria, or is not an NHS ad", () => {
    expect(needsPersonSpecHint(`${nhsAd}\n\nPerson Specification\nQualifications`, "https://www.jobs.nhs.uk/x")).toBe(false);
    expect(needsPersonSpecHint(`${nhsAd}\nEssential criteria: NMC registration`, "https://apps.trac.jobs/x")).toBe(false);
    expect(needsPersonSpecHint("Junior Data Analyst. Strong SQL.", "https://www.reed.co.uk/jobs/1")).toBe(false);
    expect(needsPersonSpecHint("", "https://www.jobs.nhs.uk/x")).toBe(false);
  });

  it("says it in the brand's voice", () => {
    for (const phrase of brand.bannedPhrases) expect(personSpecHint.toLowerCase()).not.toContain(phrase.toLowerCase());
  });
});
