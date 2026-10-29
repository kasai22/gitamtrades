import type { Metadata } from "next";
import { ActionButton } from "@/components/shared/action-button";
import { PageHeader } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { AVATAR_BUCKET, signPath } from "@/lib/storage";
import { ContactPhoneForm, DeleteAccountForm, ProfileForm } from "@/features/account/components/settings-forms";
import { getBlockedUsers, getPrivateProfile } from "@/features/account/queries";
import { unblockUser } from "@/features/messaging/actions";

export const metadata: Metadata = { title: "Settings" };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-xl border bg-card p-5 md:grid-cols-[240px_1fr]">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const viewer = await requireUser("/account/settings");
  const supabase = await createClient();
  const [privateProfile, blocked, avatarUrl] = await Promise.all([
    getPrivateProfile(viewer.id),
    getBlockedUsers(viewer.id),
    signPath(supabase, AVATAR_BUCKET, viewer.avatarPath),
  ]);

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-4">
        <Section title="Profile" description="What other students see.">
          <ProfileForm displayName={viewer.displayName} avatarUrl={avatarUrl} />
        </Section>

        <Section title="Contact sharing" description="Your contact details are never shown on listings.">
          <ContactPhoneForm phone={privateProfile?.contact_phone ?? null} />
        </Section>

        <Section title="Blocked students" description="They can't message you, and you won't see their listings.">
          {blocked.length === 0 ? (
            <p className="text-sm text-muted-foreground">You haven&apos;t blocked anyone.</p>
          ) : (
            <ul className="divide-y rounded-lg border" role="list">
              {blocked.map((user) => (
                <li key={user.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span>
                    {user.name} <span className="text-muted-foreground">· since {formatDate(user.blockedAt)}</span>
                  </span>
                  <ActionButton size="sm" variant="outline" action={unblockUser.bind(null, user.id, undefined)} successMessage="Unblocked.">
                    Unblock
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Notifications" description="In-app only during the pilot.">
          <p className="text-sm text-muted-foreground">
            Unread chats are shown with a badge on the Messages icon. Email notifications aren&apos;t available yet, so there&apos;s nothing to turn
            off here.
          </p>
        </Section>

        <Section title="Sessions" description="Sign out of this device or everywhere.">
          <div className="flex flex-wrap gap-2">
            <form action="/auth/signout" method="post"><Button type="submit" variant="outline">Sign out</Button></form>
            <form action="/auth/signout" method="post">
              <input type="hidden" name="scope" value="global" />
              <Button type="submit" variant="outline">Sign out of all devices</Button>
            </form>
          </div>
          {privateProfile && (
            <p className="mt-3 text-xs text-muted-foreground">
              Terms accepted {formatDate(privateProfile.terms_accepted_at)} (version {privateProfile.terms_version}).
            </p>
          )}
        </Section>

        <Section title="Delete account" description="Ask us to delete your account and personal data.">
          <DeleteAccountForm />
        </Section>
      </div>
    </>
  );
}
