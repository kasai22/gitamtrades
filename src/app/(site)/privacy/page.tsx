import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/shared/prose-page";
import { appConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy Policy" };

/** Must match actual data handling in the app (PRD §15 launch checklist). */
export default function PrivacyPage() {
  const name = appConfig.name;
  const g = appConfig.grievance;
  return (
    <ProsePage
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what personal data {name} collects, why, who can see it and the choices you have. It is written to meet the Digital
          Personal Data Protection Act, 2023 and the Information Technology Act, 2000 and rules made under them. {name} is the data fiduciary for
          the personal data described here.
        </p>
      }
    >
      <section>
        <h2>1. Data we collect</h2>
        <ul>
          <li><strong>Account data:</strong> your GITAM student email address, password (stored only as a secure hash by our authentication provider), display name and optional profile photo.</li>
          <li><strong>Consent records:</strong> when you confirmed you are 18 or older and accepted these policies, and which version you accepted.</li>
          <li><strong>Listings:</strong> the details and photos you publish. Photos are re-processed on upload and all embedded metadata, including GPS location, is removed.</li>
          <li><strong>Messages:</strong> chats between you and other users, including any contact details you choose to share in a chat.</li>
          <li><strong>Community content:</strong> posts, comments and your votes. Posts and comments are visible to all verified GITAM students with your display name; individual votes are not shown to others.</li>
          <li><strong>Optional contact number:</strong> if you save one in Settings, it is stored privately and shown only to a person you choose to share it with in a chat.</li>
          <li><strong>Safety records:</strong> reports you make or that concern you, appeals, moderation decisions, account restrictions, blocks and seller declarations.</li>
          <li><strong>Usage data:</strong> counts of actions such as listings published, searches and chats started, linked to your account ID. We do not record message text, contact details, email addresses or search text in analytics, except short searches that returned no results, with numbers removed.</li>
          <li><strong>Technical data:</strong> session cookies needed to keep you signed in, and standard server logs.</li>
        </ul>
      </section>

      <section>
        <h2>2. Why we use it</h2>
        <ul>
          <li>To confirm you are a current GITAM student and run your account.</li>
          <li>To show your listings to other verified students and deliver your messages.</li>
          <li>To keep the marketplace safe: automated checks, handling reports and appeals, preventing spam and fraud, and enforcing our Terms.</li>
          <li>To meet legal obligations, including responding to lawful requests from authorities.</li>
          <li>To understand, in aggregate, how the service is used so we can improve it.</li>
        </ul>
        <p>We process your data on the basis of the consent you give when you sign up and for the legitimate uses permitted by law. We do not sell personal data, show advertising or use your data for profiling.</p>
      </section>

      <section>
        <h2>3. Who can see your data</h2>
        <ul>
          <li><strong>Other verified GITAM students</strong> can see your display name, profile photo, verification badge, join date and your published listings.</li>
          <li><strong>Only the two people in a conversation</strong> can read it. If a message is reported, our safety team can see that message; that access is logged.</li>
          <li><strong>A person you report is never told who reported them.</strong></li>
          <li><strong>Our safety team</strong> can see the data needed to review reports, appeals and legal requests. Every privileged action is recorded in an audit log.</li>
          <li><strong>Service providers</strong> who host our database, authentication, file storage and email delivery process data on our behalf under contract.</li>
          <li><strong>Authorities</strong>, when we are legally required to disclose information.</li>
        </ul>
      </section>

      <section>
        <h2>4. How long we keep it</h2>
        <ul>
          <li><strong>Account, listings and photos:</strong> while your account is active. After an account deletion request your live listings are removed immediately, and your account, listings, photos and profile are deleted within 30 days.</li>
          <li><strong>Messages:</strong> while both participants&apos; accounts exist. A conversation is deleted when either participant&apos;s account is deleted.</li>
          <li><strong>Community posts and comments:</strong> until you delete them or your account. On deletion the text is erased and the item is shown as &ldquo;[deleted]&rdquo; so other students&apos; replies stay readable.</li>
          <li><strong>Safety records</strong> (reports, appeals, moderation and audit logs): kept for at least 180 days after the case closes, or longer where the law or an ongoing investigation requires.</li>
          <li><strong>Usage analytics:</strong> kept in a form linked only to an account ID, and used in aggregate.</li>
        </ul>
      </section>

      <section>
        <h2>5. Your rights</h2>
        <p>You can:</p>
        <ul>
          <li>access and correct your profile and saved contact number in <Link href="/account/settings">Settings</Link>;</li>
          <li>request a summary of your personal data, or its correction or erasure, by writing to our Grievance Officer;</li>
          <li>withdraw consent by deleting your account from Settings (this ends your use of the service);</li>
          <li>nominate another person to exercise your rights in the event of your death or incapacity;</li>
          <li>raise a grievance with us, and if it isn&apos;t resolved, with the Data Protection Board of India.</li>
        </ul>
      </section>

      <section>
        <h2>6. Security</h2>
        <p>
          Data is encrypted in transit, access is restricted by role and enforced in the database, listing photos are stored privately and
          served through short-lived links, and your saved contact number is never published on listings. No system is perfectly secure; if a breach
          affects your personal data we will notify you and the authorities as required by law.
        </p>
      </section>

      <section>
        <h2>7. Children</h2>
        <p>{name} is only for users aged 18 and over. If we learn that an account belongs to someone under 18, we will close it.</p>
      </section>

      <section>
        <h2>8. Changes and contact</h2>
        <p>
          We will post any changes here with a new effective date and tell you in the app about significant changes. For privacy questions or
          requests, contact our Grievance Officer, {g.name}, at <a href={`mailto:${g.email}`}>{g.email}</a>. See{" "}
          <Link href="/grievance">Grievance Redressal</Link> for response times.
        </p>
      </section>
    </ProsePage>
  );
}
