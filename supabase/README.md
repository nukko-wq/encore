# Supabase Database Setup

このディレクトリには、EncoreアプリケーションのSupabaseデータベースセットアップ用のファイルが含まれています。

## ファイル構成

```
supabase/
├── migrations/           # データベースマイグレーションファイル
│   ├── 001_create_allowed_emails.sql
│   └── 002_create_bookmarks.sql
├── seed/                # 初期データファイル
│   └── 001_initial_allowed_emails.sql
└── README.md
```

## セットアップ手順

### 1. Supabaseプロジェクトでの実行

以下のSQLを順番にSupabaseのSQL Editorで実行してください：

1. **migrations/001_create_allowed_emails.sql** - ホワイトリストテーブル作成
2. **migrations/002_create_bookmarks.sql** - ブックマークテーブル作成
3. **seed/001_initial_allowed_emails.sql** - 初期データ投入

### 2. ホワイトリスト設定

実運用前に、`seed/001_initial_allowed_emails.sql`ファイルを編集して、実際に許可するメールアドレスを設定してください。

```sql
-- 実際のメールアドレスに変更
insert into public.allowed_emails (email) values 
  ('your-email@gmail.com'),
  ('another-email@gmail.com')
on conflict (email) do nothing;
```

### 3. 環境変数設定

`.env.local`ファイルに以下の環境変数が設定されていることを確認してください：

```bash
# Supabase設定
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# サイトURL（OAuth認証のリダイレクト用）
NEXT_PUBLIC_SITE_URL=http://localhost:3000  # 開発環境
# NEXT_PUBLIC_SITE_URL=https://your-domain.com  # 本番環境
```

## データベーススキーマ

### allowed_emails
- **email** (citext, PRIMARY KEY): 許可されたメールアドレス

### bookmarks
- **id** (uuid, PRIMARY KEY): ブックマークID
- **user_id** (uuid, FOREIGN KEY): ユーザーID
- **url** (text): 元のURL
- **canonical_url** (text): 正規化URL（重複防止用）
- **title** (text): ページタイトル
- **description** (text): ページ説明
- **thumbnail_url** (text): サムネイル画像URL
- **memo** (text): ユーザーメモ
- **is_favorite** (boolean): お気に入りフラグ
- **is_pinned** (boolean): ピン留めフラグ
- **status** (text): 読み取り状態（'unread'/'read'）
- **pinned_at** (timestamptz): ピン留め日時
- **created_at** (timestamptz): 作成日時
- **updated_at** (timestamptz): 更新日時

## Row Level Security (RLS) ポリシー

### allowed_emails
- 認証されたユーザーのみ読み取り可能

### bookmarks
- ホワイトリストに含まれるユーザーのみ、自分のブックマークにアクセス可能
- 読み取り、書き込み、更新、削除すべてにホワイトリストチェックが適用

## 注意事項

1. **ホワイトリスト設定**: 必ず実際のメールアドレスを設定してからデプロイしてください
2. **RLS有効化**: すべてのテーブルでRow Level Securityが有効になっています
3. **バックアップ**: 本番環境では定期的なバックアップを設定してください