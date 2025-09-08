-- 初期ホワイトリストの設定
-- 実際の運用では、以下のメールアドレスを実際のものに変更してください

-- 開発・テスト用のダミーメールアドレス（実際には使用しません）
insert into public.allowed_emails (email) values 
  ('admin@example.com'),
  ('test@example.com')
on conflict (email) do nothing;

-- 実運用で使用する場合は、上記を削除して以下のような形式で実際のメールアドレスを追加
-- insert into public.allowed_emails (email) values 
--   ('your-actual-email@gmail.com'),
--   ('another-allowed-email@gmail.com')
-- on conflict (email) do nothing;