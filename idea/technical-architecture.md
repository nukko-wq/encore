# Encore - 技術アーキテクチャ

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
create table if not exists public.allowed_emails (
  email text primary key
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
  parent_tag_id uuid references tags(id),
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

## API設計（Next.js API Routes）

### REST API エンドポイント

#### ブックマーク管理
```typescript
// GET /api/bookmarks - ブックマーク一覧取得
// POST /api/bookmarks - ブックマーク作成
// PUT /api/bookmarks/[id] - ブックマーク更新
// DELETE /api/bookmarks/[id] - ブックマーク削除
// GET /api/bookmarks/[id] - ブックマーク詳細

// POST /api/bookmarks/bulk - 一括作成
// PUT /api/bookmarks/[id]/favorite - お気に入り切り替え
// PUT /api/bookmarks/[id]/pin - ピン留め切り替え
// PUT /api/bookmarks/[id]/read - 既読切り替え
```

#### タグ管理
```typescript
// GET /api/tags - タグ一覧取得
// POST /api/tags - タグ作成
// PUT /api/tags/[id] - タグ更新
// DELETE /api/tags/[id] - タグ削除
```

#### 検索・フィルタ
```typescript
// GET /api/search?q=keyword&tags=tag1,tag2&filter=favorites
// 日本語検索に対応したTrigramベース検索を実装

// GET /api/bookmarks/feed?page=1&limit=20&sort=created_at&order=desc
// 検索クエリ例：
// SELECT * FROM bookmarks 
// WHERE (title % 'search_term' OR description % 'search_term' OR memo % 'search_term')
// ORDER BY similarity(title || ' ' || description || ' ' || memo, 'search_term') DESC;
```

#### メタデータ取得API（三段構え）
```typescript
// GET /api/extract（runtime: "edge"）- 超軽量Edge抽出
//   HTMLRewriterで<meta>/<title>だけ抽出
//   速度最優先、依存関係なし
//   タイトル/画像/抜粋のどれかが欠けたら次へ

// POST /api/extract/deep（runtime: "nodejs"）- Node精度重視
//   metascraperで統合取得
//   description無し時はReadability+jsdomで本文抜粋
//   日本語は全角160-200文字程度に

// POST /api/extract/external - 外部APIフォールバック
//   JSレンダリング必須や難サイト用
//   Microlink/Iframely/OpenGraph.io等
//   環境変数でON/OFF（METADATA_FALLBACK_ENABLED=true）

// POST /api/twitter/enhance - Twitter URL 追加情報（オプション）
// POST /api/import/pocket - Pocket インポート
// GET /api/export - データエクスポート
```

### データベース・API層

#### Supabase Auth 設定
```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// 型安全なSupabaseクライアント
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)

// Google認証の実行
export const signInWithGoogle = async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })
  return { data, error }
}

// サインアウト
export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  return { error }
}

// 現在のユーザー取得
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}

// ホワイトリストチェック
export const checkWhitelistEmail = async (email: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('allowed_emails')
      .select('email')
      .eq('email', email.toLowerCase())
      .single()
    
    return !!data && !error
  } catch (error) {
    console.error('Whitelist check error:', error)
    return false
  }
}

// 型安全性のためのDB型定義
// types/database.ts
export interface Database {
  public: {
    Tables: {
      allowed_emails: {
        Row: { email: string }
        Insert: { email: string }
        Update: { email?: string }
      }
      bookmarks: {
        Row: BookmarkRow & { canonical_url: string }
        Insert: BookmarkInsert & { canonical_url: string }
        Update: BookmarkUpdate & { canonical_url?: string }
      }
      tags: {
        Row: TagRow
        Insert: TagInsert
        Update: TagUpdate
      }
      // ... 他のテーブル
    }
  }
}
```

#### データアクセスレイヤー（Supabase RLS活用）
```typescript
// lib/services/bookmarks.ts
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type BookmarkRow = Database['public']['Tables']['bookmarks']['Row']
type BookmarkInsert = Database['public']['Tables']['bookmarks']['Insert']

export class BookmarkService {
  // RLSポリシーにより自動でユーザーのデータのみ取得
  async getBookmarks(filters?: BookmarkFilters): Promise<BookmarkRow[]> {
    let query = supabase
      .from('bookmarks')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    
    if (filters?.is_favorite) {
      query = query.eq('is_favorite', filters.is_favorite)
    }
    
    const { data, error } = await query
    
    if (error) {
      throw new Error(`Failed to fetch bookmarks: ${error.message}`)
    }
    
    return data || []
  }
  
  // 日本語対応全文検索（Trigramベース）
  async searchBookmarks(searchTerm: string, filters?: BookmarkFilters): Promise<BookmarkRow[]> {
    if (!searchTerm.trim()) {
      return this.getBookmarks(filters)
    }
    
    // Trigramを使用した日本語検索
    let query = supabase
      .rpc('search_bookmarks_trigram', {
        search_term: searchTerm.trim(),
        min_similarity: 0.1 // 類似度闾値
      })
    
    // フィルタ適用
    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    
    if (filters?.is_favorite) {
      query = query.eq('is_favorite', filters.is_favorite)
    }
    
    const { data, error } = await query
    
    if (error) {
      // Trigram検索失敗時はフォールバックでILIKE検索
      console.warn('Trigram search failed, falling back to ILIKE:', error)
      return this.searchBookmarksFallback(searchTerm, filters)
    }
    
    return data || []
  }
  
  // フォールバック検索（ILIKE使用）
  private async searchBookmarksFallback(searchTerm: string, filters?: BookmarkFilters): Promise<BookmarkRow[]> {
    const searchPattern = `%${searchTerm}%`
    
    let query = supabase
      .from('bookmarks')
      .select('*')
      .or(`title.ilike.${searchPattern},description.ilike.${searchPattern},memo.ilike.${searchPattern}`)
      .order('created_at', { ascending: false })
    
    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    
    if (filters?.is_favorite) {
      query = query.eq('is_favorite', filters.is_favorite)
    }
    
    const { data, error } = await query
    
    if (error) {
      throw new Error(`Failed to search bookmarks: ${error.message}`)
    }
    
    return data || []
  }
  
  // RLSポリシーにより自動でホワイトリスト＆所有者チェック
  async createBookmark(data: { url: string; title?: string; description?: string }): Promise<BookmarkRow> {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      throw new Error('User not authenticated')
    }
    
    // 段階的メタデータ取得
    const metadata = await this.extractMetadataWithFallback(data.url)
    
    // Twitter URLの場合、自動タグ付け
    const isTwitterUrl = this.isTwitterUrl(data.url)
    
    const bookmarkData: BookmarkInsert = {
      user_id: user.id,
      url: data.url,
      canonical_url: this.normalizeUrl(data.url), // 正規化済みURL
      title: data.title || metadata.title || 'Untitled',
      description: data.description || metadata.description,
      thumbnail_url: metadata.image
    }
    
    // RLSポリシーでホワイトリスト＆所有者チェックが自動実行
    // canonical_urlのユニーク制約により重複は自動で防止される
    const { data: bookmark, error } = await supabase
      .from('bookmarks')
      .insert(bookmarkData)
      .select()
      .single()
    
    if (error) {
      // 重複URLの場合のエラーハンドリング
      if (error.code === '23505') { // unique_violation
        throw new Error('このURLは既に保存されています')
      }
      throw new Error(`Failed to create bookmark: ${error.message}`)
    }
    
    // Twitter URLの場合、自動タグ付け
    if (isTwitterUrl && bookmark) {
      await this.addAutomaticTag(bookmark.id, 'Twitter')
    }
    
    return bookmark
  }
  
  private async addAutomaticTag(bookmarkId: string, tagName: string) {
    // タグが存在しない場合は作成
    const { data: existingTag } = await supabase
      .from('tags')
      .select('id')
      .eq('name', tagName)
      .single()
    
    let tagId = existingTag?.id
    
    if (!tagId) {
      const { data: newTag, error } = await supabase
        .from('tags')
        .insert({ name: tagName })
        .select('id')
        .single()
      
      if (error) return // タグ作成失敗時は無視
      tagId = newTag.id
    }
    
    // ブックマークとタグの関連付け
    await supabase
      .from('bookmark_tags')
      .insert({ bookmark_id: bookmarkId, tag_id: tagId })
  }
  
  private async extractMetadataWithFallback(url: string): Promise<LinkPreview> {
    const normalizedUrl = this.normalizeUrl(url)
    
    // キャッシュチェック
    const cached = await this.getCachedPreview(normalizedUrl)
    if (cached && !this.shouldRevalidate(cached)) {
      return cached
    }
    
    // Phase 1: Edge超軽量抽出
    let metadata = await this.extractWithEdge(normalizedUrl)
    let source = 'edge'
    
    // Phase 2: Node精度重視（Edgeで不十分な場合）
    if (this.isIncomplete(metadata)) {
      const nodeResult = await this.extractWithNode(normalizedUrl)
      metadata = this.mergeMetadata(metadata, nodeResult)
      source = 'node'
    }
    
    // Phase 3: 外部APIフォールバック（環境変数で制御）
    if (this.isIncomplete(metadata) && process.env.METADATA_FALLBACK_ENABLED === 'true') {
      const externalResult = await this.extractWithExternalAPI(normalizedUrl)
      metadata = this.mergeMetadata(metadata, externalResult)
      source = 'external'
    }
    
    // 特定サイト専用処理
    const handler = this.getSiteHandler(normalizedUrl)
    if (handler) {
      metadata = await handler(normalizedUrl, metadata)
      source = metadata.source || source
    }
    
    // キャッシュ保存
    const preview = await this.savePreviewCache(normalizedUrl, metadata, source)
    
    return preview
  }
  
  private async extractWithEdge(url: string): Promise<Partial<LinkPreview>> {
    // HTMLRewriterで<meta>/<title>だけ抽出
    // 優先度: og:title→twitter:title→<title>
    // 優先度: og:description→twitter:description→meta[name=description]
    // 優先度: og:image→twitter:image→apple-touch-icon→icon
    return { /* Edge抽出結果 */ }
  }
  
  private async extractWithNode(url: string): Promise<Partial<LinkPreview>> {
    // metascraperでtitle/description/imageを統合取得
    // description無し時はReadability+jsdomで本文抜粋
    return { /* Node抽出結果 */ }
  }
  
  private isIncomplete(metadata: Partial<LinkPreview>): boolean {
    // タイトル or 画像 or 抜粋のどれかが欠けているかチェック
    return !metadata.title || !metadata.image || !metadata.description
  }
  
  // URL正規化（重複防止用）
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url)
      
      // トラッキングパラメータ除去
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'fbclid', 'gclid', 'msclkid', '_ga', 'mc_eid'
      ]
      
      trackingParams.forEach(param => {
        urlObj.searchParams.delete(param)
      })
      
      // 末尾スラッシュ統一
      return urlObj.toString().replace(/\/$/, '')
    } catch (error) {
      // URL形式エラー時は元のURLを返す
      console.warn('URL normalization failed:', error)
      return url
    }
  }
  
  async updateBookmark(id: string, updates: Partial<BookmarkRow>): Promise<BookmarkRow> {
    // RLSポリシーにより自動で所有者チェック
    const { data, error } = await supabase
      .from('bookmarks')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      throw new Error(`Failed to update bookmark: ${error.message}`)
    }
    
    return data
  }
  
  async deleteBookmark(id: string): Promise<void> {
    // RLSポリシーにより自動で所有者チェック
    const { error } = await supabase
      .from('bookmarks')
      .delete()
      .eq('id', id)
    
    if (error) {
      throw new Error(`Failed to delete bookmark: ${error.message}`)
    }
  }
  
  private isTwitterUrl(url: string): boolean {
    return /^https?:\/\/(twitter\.com|x\.com)\/\w+\/status\/\d+/.test(url)
  }
  
  // オプション機能：Twitter API使用時の拡張情報取得
  async enhanceTwitterBookmark(bookmarkId: string, useApi = false) {
    if (!useApi) return null
    
    // Twitter API v2 呼び出し（制限内で）
    // 追加情報を bookmark_metadata テーブルに保存
  }
  
  // 重複チェック用メソッド（オプション機能）
  async checkDuplicate(url: string): Promise<BookmarkRow | null> {
    const canonicalUrl = this.normalizeUrl(url)
    
    const { data, error } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('canonical_url', canonicalUrl)
      .single()
    
    return data || null
  }
  
  // 重複時の処理オプション（仕様に応じて選択）
  async createBookmarkWithDuplicateHandling(
    data: { url: string; title?: string; description?: string },
    duplicateAction: 'reject' | 'update' | 'allow-different-url' = 'reject'
  ): Promise<BookmarkRow> {
    const canonicalUrl = this.normalizeUrl(data.url)
    
    // 重複チェック
    const existing = await this.checkDuplicate(data.url)
    
    if (existing) {
      switch (duplicateAction) {
        case 'reject':
          throw new Error('このURLは既に保存されています')
        case 'update':
          // 既存のブックマークを更新
          return this.updateBookmark(existing.id, {
            title: data.title || existing.title,
            description: data.description || existing.description,
            updated_at: new Date().toISOString()
          })
        case 'allow-different-url':
          // 元URLが異なる場合は保存を許可
          if (existing.url !== data.url) {
            break // 通常の保存処理へ
          } else {
            throw new Error('このURLは既に保存されています')
          }
      }
    }
    
    // 通常の保存処理
    return this.createBookmark(data)
  }
}
```

## フロントエンド アーキテクチャ

### フォルダ構成
```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── page.tsx
│   ├── dashboard/
│   │   ├── page.tsx
│   │   ├── loading.tsx
│   │   └── error.tsx
│   ├── bookmarks/
│   │   ├── [id]/
│   │   └── page.tsx
│   ├── api/
│   │   ├── extract/
│   │   │   ├── route.ts          -- Edge超軽量抽出
│   │   │   ├── deep/
│   │   │   │   └── route.ts      -- Node精度重視
│   │   │   └── external/
│   │   │       └── route.ts      -- 外部APIフォールバック
│   │   ├── cron/
│   │   │   └── revalidate/
│   │   │       └── route.ts      -- バックグラウンド再取得
│   │   ├── bookmarks/
│   │   ├── tags/
│   │   └── auth/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   └── modal.tsx
│   ├── bookmarks/
│   │   ├── bookmark-card.tsx
│   │   ├── bookmark-form.tsx
│   │   └── bookmark-list.tsx
│   ├── layout/
│   │   ├── header.tsx
│   │   ├── sidebar.tsx
│   │   └── mobile-nav.tsx
│   └── common/
├── lib/
│   ├── supabase.ts
│   ├── auth.ts
│   ├── utils.ts
│   └── services/
│       ├── bookmarks.ts
│       ├── tags.ts
│       └── metadata/
│           ├── edge-extractor.ts     -- Edge超軽量抽出
│           ├── node-extractor.ts     -- Node精度重視
│           ├── external-api.ts       -- 外部APIフォールバック
│           ├── site-handlers.ts      -- 特定サイト専用パーサー
│           ├── cache-manager.ts      -- キャッシュ管理
│           └── index.ts              -- 統合サービス
├── hooks/
│   ├── use-bookmarks.ts
│   ├── use-tags.ts
│   └── use-auth.ts
└── types/
    ├── database.ts
    ├── api.ts
    ├── link-preview.ts
    └── common.ts
```

### メタデータ抽出システム設計（三段構え）

#### APIルート構成
```typescript
// app/api/extract/route.ts - Edge超軽量抽出
export const runtime = 'edge'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  
  if (!url) return Response.json({ error: 'URL required' }, { status: 400 })
  
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'EncoreMetaBot/1.0' },
      signal: AbortSignal.timeout(5000)
    })
    
    const html = await response.text()
    
    // HTMLRewriterで軽量抽出
    const metadata = await extractWithHTMLRewriter(html, url)
    
    return Response.json({
      success: true,
      data: metadata,
      source: 'edge',
      complete: isComplete(metadata)
    })
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message,
      source: 'edge' 
    }, { status: 500 })
  }
}

// app/api/extract/deep/route.ts - Node精度重視
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const { url } = await request.json()
  
  try {
    // metascraperで統合取得
    const metadata = await extractWithMetascraper(url)
    
    // descriptionが無い時はReadabilityで本文抜粋
    if (!metadata.description) {
      metadata.description = await extractContentWithReadability(url)
    }
    
    return Response.json({
      success: true,
      data: metadata,
      source: 'node'
    })
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message,
      source: 'node' 
    }, { status: 500 })
  }
}

// app/api/extract/external/route.ts - 外部APIフォールバック
export async function POST(request: Request) {
  if (process.env.METADATA_FALLBACK_ENABLED !== 'true') {
    return Response.json({ error: 'External API disabled' }, { status: 403 })
  }
  
  const { url } = await request.json()
  
  try {
    const metadata = await extractWithExternalAPI(url)
    
    return Response.json({
      success: true,
      data: metadata,
      source: 'external'
    })
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message,
      source: 'external' 
    }, { status: 500 })
  }
}
```

#### 統合メタデータサービス
```typescript
// lib/services/metadata/index.ts
export class MetadataService {
  async extractMetadata(url: string): Promise<LinkPreview> {
    const normalizedUrl = this.normalizeUrl(url)
    
    // 1. キャッシュチェック
    const cached = await this.getCachedPreview(normalizedUrl)
    if (cached && !this.shouldRevalidate(cached)) {
      return cached
    }
    
    let metadata: Partial<LinkPreview> = {}
    let source = 'edge'
    
    // 2. Edge超軽量抽出
    try {
      const edgeResult = await this.callEdgeExtractor(normalizedUrl)
      metadata = edgeResult.data
      
      // 完全でない場合は次の段階へ
      if (!edgeResult.complete) {
        // 3. Node精度重視
        try {
          const nodeResult = await this.callNodeExtractor(normalizedUrl)
          metadata = { ...metadata, ...nodeResult.data }
          source = 'node'
        } catch (nodeError) {
          console.warn('Node extraction failed:', nodeError)
          
          // 4. 外部APIフォールバック
          if (process.env.METADATA_FALLBACK_ENABLED === 'true') {
            try {
              const externalResult = await this.callExternalExtractor(normalizedUrl)
              metadata = { ...metadata, ...externalResult.data }
              source = 'external'
            } catch (externalError) {
              console.warn('External API failed:', externalError)
            }
          }
        }
      }
    } catch (edgeError) {
      console.warn('Edge extraction failed:', edgeError)
      // Edgeで失敗した場合は直接Nodeへ
    }
    
    // 5. 特定サイト専用処理
    const handler = this.getSiteHandler(normalizedUrl)
    if (handler) {
      metadata = await handler(normalizedUrl, metadata)
    }
    
    // 6. キャッシュ保存と返却
    const preview = await this.savePreviewCache(normalizedUrl, metadata, source)
    return preview
  }
  
  private async callEdgeExtractor(url: string) {
    const response = await fetch(`/api/extract?url=${encodeURIComponent(url)}`)
    return await response.json()
  }
  
  private async callNodeExtractor(url: string) {
    const response = await fetch('/api/extract/deep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    })
    return await response.json()
  }
  
  private shouldRevalidate(cached: LinkPreview): boolean {
    return new Date() > new Date(cached.revalidate_at)
  }
  
  private normalizeUrl(url: string): string {
    // トラッキングパラメータ除去
    const urlObj = new URL(url)
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid']
    trackingParams.forEach(param => urlObj.searchParams.delete(param))
    
    // 末尾スラッシュ統一
    return urlObj.toString().replace(/\/$/, '')
  }
}
```

#### Edge抽出器（HTMLRewriter）
```typescript
// lib/extractors/edge.ts
class MetaExtractor {
  title = ''
  description = ''
  image = ''
  favicon = ''
  
  element(element: Element) {
    const property = element.getAttribute('property')
    const name = element.getAttribute('name')
    const content = element.getAttribute('content')
    
    if (!content) return
    
    // タイトルの優先度
    if (!this.title) {
      if (property === 'og:title' || name === 'twitter:title') {
        this.title = content
      }
    }
    
    // 説明の優先度
    if (!this.description) {
      if (property === 'og:description' || name === 'twitter:description' || name === 'description') {
        this.description = content
      }
    }
    
    // 画像の優先度
    if (!this.image) {
      if (property === 'og:image' || name === 'twitter:image') {
        this.image = new URL(content, this.baseUrl).href
      }
    }
  }
}

export async function extractWithHTMLRewriter(html: string, baseUrl: string) {
  const extractor = new MetaExtractor()
  
  const rewriter = new HTMLRewriter()
    .on('meta', extractor)
    .on('title', {
      text(text) {
        if (!extractor.title) {
          extractor.title = text.text
        }
      }
    })
    .on('link[rel="icon"], link[rel="apple-touch-icon"]', {
      element(element) {
        if (!extractor.favicon) {
          const href = element.getAttribute('href')
          if (href) {
            extractor.favicon = new URL(href, baseUrl).href
          }
        }
      }
    })
  
  await rewriter.transform(new Response(html)).text()
  
  return {
    title: extractor.title,
    description: extractor.description,
    image: extractor.image,
    favicon: extractor.favicon
  }
}
```

### 状態管理（Supabase Realtime対応）
```typescript
// hooks/use-bookmarks.ts - Supabase Realtimeと組み合わせた状態管理
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { BookmarkService } from '@/lib/services/bookmarks'
import type { BookmarkRow } from '@/types/database'

export function useBookmarks(filters?: BookmarkFilters) {
  const [bookmarks, setBookmarks] = useState<BookmarkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const bookmarkService = new BookmarkService()
  
  // 初回データ取得
  useEffect(() => {
    const fetchBookmarks = async () => {
      try {
        setLoading(true)
        const data = await bookmarkService.getBookmarks(filters)
        setBookmarks(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch bookmarks')
      } finally {
        setLoading(false)
      }
    }
    
    fetchBookmarks()
  }, [filters])
  
  // Supabase Realtimeでリアルタイム更新
  useEffect(() => {
    const channel = supabase
      .channel('bookmarks-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookmarks'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setBookmarks(prev => [payload.new as BookmarkRow, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setBookmarks(prev => prev.map(bookmark => 
              bookmark.id === payload.new.id ? payload.new as BookmarkRow : bookmark
            ))
          } else if (payload.eventType === 'DELETE') {
            setBookmarks(prev => prev.filter(bookmark => bookmark.id !== payload.old.id))
          }
        }
      )
      .subscribe()
    
    return () => {
      channel.unsubscribe()
    }
  }, [])
  
  const createBookmark = async (data: { url: string; title?: string; description?: string }) => {
    try {
      const bookmark = await bookmarkService.createBookmark(data)
      // Realtimeで自動更新されるので、手動更新は不要
      return bookmark
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create bookmark')
      throw err
    }
  }
  
  const updateBookmark = async (id: string, updates: Partial<BookmarkRow>) => {
    try {
      const bookmark = await bookmarkService.updateBookmark(id, updates)
      return bookmark
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update bookmark')
      throw err
    }
  }
  
  const deleteBookmark = async (id: string) => {
    try {
      await bookmarkService.deleteBookmark(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete bookmark')
      throw err
    }
  }
  
  return {
    bookmarks,
    loading,
    error,
    createBookmark,
    updateBookmark,
    deleteBookmark,
    refetch: () => {
      // 手動リフレッシュが必要な場合
      const fetchBookmarks = async () => {
        const data = await bookmarkService.getBookmarks(filters)
        setBookmarks(data)
      }
      fetchBookmarks()
    }
  }
}
```

## Chrome拡張機能 アーキテクチャ

### Manifest V3 構成
```json
{
  "manifest_version": 3,
  "name": "Encore - Read Later",
  "version": "1.0.0",
  "permissions": [
    "activeTab",
    "storage",
    "contextMenus"
  ],
  "host_permissions": [
    "https://your-encore-app.vercel.app/*"
  ],
  "background": {
    "service_worker": "background.js"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"]
    }
  ],
  "action": {
    "default_popup": "popup.html"
  }
}
```

### 拡張機能とWebアプリの連携
- PostMessage API による通信
- JWT トークンベースの認証
- Chrome Storage API でのローカル設定保存

## キャッシュ・再取得戦略

### キャッシュライフサイクル
```typescript
// キャッシュ管理サービス
export class CacheManager {
  // 初回取得時
  async savePreviewCache(url: string, metadata: LinkPreview, source: string): Promise<LinkPreview> {
    const preview = {
      url,
      ...metadata,
      source,
      status: this.determineStatus(metadata),
      fetched_at: new Date(),
      revalidate_at: new Date(Date.now() + this.getTTL(source)),
      retry_count: 0
    }
    
    return await supabase.from('link_previews').upsert(preview).single()
  }
  
  // TTL設定（ソース別）
  private getTTL(source: string): number {
    const ttlMap = {
      'edge': 7 * 24 * 60 * 60 * 1000,     // 7日
      'node': 14 * 24 * 60 * 60 * 1000,    // 14日
      'external': 30 * 24 * 60 * 60 * 1000, // 30日
      'failed': 6 * 60 * 60 * 1000         // 6時間（失敗時）
    }
    return ttlMap[source] || ttlMap['edge']
  }
  
  // ステータス判定
  private determineStatus(metadata: LinkPreview): string {
    if (metadata.title && (metadata.description || metadata.image)) {
      return 'success'
    } else if (metadata.title) {
      return 'partial'
    } else {
      return 'failed'
    }
  }
  
  // 手動再取得
  async forceRevalidate(url: string): Promise<LinkPreview> {
    // キャッシュを無視して再取得
    return await this.metadataService.extractMetadata(url)
  }
}
```

### バックグラウンド再取得（Vercel Cron）
```typescript
// app/api/cron/revalidate/route.ts
export async function GET(request: Request) {
  // 認証チェック
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  
  try {
    // 再取得対象を抽出（上位100件）
    const expiredPreviews = await supabase
      .from('link_previews')
      .select('url, status, retry_count')
      .lt('revalidate_at', new Date().toISOString())
      .eq('status', 'success')
      .order('fetched_at', { ascending: true })
      .limit(100)
    
    const results = []
    
    for (const preview of expiredPreviews.data || []) {
      try {
        // 指数的バックオフチェック
        if (preview.status === 'failed' && Math.random() < Math.pow(0.5, preview.retry_count)) {
          continue
        }
        
        const updated = await metadataService.extractMetadata(preview.url)
        results.push({ url: preview.url, status: 'updated' })
        
        // レートリミットを考慮して遅延
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        results.push({ url: preview.url, status: 'error', error: error.message })
      }
    }
    
    return Response.json({ 
      success: true, 
      processed: results.length,
      results 
    })
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
```

### 手動再取得UI
```typescript
// components/bookmarks/refresh-preview-button.tsx
export function RefreshPreviewButton({ bookmark }: { bookmark: Bookmark }) {
  const [isLoading, setIsLoading] = useState(false)
  
  const handleRefresh = async () => {
    setIsLoading(true)
    try {
      await fetch('/api/bookmarks/refresh-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarkId: bookmark.id })
      })
      
      // UI更新
      router.refresh()
    } catch (error) {
      console.error('Preview refresh failed:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <button onClick={handleRefresh} disabled={isLoading}>
      {isLoading ? <Spinner /> : <RefreshIcon />}
      再取得
    </button>
  )
}
```

## セキュリティ・パフォーマンス考慮事項

### SSRF/セキュリティ対策
```typescript
// lib/security/url-validator.ts
export class UrlValidator {
  private static readonly ALLOWED_PROTOCOLS = ['http:', 'https:']
  private static readonly PRIVATE_IP_RANGES = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/,
    /^fe80:/
  ]
  
  static validate(url: string): { valid: boolean; error?: string } {
    try {
      const parsed = new URL(url)
      
      // プロトコルチェック
      if (!this.ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
        return { valid: false, error: 'Invalid protocol' }
      }
      
      // プライベートIPチェック
      if (this.isPrivateIP(parsed.hostname)) {
        return { valid: false, error: 'Private IP not allowed' }
      }
      
      // ループバックチェック
      if (parsed.hostname === 'localhost' || parsed.hostname === '0.0.0.0') {
        return { valid: false, error: 'Loopback not allowed' }
      }
      
      return { valid: true }
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' }
    }
  }
  
  private static isPrivateIP(hostname: string): boolean {
    return this.PRIVATE_IP_RANGES.some(range => range.test(hostname))
  }
}
```

### リクエスト制限とタイムアウト
```typescript
// lib/http/safe-fetch.ts
export async function safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // URLバリデーション
  const validation = UrlValidator.validate(url)
  if (!validation.valid) {
    throw new Error(`URL validation failed: ${validation.error}`)
  }
  
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10000) // 10秒タイムアウト
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'EncoreMetaBot/1.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja,en;q=0.9',
        ...options.headers
      },
      // サイズ制限（先靣1-2MBで打ち切り）
      // Note: 実際はstreamで処理してサイズチェック
    })
    
    // リダイレクト制限（最大5回）
    if (response.redirected && this.getRedirectCount(response) > 5) {
      throw new Error('Too many redirects')
    }
    
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}
```

### レートリミット
```typescript
// app/api/extract/route.ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 1分間1ユーザーに10リクエスト
})

export async function GET(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1'
  const { success } = await ratelimit.limit(ip)
  
  if (!success) {
    return new Response('Rate limit exceeded', { status: 429 })
  }
  
  // メタデータ抽出処理...
}
```

### パフォーマンス最適化のポイント
- **Edge First**: 大部分のリクエストはEdgeで完結（低レイテンシ・低コスト）
- **キャッシュ優先**: DBからの取得を最優先、リクエスト数を抑制
- **バックグラウンド更新**: ユーザー体験を阻害しない非同期更新
- **段階的フォールバック**: 必要時のみ高コストAPIを使用
- **統合キャッシュ**: ユーザー間でキャッシュを共有、重複リクエスト排除
- **スマート再取得**: 指数的バックオフで失敗リンクの無駄な再試行を抑制

## 実装ミニ仕様（コピペ指針）

### 抽出優先度
```typescript
// タイトル優先度
const title = 
  $('meta[property="og:title"]').attr('content') ||
  $('meta[name="twitter:title"]').attr('content') ||
  $('title').text().trim()

// 説明優先度  
const description =
  $('meta[property="og:description"]').attr('content') ||
  $('meta[name="twitter:description"]').attr('content') ||
  $('meta[name="description"]').attr('content') ||
  await extractWithReadability(url) // Nodeのみ

// 画像優先度
const image =
  $('meta[property="og:image"]').attr('content') ||
  $('meta[name="twitter:image"]').attr('content') ||
  $('meta[name="twitter:image:src"]').attr('content') ||
  $('link[rel="apple-touch-icon"]').attr('href') ||
  $('link[rel="icon"]').attr('href')
```

### 環境変数設定
```bash
# 必須
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Google認証
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# メタデータ取得
METADATA_FALLBACK_ENABLED=false  # trueで外部API有効
MICROLINK_API_KEY=your_microlink_key  # オプション

# 日本語検索設定
SEARCH_MIN_SIMILARITY=0.1  # Trigram検索の類似度闾値

# Cronセキュリティ
CRON_SECRET=your_random_cron_secret

# レートリミット（Upstash Redis）
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
```

### データ正規化ルール
```typescript
export function normalizeUrl(url: string): string {
  const urlObj = new URL(url)
  
  // トラッキングパラメータ除去
  const trackingParams = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'msclkid', '_ga', 'mc_eid'
  ]
  
  trackingParams.forEach(param => {
    urlObj.searchParams.delete(param)
  })
  
  // 末尾スラッシュ統一
  return urlObj.toString().replace(/\/$/, '')
}

export function makeAbsoluteUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}
```

### 導入順序（小さく始めて伸ばせる）

#### Phase 1: Edge Only MVP
1. `/api/extract` EdgeルートのHTMLRewriter実装
2. `link_previews`テーブル作成
3. 基本キャッシュ機能
4. ブックマーク保存時のEdge抽出連携

#### Phase 2: Nodeフォールバック追加
5. `/api/extract/deep` Nodeルートのmetascraper実装
6. Readabilityによる本文抜粋機能
7. Edge→Nodeのフォールバックロジック

#### Phase 3: 外部APIオプション
8. `/api/extract/external`ルート実装
9. Microlink API連携
10. 環境変数で有効/無効切り替え

#### Phase 4: 運用機能
11. Vercel Cronでのバックグラウンド再取得
12. 手動再取得ボタン
13. レートリミット実装
14. メトリクスとモニタリング

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

### デバッグ情報保存
- `source`フィールドでどの段階で抽出できたか記録
- `status`で成功/部分成功/失敗を区別
- `retry_count`で再試行回数を記録
- `error_message`で失敗理由を保存
- `similarity_score`で検索結果の関連度を記録