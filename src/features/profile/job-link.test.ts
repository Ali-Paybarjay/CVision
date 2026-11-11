import { describe, expect, it } from "vitest";
import { brand } from "@/shared/brand";
import { personas } from "@/shared/sample-data";
import clinicalJob from "../../../sample-data/clinical/job.json";
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

  describe("the fictional Band 6 ad (#420)", () => {
    const whole = clinicalJob.description;
    // Without its person specification, only "Job description and person specification (PDF, 220KB)" names it.
    const withoutCriteria = whole.slice(0, whole.indexOf("Person specification\n")) + whole.slice(whole.indexOf("Employer certification"));

    it("asks for the criteria when the page names only the PDF, from NHS Jobs, Trac or no link", () => {
      expect(withoutCriteria).toContain("Job description and person specification (PDF, 220KB)");
      expect(withoutCriteria).not.toContain("Essential criteria");
      for (const link of ["https://www.jobs.nhs.uk/candidate/jobadvert/C9999-26-0001", "https://apps.trac.jobs/job-advert/999999", ""]) {
        expect(needsPersonSpecHint(withoutCriteria, link), link || "no link").toBe(true);
      }
    });

    it("stays quiet with the whole person specification", () => {
      expect(needsPersonSpecHint(whole, "https://www.jobs.nhs.uk/candidate/jobadvert/C9999-26-0001")).toBe(false);
      expect(needsPersonSpecHint(whole, "")).toBe(false);
    });
  });

  it("counts a heading on its own line or in a table cell, not the word inside a criterion", () => {
    const link = "https://www.jobs.nhs.uk/candidate/jobadvert/C9999-26-0001";

    expect(needsPersonSpecHint(`${nhsAd}\nThis post needs an essential car user.`, link)).toBe(true);
    expect(needsPersonSpecHint(`${nhsAd}\nEssential car user`, link)).toBe(true);
    expect(needsPersonSpecHint(`${nhsAd}\nQualifications\tEssential\tDesirable`, link)).toBe(false);
    expect(needsPersonSpecHint(`${nhsAd}\n  ESSENTIAL CRITERIA  \n- NMC registration`, link)).toBe(false);
    expect(needsPersonSpecHint(`${nhsAd}\nDesirable:`, link)).toBe(false);
  });

  it("without a link, needs an NHS employer, not a firm that only works with the NHS", () => {
    const pennine = personas.sara.jobs[0].description.replace("Essential:", "What you'll need:").replace("Desirable:", "Nice to have:");

    expect(pennine).toMatch(/NHS trusts/);
    expect(needsPersonSpecHint(pennine, "")).toBe(false);
    expect(needsPersonSpecHint("Healthcare Assistant. Pay: Agenda for Change. Main duties: personal care.", "")).toBe(true);
  });

  it("counts a Band only beside NHS, so a board without a trust stays in and a charity stays out (#469)", () => {
    const physio = "Physiotherapist, band 6. Main duties: assess and treat patients.";
    const charity =
      "Family Support Worker, Band 5. Castlefold Children's Hospice is a local charity. You will need a Level 3 " +
      "qualification in health and social care and experience of supporting families.";

    expect(needsPersonSpecHint(`${physio} Employer: NHS Lothian.`, "")).toBe(true);
    expect(needsPersonSpecHint(physio, "")).toBe(false);
    expect(needsPersonSpecHint(charity, "https://www.reed.co.uk/jobs/family-support-worker/99999999")).toBe(false);
    expect(needsPersonSpecHint(charity, "")).toBe(false);
  });

  describe("criteria that only point at the PDF (#469)", () => {
    const nhsJobsLink = "https://www.jobs.nhs.uk/candidate/jobadvert/C9999-26-0001";
    const pointer = "Please see the attached job description and person specification.";
    // The shape NHS Jobs gives an ad whose employer kept the criteria in the PDF: its headings, then only a pointer.
    const pointerOnly = `${nhsAd}\n\nPerson Specification\nAdditional Criteria\nEssential\n${pointer}\nDesirable\n${pointer}`;

    it("asks for the criteria when every heading only points at an attached document", () => {
      expect(needsPersonSpecHint(pointerOnly, nhsJobsLink)).toBe(true);
      expect(needsPersonSpecHint(`Marrowby and Castlefold NHS Foundation Trust\n${pointerOnly}`, "")).toBe(true);
      expect(needsPersonSpecHint(`${nhsAd}\nPerson specification: please see the attached job description`, nhsJobsLink)).toBe(true);
    });

    it("stays quiet when a heading has a real criterion under it, or points at text on the page", () => {
      expect(needsPersonSpecHint(`${pointerOnly}\nExperience\nEssential\nWard experience at Band 5`, nhsJobsLink)).toBe(false);
      expect(needsPersonSpecHint(`${nhsAd}\nPerson Specification\nEssential\nPlease refer to job description above`, nhsJobsLink)).toBe(false);
    });

    it("keeps the fictional Band 6 ad's criteria, under groups such as Qualifications and Skills and Abilities", () => {
      expect(needsPersonSpecHint(clinicalJob.description, nhsJobsLink)).toBe(false);
    });
  });

  it("counts a short line or cell with both Essential and Desirable as a heading (#469)", () => {
    const trac = "https://apps.trac.jobs/job-advert/999999";
    const table = "Criteria Essential Desirable How assessed\nNMC registration ✓ Application form\nALS certificate ✓ Interview";

    expect(needsPersonSpecHint(`${nhsAd}\n${table}`, trac)).toBe(false);
    expect(needsPersonSpecHint(`${nhsAd}\nEssential Desirable\nRegistered nurse ✓`, trac)).toBe(false);
    // A sentence that only mentions both words is not a heading, and a short pointer is not a criterion.
    const sentence = "Please read the essential and desirable criteria in the job pack carefully before you start your application.";
    expect(needsPersonSpecHint(`${nhsAd}\n${sentence}`, trac)).toBe(true);
    expect(needsPersonSpecHint(`${nhsAd}\nEssential and desirable criteria: see attached JD`, trac)).toBe(true);
  });

  it("asks for the essential and desirable criteria, not the whole PDF, in the brand's voice", () => {
    expect(personSpecHint).toContain("essential and desirable criteria");
    expect(personSpecHint).toContain("not the whole PDF");
    for (const phrase of brand.bannedPhrases) expect(personSpecHint.toLowerCase()).not.toContain(phrase.toLowerCase());
  });
});
