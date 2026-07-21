-- Storage bucket for blog images (cover images + inline body images).
--
-- Public read so the images render on the public /blog pages. Unlike the `avatars` bucket
-- (which lets anon write, because players upload their own photos directly), blog images are
-- only ever written by the admin upload route using the service-role key — so there is NO
-- anon/authenticated write policy here. Service role bypasses RLS for the upload.

insert into storage.buckets (id, name, public)
values ('blog', 'blog', true)
on conflict (id) do nothing;

drop policy if exists "public_blog_images_read" on storage.objects;
create policy "public_blog_images_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'blog');
