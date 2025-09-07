-- ブックマークテーブル作成
create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  url text not null,
  canonical_url text not null, -- 正規化済みURL（重複防止用）
  title text,
  description text,
  thumbnail_url text,
  memo text,
  is_favorite boolean default false,
  is_pinned boolean default false,
  status text check (status in ('unread','read')) default 'unread',
  pinned_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS有効化
alter table public.bookmarks enable row level security;

-- ホワイトリスト＆本人のみ読み取り可能
create policy "read_own_if_allowed" on public.bookmarks
for select using (
  user_id = auth.uid()
  and exists (select 1 from public.allowed_emails ae
              where ae.email = auth.email())
);

-- ホワイトリスト＆本人のみ書き込み可能
create policy "write_own_if_allowed" on public.bookmarks
for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.allowed_emails ae
              where ae.email = auth.email())
);

-- 更新ポリシー（ホワイトリスト＆本人のみ）
create policy "update_own_if_allowed" on public.bookmarks
for update using (
  user_id = auth.uid()
  and exists (select 1 from public.allowed_emails ae
              where ae.email = auth.email())
);

-- 削除ポリシー（ホワイトリスト＆本人のみ）
create policy "delete_own_if_allowed" on public.bookmarks
for delete using (
  user_id = auth.uid()
  and exists (select 1 from public.allowed_emails ae
              where ae.email = auth.email())
);

-- パフォーマンス最適化用インデックス
create index if not exists idx_bookmarks_user_created_at on bookmarks(user_id, created_at desc);
create index if not exists idx_bookmarks_user_favorite on bookmarks(user_id, is_favorite);
create index if not exists idx_bookmarks_user_pinned on bookmarks(user_id, is_pinned);
create index if not exists idx_bookmarks_url on bookmarks(url);

-- URL重複防止用ユニークインデックス
create unique index if not exists uniq_bookmarks_user_canonical 
  on bookmarks (user_id, canonical_url);

-- updated_at自動更新のためのトリガー関数
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- updated_atトリガー作成
create trigger update_bookmarks_updated_at 
  before update on bookmarks
  for each row execute function update_updated_at_column();