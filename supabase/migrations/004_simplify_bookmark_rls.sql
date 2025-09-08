-- ブックマークRLSポリシー簡素化
-- ホワイトリストチェックを削除し、認証済みユーザーのuser_idベースのみに

-- 既存ポリシーを削除
DROP POLICY IF EXISTS "read_own_if_allowed" ON public.bookmarks;
DROP POLICY IF EXISTS "write_own_if_allowed" ON public.bookmarks;
DROP POLICY IF EXISTS "update_own_if_allowed" ON public.bookmarks;
DROP POLICY IF EXISTS "delete_own_if_allowed" ON public.bookmarks;

-- シンプルなRLSポリシーを作成（認証済みユーザーの自分のデータのみ）
CREATE POLICY "bookmarks_select_own" ON public.bookmarks
  FOR SELECT USING (
    auth.uid() = user_id
  );

CREATE POLICY "bookmarks_insert_own" ON public.bookmarks
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
  );

CREATE POLICY "bookmarks_update_own" ON public.bookmarks
  FOR UPDATE USING (
    auth.uid() = user_id
  );

CREATE POLICY "bookmarks_delete_own" ON public.bookmarks
  FOR DELETE USING (
    auth.uid() = user_id
  );

-- コメント更新
COMMENT ON TABLE public.bookmarks IS 'ユーザーのブックマークテーブル（認証済みユーザーのuser_idベースRLS）';