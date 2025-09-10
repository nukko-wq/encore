-- Supabase Realtimeを有効化するマイグレーション
-- bookmarksテーブルのRealtime変更イベントを有効にする

-- bookmarksテーブルをrealtimeパブリケーションに追加
alter publication supabase_realtime add table bookmarks;

-- tagsテーブルもRealtimeを有効化（将来のタグ機能用）
alter publication supabase_realtime add table tags;

-- bookmark_tagsテーブルもRealtimeを有効化（タグ関連の変更を追跡）
alter publication supabase_realtime add table bookmark_tags;