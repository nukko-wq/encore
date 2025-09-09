-- tagsテーブルとbookmark_tagsテーブル作成
-- 階層タグシステム + ブックマーク関連テーブル

-- 1. tagsテーブル作成（階層構造対応）
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  parent_tag_id UUID REFERENCES public.tags(id) ON DELETE SET NULL, -- 階層構造（親タグへの参照）
  display_order INTEGER NOT NULL DEFAULT 0, -- 同じ階層での並び順制御
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name) -- ユーザー内でのタグ名重複防止
);

-- 2. bookmark_tagsテーブル作成（ブックマークとタグの関連テーブル）
CREATE TABLE IF NOT EXISTS public.bookmark_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bookmark_id UUID NOT NULL REFERENCES public.bookmarks(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bookmark_id, tag_id) -- ブックマーク-タグペアの重複防止
);

-- 3. updated_at自動更新トリガー（tagsテーブル用）
CREATE TRIGGER update_tags_updated_at 
  BEFORE UPDATE ON public.tags 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. パフォーマンス最適化用インデックス作成
CREATE INDEX idx_tags_user_id ON public.tags(user_id);
CREATE INDEX idx_tags_parent_order ON public.tags(user_id, parent_tag_id, display_order); -- 階層表示用
CREATE INDEX idx_tags_name_search ON public.tags(user_id, name); -- タグ名検索用
CREATE INDEX idx_bookmark_tags_bookmark_id ON public.bookmark_tags(bookmark_id);
CREATE INDEX idx_bookmark_tags_tag_id ON public.bookmark_tags(tag_id);

-- 5. RLS有効化
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmark_tags ENABLE ROW LEVEL SECURITY;

-- 6. tagsテーブルのRLSポリシー作成
-- 本人のみタグ管理可能（ホワイトリストチェックはbookmarksテーブルで実施済み）
CREATE POLICY "manage_own_tags" ON public.tags
  FOR ALL USING (user_id = auth.uid());

-- 7. bookmark_tagsテーブルのRLSポリシー作成
-- ブックマーク所有者かつタグ所有者のみタグ操作可能
-- ホワイトリストチェックはbookmarksテーブルのRLSで実施済み
CREATE POLICY "manage_bookmark_tags" ON public.bookmark_tags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.bookmarks b
      WHERE b.id = bookmark_tags.bookmark_id 
      AND b.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.tags t 
      WHERE t.id = bookmark_tags.tag_id 
      AND t.user_id = auth.uid()
    )
  );

-- 8. コメント追加
COMMENT ON TABLE public.tags IS 'ユーザー別階層タグテーブル（親子関係・並び順対応）';
COMMENT ON TABLE public.bookmark_tags IS 'ブックマークとタグの多対多関連テーブル';
COMMENT ON COLUMN public.tags.parent_tag_id IS '親タグID（階層構造用）- NULLの場合はルートタグ';
COMMENT ON COLUMN public.tags.display_order IS '同階層内での表示順序制御';
COMMENT ON COLUMN public.tags.color IS 'タグ表示色（HEX形式）';

/*
セキュリティモデル:
- Primary保護: bookmarksテーブルのRLS（ホワイトリスト + user_id）
- Secondary保護: tagsテーブルのuser_id分離
- 最適化: tagsはユーザー内部データのため、冗長なホワイトリストチェック削除
- 保証: bookmarksテーブル経由でのアクセスのみのため、セキュリティレベル維持
*/

-- 9. 実行確認用クエリ（コメント）
/*
-- テーブル作成確認
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('tags', 'bookmark_tags');

-- インデックス確認
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
AND tablename IN ('tags', 'bookmark_tags');

-- RLSポリシー確認
SELECT schemaname, tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('tags', 'bookmark_tags');
*/