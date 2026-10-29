import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/shared/prose-page";

export const metadata: Metadata = { title: "Prohibited and restricted items" };

const PROHIBITED = [
  ["Drugs and controlled substances", "Including cannabis, prescription drugs without a prescription, and drug paraphernalia."],
  ["Weapons and explosives", "Firearms, ammunition, country-made weapons, explosives, tasers, brass knuckles and switchblades."],
  ["Stolen goods", "Anything you don't own or aren't allowed to sell."],
  ["Counterfeit goods", "“First copy”, “master copy”, replica-branded items and fake tickets."],
  ["Forged documents and credentials", "Fake certificates, mark sheets, degrees, IDs or bonafide letters."],
  ["Regulated goods", "Alcohol, tobacco and gutka, vapes and e-cigarettes, and prescription or scheduled medicines."],
  ["Identity documents and personal data", "Aadhaar, PAN, voter IDs, passports, student ID cards and pre-activated SIM cards."],
  ["Accounts, malware and pirated goods", "Streaming or social accounts, cracked software, keygens, hacking tools."],
  ["Academic misconduct", "Leaked papers, exam answers, proxy attendance or proxy exams."],
  ["Hazardous or illegal materials", "Dangerous chemicals and anything unsafe to keep in hostels."],
  ["Wildlife and exploitation", "Products of protected species, human organs or blood, and any form of trafficking or exploitation."],
];

const RESTRICTED = [
  ["Animals and pets", "Listings are reviewed by the safety team before they appear."],
  ["Knives, air guns and sports blades", "Reviewed before they appear; describe the item's normal use clearly."],
  ["Services", "Assignment, record or thesis writing and similar services are reviewed and may be removed."],
];

export default function ProhibitedItemsPage() {
  return (
    <ProsePage title="Prohibited and Restricted Items">
      <p>
        You can list anything that is legal to sell and allowed by these rules. That isn&apos;t literally everything. Our automated checks block
        clear violations before they&apos;re published, and we review reports from students. If a listing is blocked you&apos;ll see the reason
        and can edit it or <Link href="/help#appeals">request a review</Link>.
      </p>
      <section>
        <h2>Not allowed</h2>
        <ul>
          {PROHIBITED.map(([title, body]) => (
            <li key={title}><strong>{title}.</strong> {body}</li>
          ))}
          <li><strong>Anything else whose sale or transfer is unlawful.</strong></li>
        </ul>
      </section>
      <section>
        <h2>Event tickets</h2>
        <ul>
          <li>Only list tickets whose transfer or resale is lawful and allowed by the event or venue&apos;s terms. You must confirm this when listing.</li>
          <li>Fake, duplicated or non-transferable tickets aren&apos;t allowed.</li>
          <li>Never show QR codes, barcodes, booking IDs or full redeemable codes in photos or text. Share them with the buyer only when you complete the exchange.</li>
        </ul>
      </section>
      <section>
        <h2>Restricted (checked before they&apos;re shown)</h2>
        <ul>
          {RESTRICTED.map(([title, body]) => (
            <li key={title}><strong>{title}.</strong> {body}</li>
          ))}
        </ul>
      </section>
      <section>
        <h2>Keep your listing private and safe</h2>
        <ul>
          <li>Don&apos;t put phone numbers, emails, UPI IDs or messaging links in listings. Buyers contact you through chat, where you choose what to share.</li>
          <li>Don&apos;t include ID numbers, your room number or your live location. Agree a public meetup spot in chat instead.</li>
          <li>Use your own photos and describe defects honestly.</li>
        </ul>
      </section>
      <p className="text-sm text-muted-foreground">
        Email verification confirms university membership, not identity, and moderation can&apos;t guarantee every item. Always inspect items
        before paying. See <Link href="/safety">safety guidance</Link>.
      </p>
    </ProsePage>
  );
}
