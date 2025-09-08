-- link_previewsテーブルとRLSポリシー作成
-- メタデータ抽出システム用

-- プレビューステータス ENUM型
CREATE TYPE preview_status AS ENUM ('success', 'partial', 'failed');

-- プレビューソース ENUM型
CREATE TYPE preview_source AS ENUM ('node', 'external', 'fallback');

-- link_previewsテーブル作成
CREATE TABLE link_previews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT,
  description TEXT,
  image TEXT,
  favicon TEXT,
  site_name TEXT,
  status preview_status NOT NULL DEFAULT 'partial',
  source preview_source NOT NULL DEFAULT 'node',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revalidate_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX idx_link_previews_url ON link_previews(url);
CREATE INDEX idx_link_previews_revalidate_at ON link_previews(revalidate_at);
CREATE INDEX idx_link_previews_status ON link_previews(status);
CREATE INDEX idx_link_previews_fetched_at ON link_previews(fetched_at);

-- updated_at自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_link_previews_updated_at 
  BEFORE UPDATE ON link_previews 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLSポリシー設定
ALTER TABLE link_previews ENABLE ROW LEVEL SECURITY;

-- すべてのユーザーが読み取り可能（キャッシュ共有）
CREATE POLICY "link_previews_select_policy" ON link_previews
  FOR SELECT USING (true);

-- 認証済みユーザーのみ作成・更新可能
CREATE POLICY "link_previews_insert_policy" ON link_previews
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "link_previews_update_policy" ON link_previews
  FOR UPDATE USING (auth.role() = 'authenticated');

-- 管理者のみ削除可能
CREATE POLICY "link_previews_delete_policy" ON link_previews
  FOR DELETE USING (auth.jwt() ->> 'role' = 'service_role');

-- コメント追加
COMMENT ON TABLE link_previews IS 'URLのメタデータプレビューキャッシュテーブル';
COMMENT ON COLUMN link_previews.url IS '正規化されたURL（ユニークキー）';
COMMENT ON COLUMN link_previews.status IS '抽出ステータス: success（完全）、partial（部分的）、failed（失敗）';
COMMENT ON COLUMN link_previews.source IS '抽出ソース: node（内部）、external（外部API）、fallback（フォールバック）';
COMMENT ON COLUMN link_previews.revalidate_at IS '再検証実行日時（TTL管理用）';
COMMENT ON COLUMN link_previews.retry_count IS '失敗リトライ回数（指数バックオフ用）';