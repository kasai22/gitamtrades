import type { Metadata } from "next";
import Link from "next/link";
import { Mail, UserRound } from "lucide-react";
import { ProsePage } from "@/components/shared/prose-page";
import { appConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Grievance Redressal" };

/** ADMIN-04: grievance officer details and process (IT Rules, 2021; DPDP Act, 2023). */
export default function GrievancePage() {
  const g = appConfig.grievance;
  return (
    <ProsePage
      title="Grievance Redressal"
      intro={
        <p>
          In accordance with the Information Technology Act, 2000, the Information Technology (Intermediary Guidelines and Digital Media Ethics
          Code) Rules, 2021 and the Digital Personal Data Protection Act, 2023, {appConfig.name} has appointed a Grievance Officer to handle
          complaints about content, accounts and personal data.
        </p>
      }
    >
      <section aria-labelledby="officer" className="rounded-xl border bg-card p-5">
        <h2 id="officer">Grievance Officer</h2>
        <address className="grid gap-2 not-italic">
          <p className="flex items-center gap-2"><UserRound className="size-4 text-muted-foreground" aria-hidden /> <strong>{g.name}</strong></p>
          <p className="flex items-center gap-2"><Mail className="size-4 text-muted-foreground" aria-hidden /> <a href={`mailto:${g.email}`}>{g.email}</a></p>
          {g.address && <p>{g.address}</p>}
        </address>
        <p className="mt-3 text-sm text-muted-foreground">Available Monday to Friday, 10:00 to 18:00 IST, excluding public holidays.</p>
      </section>

      <section>
        <h2>How to raise a grievance</h2>
        <ol>
          <li>
            <strong>For a listing, message or user:</strong> the fastest route is the <strong>Report</strong> button on the listing, chat message
            or profile. You&apos;ll get a case number straight away and can follow it under <Link href="/account/cases">Reports &amp; appeals</Link>.
          </li>
          <li>
            <strong>To challenge a decision about your listing or account:</strong> use <strong>Request a review</strong> on the listing or on your
            account page. A member of our team reviews every request.
          </li>
          <li>
            <strong>For anything else</strong> (including privacy requests, or if you can&apos;t sign in), email the Grievance Officer with your
            name, the email address on your account, a description of the issue, any case number, and links or screenshots that help.
          </li>
        </ol>
      </section>

      <section>
        <h2>What happens next</h2>
        <ul>
          <li>We acknowledge your complaint within <strong>24 hours</strong>.</li>
          <li>We resolve it within <strong>15 days</strong> of receipt, and tell you the outcome and the reasons.</li>
          <li>Complaints about content that exposes a person&apos;s private areas, shows them in sexual acts or impersonates them are acted on within <strong>24 hours</strong>.</li>
          <li>Requests to remove other unlawful content are handled within <strong>72 hours</strong>.</li>
        </ul>
        <p>
          If you are not satisfied with our response to a personal data grievance, you may approach the Data Protection Board of India. If anyone
          is in immediate danger, contact campus security or call <strong>112</strong>.
        </p>
      </section>
    </ProsePage>
  );
}
