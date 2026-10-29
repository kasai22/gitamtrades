import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/session";
import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AVATAR_BUCKET, LISTING_BUCKET, signPath } from "@/lib/storage";
import { ImageRejectedError, processImage } from "@/features/uploads/process-image";

/** Unattached uploads a seller may hold at once (limits storage abuse). */
const MAX_PENDING_IMAGES = 30;

function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * POST /api/uploads?kind=listing|avatar  (multipart form field "file")
 * Validates and re-encodes images server-side before they reach storage (LIST-03, AC-13).
 */
export async function POST(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind");
  if (kind !== "listing" && kind !== "avatar") return error(400, "Unknown upload type.");

  const viewer = await getViewer();
  if (!viewer) return error(401, "Please sign in again.");
  if (kind === "listing" && !viewer.canSell) return error(403, "Turn on selling before uploading photos.");
  if (kind === "avatar" && !viewer.isVerified) return error(403, "Verify your university email first.");

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_UPLOAD_BYTES + 64 * 1024) return error(413, "Photos must be under 8 MB.");

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch {
    return error(400, "The upload couldn't be read. Try again.");
  }
  if (!file) return error(400, "Choose a photo to upload.");
  if (file.size > MAX_UPLOAD_BYTES) return error(413, "Photos must be under 8 MB.");

  const supabase = await createClient();
  const admin = createAdminClient();

  if (kind === "listing") {
    const { count } = await admin
      .from("listing_images")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", viewer.id)
      .is("listing_id", null);
    if ((count ?? 0) >= MAX_PENDING_IMAGES) {
      return error(429, "You have too many unpublished photos. Publish or discard a listing first.");
    }
  }

  let processed;
  try {
    processed = await processImage(new Uint8Array(await file.arrayBuffer()), kind);
  } catch (cause) {
    if (cause instanceof ImageRejectedError) return error(422, cause.message);
    console.error("[uploads] processing failed", (cause as Error).message);
    return error(500, "That photo couldn't be processed. Try a different file.");
  }

  const objectId = crypto.randomUUID();
  const bucket = kind === "listing" ? LISTING_BUCKET : AVATAR_BUCKET;
  const fullPath = `${viewer.id}/${objectId}.webp`;
  const thumbPath = `${viewer.id}/${objectId}_thumb.webp`;

  // Upload with the user's own session so storage RLS (own-folder only) is enforced.
  const uploads = await Promise.all([
    supabase.storage.from(bucket).upload(fullPath, processed.full, { contentType: "image/webp", upsert: false }),
    supabase.storage.from(bucket).upload(thumbPath, processed.thumb, { contentType: "image/webp", upsert: false }),
  ]);
  if (uploads.some((u) => u.error)) {
    await supabase.storage.from(bucket).remove([fullPath, thumbPath]);
    console.error("[uploads] storage upload failed", uploads.map((u) => u.error?.message).filter(Boolean));
    return error(500, "Upload failed. Check your connection and try again.");
  }

  if (kind === "avatar") {
    const previous = viewer.avatarPath;
    const { error: updateError } = await supabase.from("profiles").update({ avatar_path: thumbPath }).eq("id", viewer.id);
    if (updateError) return error(500, "Couldn't save your profile photo.");
    await supabase.storage.from(bucket).remove([fullPath, ...(previous ? [previous] : [])]);
    return NextResponse.json({ url: await signPath(supabase, bucket, thumbPath) }, { headers: { "Cache-Control": "no-store" } });
  }

  // Image metadata is written server-side so clients can't forge hashes or QR flags.
  const { data: row, error: insertError } = await admin
    .from("listing_images")
    .insert({
      owner_id: viewer.id,
      storage_path: fullPath,
      thumb_path: thumbPath,
      width: processed.width,
      height: processed.height,
      content_hash: processed.contentHash,
      qr_detected: processed.qrDetected,
    })
    .select("id")
    .single();
  if (insertError || !row) {
    await supabase.storage.from(bucket).remove([fullPath, thumbPath]);
    return error(500, "Upload failed. Please try again.");
  }

  return NextResponse.json(
    {
      id: row.id,
      thumbUrl: await signPath(supabase, bucket, thumbPath),
      width: processed.width,
      height: processed.height,
      qrDetected: processed.qrDetected,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
