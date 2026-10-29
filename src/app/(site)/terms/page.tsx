import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/shared/prose-page";
import { appConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  const name = appConfig.name;
  return (
    <ProsePage
      title="Terms of Use"
      intro={
        <p>
          These Terms of Use (&ldquo;Terms&rdquo;) govern your use of {name} (&ldquo;{name}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;), a website
          that lets verified students of GITAM (Deemed to be University) list items and contact each other. By creating an account you agree to
          these Terms, our <Link href="/privacy">Privacy Policy</Link> and our <Link href="/policies/prohibited-items">Prohibited Items Policy</Link>.
        </p>
      }
    >
      <section>
        <h2>1. About the service</h2>
        <p>
          {name} is an online platform that hosts listings posted by students and lets buyers and sellers message each other. We are an
          intermediary: we are not a buyer, seller, agent, broker or party to any transaction. We do not process, collect, hold or transfer
          payments, offer escrow, deliver items or provide refunds, warranties or buyer protection. {appConfig.independenceNotice}
        </p>
      </section>

      <section>
        <h2>2. Eligibility and accounts</h2>
        <ol>
          <li>You must be at least 18 years old and a current student with an active <strong>@student.gitam.edu</strong> email address. Alumni, staff and personal email addresses cannot be used.</li>
          <li>You must verify your email address before you can browse listings, message other users or sell.</li>
          <li>You may hold only one account. Keep your password confidential; you are responsible for activity on your account.</li>
          <li>&ldquo;University email verified&rdquo; means only that a user controls a GITAM student email address. It is not a verification of identity, character or the items they offer.</li>
        </ol>
      </section>

      <section>
        <h2>3. Listings and selling</h2>
        <ol>
          <li>You may list only items that you own or are authorised to sell and that are lawful to sell in India. You confirm this each time you publish a listing.</li>
          <li>Listings must be accurate and honest, including the item&apos;s condition and any defects. Photos must be your own and must not show other people&apos;s personal information, QR codes, barcodes or redeemable codes.</li>
          <li>The asking price is set by you and is not binding until you and the buyer agree. Messages on {name} are not orders or contracts made with us.</li>
          <li>Do not include phone numbers, email addresses, payment IDs or links in listings. Buyers contact you through in-app chat.</li>
          <li>Keep listings up to date: mark items as sold or on hold promptly. Listings expire automatically after a period of inactivity and can be renewed.</li>
          <li>Event tickets may be listed only where their transfer or resale is lawful and permitted by the event or venue&apos;s terms.</li>
        </ol>
      </section>

      <section>
        <h2>4. Community posts and comments</h2>
        <p>
          Community threads are for discussion among verified students. Be respectful, stay on topic, and don&apos;t post anyone&apos;s personal
          information, contact details, payment details or content described in the Prohibited Items Policy. You can delete your own posts and
          comments at any time; they remain in the thread as &ldquo;[deleted]&rdquo;. Moderators may remove content, lock threads or restrict
          accounts that break these Terms.
        </p>
      </section>

      <section>
        <h2>5. Buying and meeting</h2>
        <p>
          All exchanges happen in person between users, who arrange and settle payment directly. Inspect every item before paying, meet in busy
          public places on campus and never pay in advance. We do not guarantee that any item is genuine, safe, legal or as described, or that
          any exchange will take place. See our <Link href="/safety">safety guidance</Link>.
        </p>
      </section>

      <section>
        <h2>6. Prohibited conduct</h2>
        <p>You must not:</p>
        <ul>
          <li>list or request any item or service described in the <Link href="/policies/prohibited-items">Prohibited Items Policy</Link>;</li>
          <li>post content that is unlawful, fraudulent, misleading, defamatory, obscene, harassing, threatening or that infringes anyone&apos;s rights;</li>
          <li>impersonate anyone, create fake or multiple accounts, or use another person&apos;s student email;</li>
          <li>ask for advance payments, OTPs, passwords or identity documents, or attempt any scam;</li>
          <li>spam, scrape, overload or interfere with the service, or try to bypass its security, moderation or rate limits;</li>
          <li>use the service for commercial reselling, advertising or wholesale trade.</li>
        </ul>
      </section>

      <section>
        <h2>7. Moderation and enforcement</h2>
        <p>
          Listings are published without manual pre-approval. Automated checks may block or hide content that appears to break these Terms, and
          users can report listings, messages and accounts. We may remove content, limit features or suspend or terminate accounts that break
          these Terms, when required by law or to protect users. Where we act, we tell you the reason when we lawfully can, and you can request a
          human review from the listing or your account page. We keep records of moderation decisions as described in our Privacy Policy.
        </p>
      </section>

      <section>
        <h2>8. Your content</h2>
        <p>
          You keep ownership of the content you post. You grant {name} a non-exclusive, royalty-free licence to host, store, resize and display it
          to other verified users for the purpose of operating the service, until you delete it or your account. You are responsible for your
          content and for having the right to post it.
        </p>
      </section>

      <section>
        <h2>9. Fees</h2>
        <p>{name} is free to use. We do not charge listing fees or commissions.</p>
      </section>

      <section>
        <h2>10. Disclaimers and limitation of liability</h2>
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the fullest extent permitted by law, {name} is not liable
          for any loss or damage arising from transactions between users, the condition or legality of items, users&apos; conduct online or
          offline, or any interruption of the service. Nothing in these Terms limits liability that cannot be limited under applicable law.
        </p>
      </section>

      <section>
        <h2>11. Ending your account</h2>
        <p>
          You can stop using {name} at any time and request deletion of your account from <Link href="/account/settings">Settings</Link>. We may
          suspend or close accounts that break these Terms, are no longer eligible, or as required by law.
        </p>
      </section>

      <section>
        <h2>12. Changes to these Terms</h2>
        <p>
          We may update these Terms. The version and effective date are shown at the top of this page. If a change is significant we will tell you
          in the app; continuing to use {name} after the change means you accept the updated Terms.
        </p>
      </section>

      <section>
        <h2>13. Governing law and complaints</h2>
        <p>
          These Terms are governed by the laws of India, and the competent courts in India have jurisdiction. For complaints, contact our
          Grievance Officer as described on the <Link href="/grievance">Grievance Redressal</Link> page. For anything else, write to{" "}
          <a href={`mailto:${appConfig.supportEmail}`}>{appConfig.supportEmail}</a>.
        </p>
      </section>
    </ProsePage>
  );
}
