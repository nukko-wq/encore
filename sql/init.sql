-- Encore - 初期データベース設定
-- Phase 1: 認証とブックマーク基盤

-- citext拡張を有効化（大文字小文字を自動無視）
create extension if not exists citext;

-- Trigram拡張を有効化（日本語検索用）
create extension if not exists pg_trgm;

-- ============================================================================
-- 0. allowed_emails（ホワイトリスト）
-- ============================================================================
create table if not exists public.allowed_emails (
  email citext primary key
);

-- 初期ホワイトリスト設定（実際のメールアドレスに変更してください）
insert into public.allowed_emails (email) values 
  ('example@gmail.com'),
  ('example2@gmail.com')
on conflict (email) do nothing;

-- ============================================================================
-- 1. user_profiles（ユーザープロフィール）
-- ============================================================================
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- RLS有効化
alter table public.user_profiles enable row level security;

-- ユーザーは自分のプロフィールのみアクセス可能
create policy "Users can manage own profile" on public.user_profiles
  for all using (auth.uid() = id);

-- ============================================================================
-- 2. bookmarks（ブックマーク）
-- ============================================================================
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
              where ae.email = (auth.jwt()->>'email'))
);

-- ホワイトリスト＆本人のみ書き込み可能
create policy "write_own_if_allowed" on public.bookmarks
for insert with check (
  user_id = auth.uid()
  and exists (select 1 from public.allowed_emails ae
              where ae.email = (auth.jwt()->>'email'))
);

-- 更新・削除ポリシー
create policy "update_own_if_allowed" on public.bookmarks
for update using (
  user_id = auth.uid()
  and exists (select 1 from public.allowed_emails ae
              where ae.email = (auth.jwt()->>'email'))
);

create policy "delete_own_if_allowed" on public.bookmarks
for delete using (
  user_id = auth.uid()
  and exists (select 1 from public.allowed_emails ae
              where ae.email = (auth.jwt()->>'email'))
);

-- ============================================================================
-- インデックス設計
-- ============================================================================

-- パフォーマンス最適化用インデックス
create index if not exists idx_bookmarks_user_created_at on bookmarks(user_id, created_at desc);
create index if not exists idx_bookmarks_user_favorite on bookmarks(user_id, is_favorite);
create index if not exists idx_bookmarks_user_pinned on bookmarks(user_id, is_pinned);
create index if not exists idx_bookmarks_url on bookmarks(url);

-- URL重複防止用ユニークインデックス
create unique index if not exists uniq_bookmarks_user_canonical 
  on bookmarks (user_id, canonical_url);

-- 日本語対応全文検索用インデックス（Trigram）
create index if not exists idx_bookmarks_title_trgm on bookmarks using gin (title gin_trgm_ops);
create index if not exists idx_bookmarks_desc_trgm on bookmarks using gin (description gin_trgm_ops);
create index if not exists idx_bookmarks_memo_trgm on bookmarks using gin (memo gin_trgm_ops);

-- ============================================================================
-- 日本語検索用ストアドファンクション
-- ============================================================================
create or replace function search_bookmarks_trigram(
  search_term text,
  min_similarity float default 0.1
)
returns table (
  id uuid,
  user_id uuid,
  url text,
  canonical_url text,
  title text,
  description text,
  thumbnail_url text,
  memo text,
  is_favorite boolean,
  is_pinned boolean,
  status text,
  pinned_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  similarity_score float
)
language sql
as $$
  select 
    b.*,
    greatest(
      similarity(coalesce(b.title, ''), search_term),
      similarity(coalesce(b.description, ''), search_term),
      similarity(coalesce(b.memo, ''), search_term)
    ) as similarity_score
  from bookmarks b
  where (
    b.title % search_term or 
    b.description % search_term or 
    b.memo % search_term
  )
  and greatest(
    similarity(coalesce(b.title, ''), search_term),
    similarity(coalesce(b.description, ''), search_term),
    similarity(coalesce(b.memo, ''), search_term)
  ) >= min_similarity
  order by similarity_score desc, b.created_at desc;
$$;