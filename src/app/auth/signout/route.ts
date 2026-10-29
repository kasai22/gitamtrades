import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** AUTH-04: POST-only sign-out (GET would allow cross-site logout via an <img> tag). */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const scope = form?.get("scope") === "global" ? "global" : "local";
  const supabase = await createClient();
  await supabase.auth.signOut({ scope });
  return NextResponse.redirect(new URL("/?signed_out=1", request.url), { status: 303 });
}
