-- ホワイトリストテーブル（シンプル設計）
-- citextで大文字小文字を自動無視
create extension if not exists citext;

-- ホワイトリストテーブル作成
create table if not exists public.allowed_emails (
  email citext primary key
);

-- RLS有効化
alter table public.allowed_emails enable row level security;

-- ホワイトリスト管理用のポリシー（認証されたユーザーのみ読み取り可能）
-- 実際の運用では管理者のみがホワイトリストを管理するため、読み取りのみ許可
create policy "authenticated_users_can_read_allowed_emails" on public.allowed_emails
  for select using (auth.role() = 'authenticated');

-- 管理者のみがホワイトリストを変更可能にする場合のポリシー（コメントアウト）
-- create policy "admin_can_manage_allowed_emails" on public.allowed_emails
--   for all using (
--     auth.jwt() ->> 'email' in ('admin@yourdomain.com')
--   );

-- インデックス作成（検索の高速化）
create index if not exists idx_allowed_emails_email on public.allowed_emails(email);