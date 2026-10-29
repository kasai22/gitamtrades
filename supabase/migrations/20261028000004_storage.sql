-- Storage buckets and policies (LIST-03).
-- Both buckets are PRIVATE. Files are re-encoded to WebP by the upload route handler before storage,
-- so WebP is the only accepted MIME type. Object names are "<user_id>/<uuid>[_thumb].webp".

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-images', 'listing-images', false, 5242880, array['image/webp']),
  ('avatars', 'avatars', false, 1048576, array['image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Listing images ------------------------------------------------------------
create policy "listing images: sellers upload to own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and public.can_sell()
  );

-- Readable by the owner, or by anyone who can see a listing that references the object.
-- The subquery runs with the caller's privileges, so listing/listing_images RLS decides visibility:
-- images are not readable by other students before the listing is published (LIST-03).
create policy "listing images: read when listing visible" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'listing-images'
    and (
      (storage.foldername(name))[1] = (select auth.uid()::text)
      or exists (
        select 1 from public.listing_images li
        where li.listing_id is not null
          and (li.storage_path = objects.name or li.thumb_path = objects.name)
      )
    )
  );

create policy "listing images: owners delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'listing-images' and (storage.foldername(name))[1] = (select auth.uid()::text));

-- Avatars -------------------------------------------------------------------
create policy "avatars: upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and public.is_verified_student()
  );

create policy "avatars: verified students read" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and public.is_verified_student());

create policy "avatars: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
