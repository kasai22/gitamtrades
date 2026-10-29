import { NextResponse, type NextRequest } from "next/server";
import { track } from "@/lib/analytics";
import { safeNextPath } from "@/lib/security/safe-redirect";
import { createClient } from "@/lib/supabase/server";

/** PKCE callback used by Supabase's default email links (sign-up confirmation, password recovery). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      if (next !== "/reset-password") track("email_verified", data.user.id, { method: "link" });
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  const failure = next === "/reset-password" ? "/forgot-password?error=link" : "/verify-email?error=link";
  return NextResponse.redirect(`${origin}${failure}`);
}
