import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/shared/prose-page";

export const metadata: Metadata = { title: "Safe meetups" };

export default function SafetyPage() {
  return (
    <ProsePage title="Meeting and paying safely" effective={false}>
      <p>
        Every exchange happens in person between students. The marketplace doesn&apos;t handle payment, delivery or refunds, and it can&apos;t
        guarantee that an item is genuine or that a meetup goes ahead. A few habits keep things smooth:
      </p>
      <section>
        <h2>Before you meet</h2>
        <ul>
          <li>Keep the conversation in the app until you&apos;re comfortable. Share your number only if you want to.</li>
          <li>Agree the price, what&apos;s included and a time in chat, so there are no surprises.</li>
          <li>Never pay in advance, send a “token amount” or share an OTP, password or photo of your ID.</li>
        </ul>
      </section>
      <section>
        <h2>At the meetup</h2>
        <ul>
          <li>Meet in a busy, well-lit campus spot such as the library entrance or food court, ideally in daytime.</li>
          <li>Tell a friend where you&apos;re going, or bring one along.</li>
          <li>Inspect the item: switch electronics on, check pages, test cycles. You can always walk away.</li>
          <li>Pay only once you&apos;re happy, in person. Prefer cash or a UPI payment you start yourself at the meetup.</li>
        </ul>
      </section>
      <section>
        <h2>Red flags</h2>
        <ul>
          <li>Asking you to pay before meeting, or for “courier” or “registration” charges.</li>
          <li>Sending a QR code for you to scan “to receive money”. Scanning a QR code only ever sends money.</li>
          <li>Pressure to decide fast, or claims of being away (for example “I&apos;m posted in the army”).</li>
          <li>Prices far below what similar items sell for.</li>
        </ul>
      </section>
      <section>
        <h2>If something goes wrong</h2>
        <p>
          Use <strong>Report</strong> on the listing, profile or message, and block the person if you need to. If anyone is in immediate
          danger, contact campus security or call <strong>112</strong>. For complaints, see the{" "}
          <Link href="/grievance">grievance contact</Link>.
        </p>
      </section>
    </ProsePage>
  );
}
