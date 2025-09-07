# Encore - データベース設計

## システム構成図

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Chrome拡張    │    │   モバイルWeb   │    │   デスクトップ  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
            │                      │                      │
            └──────────────────────┼──────────────────────┘
                                   │
                    ┌─────────────────────────┐
                    │    Next.js Frontend     │
                    │   (Vercel hosting)      │
                    └─────────────────────────┘
                                   │
                    ┌─────────────────────────┐
                    │   Next.js API Routes    │
                    │  (Server Components)    │
                    └─────────────────────────┘
                                   │
            ┌──────────────────────┼──────────────────────┐
            │                      │                      │
    ┌───────────────┐    ┌─────────────────┐    ┌─────────────────┐
    │  Supabase Auth  │    │ Supabase DB     │    │ Supabase Storage│
    │ (Google OAuth)  │    │ (PostgreSQL+RLS)│    │  (画像・動画)   │
    └───────────────┘    └─────────────────┘    └─────────────────┘
                                   │
                         ┌─────────────────┐
                         │  External APIs  │
                         │ - Supabase Auth │
                         │ - Microlink API*│
                         │   (Fallback)    │
                         │ - Twitter API*  │
                         │   (Optional)    │
                         └─────────────────┘
```

## データベース設計（Supabase/PostgreSQL）

### テーブル設計

#### 0. allowed_emails（ホワイトリスト）
```sql
-- ホワイトリストテーブル（シンプル設計）
-- citextで大文字小文字を自動無視
create extension if not exists citext;

create table if not exists public.allowed_emails (
  email citext primary key
);

-- 初期ホワイトリストの設定例
insert into public.allowed_emails (email) values 
  ('your-email@gmail.com'),
  ('another-email@gmail.com')
on conflict (email) do nothing;
```

#### 1. users（ユーザー - Supabase Auth自動管理）
```sql
-- Supabase Authが自動で管理するauth.usersテーブルを利用
-- 追加のユーザー情報が必要な場合は以下のように拡張
CREATE TABLE public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- RLS有効化
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のプロフィールのみアクセス可能
CREATE POLICY "Users can manage own profile" ON public.user_profiles
  FOR ALL USING (auth.uid() = id);
```

#### 2. bookmarks（ブックマーク）
```sql
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
```

#### 3. tags（タグ）
```sql
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text default '#6366f1',
  parent_tag_id uuid references tags(id), -- 階層構造（親タグへの参照）
  display_order integer default 0, -- 同じ階層での並び順制御
  created_at timestamptz default now(),
  unique(user_id, name)
);

alter table public.tags enable row level security;

-- ホワイトリスト＆本人のみタグ管理可能
create policy "manage_own_tags_if_allowed" on public.tags
for all using (
  user_id = auth.uid()
  and exists (select 1 from public.allowed_emails ae
              where ae.email = (auth.jwt()->>'email'))
);
```

#### 4. bookmark_tags（ブックマークタグ関連）
```sql
create table if not exists public.bookmark_tags (
  id uuid primary key default gen_random_uuid(),
  bookmark_id uuid not null references public.bookmarks(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz default now(),
  unique(bookmark_id, tag_id)
);

alter table public.bookmark_tags enable row level security;

-- ブックマーク所有者かつホワイトリストユーザーのみタグ操作可能
create policy "manage_bookmark_tags_if_allowed" on public.bookmark_tags
for all using (
  exists (
    select 1 from public.bookmarks b
    where b.id = bookmark_tags.bookmark_id 
    and b.user_id = auth.uid()
    and exists (select 1 from public.allowed_emails ae
                where ae.email = (auth.jwt()->>'email'))
  )
);
```

#### 5. link_previews（リンクプレビューキャッシュ）
```sql
CREATE TABLE link_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text UNIQUE NOT NULL, -- 正規化済みURL
  title text,
  description text,
  image text, -- 絶対URL
  favicon text, -- 絶対URL
  site_name text,
  source text NOT NULL, -- 'edge', 'node', 'readability', 'external'
  status text DEFAULT 'success', -- 'success', 'failed', 'partial'
  fetched_at timestamp with time zone DEFAULT now(),
  revalidate_at timestamp with time zone DEFAULT (now() + interval '7 days'),
  retry_count integer DEFAULT 0,
  error_message text
);

