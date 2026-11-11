-- 내서랍 v2: 자료별 증분 저장 + 이미지 전용 비공개 Storage
-- 기존 archive_state 테이블과 데이터는 삭제하지 않습니다.

create table if not exists public.archive_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.archive_items enable row level security;

grant select, insert, update, delete on public.archive_items to authenticated;

drop policy if exists "archive_items_select_own" on public.archive_items;
drop policy if exists "archive_items_insert_own" on public.archive_items;
drop policy if exists "archive_items_update_own" on public.archive_items;
drop policy if exists "archive_items_delete_own" on public.archive_items;

create policy "archive_items_select_own"
on public.archive_items
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "archive_items_insert_own"
on public.archive_items
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "archive_items_update_own"
on public.archive_items
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "archive_items_delete_own"
on public.archive_items
for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'archive-media',
  'archive-media',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "archive_media_select_own" on storage.objects;
drop policy if exists "archive_media_insert_own" on storage.objects;
drop policy if exists "archive_media_update_own" on storage.objects;
drop policy if exists "archive_media_delete_own" on storage.objects;

create policy "archive_media_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'archive-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "archive_media_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'archive-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "archive_media_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'archive-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'archive-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "archive_media_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'archive-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
