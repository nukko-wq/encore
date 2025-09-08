-- ブックマークステータスのENUM型改善
-- TEXT + CHECKからENUMへの移行でパフォーマンスとデータ整合性を向上

-- ENUM型を定義（既存チェック付き）
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bookmark_status') THEN
    CREATE TYPE bookmark_status AS ENUM (
      'unread',     -- 未読
      'read',       -- 既読
      'archived',   -- アーカイブ
      'deleted'     -- 論理削除
    );
  END IF;
END $$;

-- statusカラムの型をチェックして必要な場合のみ移行処理を実行
DO $$
DECLARE
  status_column_type text;
BEGIN
  -- 現在のstatusカラムの型を取得
  SELECT data_type INTO status_column_type
  FROM information_schema.columns 
  WHERE table_name = 'bookmarks' 
    AND column_name = 'status' 
    AND table_schema = 'public';
  
  -- TEXT型の場合のみ移行処理を実行
  IF status_column_type = 'text' THEN
    -- 新しいENUM型のカラムを追加
    ALTER TABLE public.bookmarks ADD COLUMN new_status bookmark_status DEFAULT 'unread';
    
    -- 既存データを新しいENUM型に移行
    UPDATE public.bookmarks 
    SET new_status = CASE 
      WHEN status = 'unread' THEN 'unread'::bookmark_status
      WHEN status = 'read' THEN 'read'::bookmark_status
      ELSE 'unread'::bookmark_status  -- デフォルトフォールバック
    END;
    
    -- 古いstatusカラムを削除
    ALTER TABLE public.bookmarks DROP COLUMN status;
    
    -- 新しいカラムをstatusにリネーム
    ALTER TABLE public.bookmarks RENAME COLUMN new_status TO status;
    
    -- NOT NULL制約を追加（データ整合性強化）
    ALTER TABLE public.bookmarks ALTER COLUMN status SET NOT NULL;
    
    RAISE NOTICE 'bookmarksテーブルのstatusカラムをTEXT型からENUM型に移行しました';
  ELSE
    RAISE NOTICE 'bookmarksテーブルのstatusカラムは既にENUM型です。移行をスキップします。';
  END IF;
END $$;

-- インデックスを再作成（パフォーマンス向上・重複チェック付き）
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_status_created_enum ON bookmarks(user_id, status, created_at DESC);

-- 検索用の複合インデックス追加（重複チェック付き）
CREATE INDEX IF NOT EXISTS idx_bookmarks_status_favorite ON bookmarks(status, is_favorite) WHERE status != 'deleted';
CREATE INDEX IF NOT EXISTS idx_bookmarks_status_pinned ON bookmarks(status, is_pinned) WHERE status != 'deleted' AND is_pinned = true;

-- コメント追加（ドキュメント化）
COMMENT ON TYPE bookmark_status IS 'ブックマークの状態を表すENUM型';
COMMENT ON COLUMN bookmarks.status IS 'ブックマークの読み取り状態（ENUM型でパフォーマンス最適化）';