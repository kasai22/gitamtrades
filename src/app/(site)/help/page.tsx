import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/shared/prose-page";
import { appConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Help & FAQ" };

const FAQ = [
  ["Who can join?", "Current GITAM students aged 18 or over, using their @student.gitam.edu email. Alumni, staff and personal email addresses can't be used."],
  ["Does anyone approve my listing?", "No. Listings go live straight after automated checks. Clear rule-breaking is blocked with an explanation, and some listings are checked by the safety team before they're shown."],
  ["How do I get paid?", "In person, when you meet the buyer. The marketplace never collects, holds or transfers money, and messages are not orders."],
  ["Is my phone number visible?", "No. Your number is only shared if you tap Share contact inside a specific chat."],
  ["What happens when I mark something sold?", "It disappears from search and browsing. People who saved it see that it's sold. You can relist it if the sale falls through."],
  ["Why did my listing expire?", "Listings expire after a set period so the marketplace stays current. You can renew it from My listings."],
  ["What does “University email verified” mean?", "Only that the person controls a GITAM student email address. It isn't proof of identity, so follow the safety tips."],
];

export default function HelpPage() {
  const g = appConfig.grievance;
  return (
    <ProsePage title="Help & FAQ" effective={false}>
      <section>
        <h2>Frequently asked questions</h2>
        <dl className="grid gap-4">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <dt className="font-semibold">{q}</dt>
              <dd className="text-muted-foreground">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section id="appeals">
        <h2>Reports and reviews</h2>
        <p>
          Every report and review request gets a case number. Blocked or hidden listings show the reason and a <strong>Request a review</strong>{" "}
          button; account restrictions show the same option on your account page. A person on the safety team handles every review. Track your
          cases under <Link href="/account/cases">Reports &amp; appeals</Link>.
        </p>
      </section>
      <section id="grievance">
        <h2>Contact us</h2>
        <p>
          Email <a href={`mailto:${appConfig.supportEmail}`}>{appConfig.supportEmail}</a>. For complaints about content, accounts or personal
          data, our Grievance Officer is {g.name} (<a href={`mailto:${g.email}`}>{g.email}</a>). See <Link href="/grievance">Grievance Redressal</Link>{" "}
          for how complaints are handled and response times.
        </p>
      </section>
    </ProsePage>
  );
}