-- URL正規化とキャッシュ用インデックス
CREATE INDEX idx_link_previews_url ON link_previews(url);
CREATE INDEX idx_link_previews_revalidate ON link_previews(revalidate_at) WHERE status = 'success';
CREATE INDEX idx_link_previews_retry ON link_previews(fetched_at, retry_count) WHERE status = 'failed';
```

#### 6. bookmark_metadata（追加メタデータ）
```sql
CREATE TABLE bookmark_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bookmark_id uuid REFERENCES bookmarks(id) ON DELETE CASCADE,
  metadata_type text NOT NULL, -- 'twitter', 'youtube', 'article' など
  metadata_json jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(bookmark_id, metadata_type)
);

-- Twitter特有のメタデータ例（将来のAPI連携時）
-- metadata_json構造:
-- {
--   "tweet_id": "1234567890",
--   "author": {
--     "username": "example",
--     "display_name": "Example User",
--     "avatar_url": "https://..."
--   },
--   "stats": {
--     "likes": 100,
--     "retweets": 50
--   },
--   "media_urls": ["https://..."]
-- }
```

### インデックス設計
```sql
-- パフォーマンス最適化用インデックス
CREATE INDEX idx_bookmarks_user_created_at ON bookmarks(user_id, created_at DESC);
CREATE INDEX idx_bookmarks_user_favorite ON bookmarks(user_id, is_favorite);
CREATE INDEX idx_bookmarks_user_pinned ON bookmarks(user_id, is_pinned);
CREATE INDEX idx_bookmarks_url ON bookmarks(url);

-- URL重複防止用ユニークインデックス
CREATE UNIQUE INDEX uniq_bookmarks_user_canonical 
  ON bookmarks (user_id, canonical_url);
CREATE INDEX idx_tags_user_id ON tags(user_id);
CREATE INDEX idx_tags_parent_order ON tags(user_id, parent_tag_id, display_order); -- 階層表示用
CREATE INDEX idx_bookmark_tags_bookmark_id ON bookmark_tags(bookmark_id);
CREATE INDEX idx_bookmark_tags_tag_id ON bookmark_tags(tag_id);
CREATE INDEX idx_bookmark_metadata_bookmark_id ON bookmark_metadata(bookmark_id);
CREATE INDEX idx_bookmark_metadata_type ON bookmark_metadata(metadata_type);

-- 日本語対応全文検索用インデックス（Trigram）
-- 日本語の検索体験向上のためTrigramベースのインデックスを採用
create extension if not exists pg_trgm;

-- 各フィールド別のTrigramインデックス
create index idx_bookmarks_title_trgm on bookmarks using gin (title gin_trgm_ops);
create index idx_bookmarks_desc_trgm on bookmarks using gin (description gin_trgm_ops);
create index idx_bookmarks_memo_trgm on bookmarks using gin (memo gin_trgm_ops);

-- 従来のenglish辞書ベースインデックス（英語コンテンツ用として残す）
CREATE INDEX idx_bookmarks_search_en ON bookmarks USING gin(
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(memo, ''))
);

-- 日本語＋英語対応のsimple辞書ベースインデックス（Trigramで不足な場合の補完用）
CREATE INDEX idx_bookmarks_search_simple ON bookmarks USING gin(
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(memo, ''))
);
```

### 日本語検索用ストアドファンクション
```sql
-- Trigramを使用した日本語対応検索関数
create or replace function search_bookmarks_trigram(
  search_term text,
  min_similarity float default 0.1
)
returns table (
  id uuid,
  user_id uuid,
  url text,
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
```