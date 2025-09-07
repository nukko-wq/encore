# Encore - API設計

## REST API エンドポイント

### ブックマーク管理
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

### タグ管理
```typescript
// GET /api/tags - タグ一覧取得
// POST /api/tags - タグ作成
// PUT /api/tags/[id] - タグ更新
// DELETE /api/tags/[id] - タグ削除
```

### 検索・フィルタ
```typescript
// GET /api/search?q=keyword&tags=tag1,tag2&filter=favorites
// 日本語検索に対応したTrigramベース検索を実装

// GET /api/bookmarks/feed?page=1&limit=20&sort=created_at&order=desc
// 検索クエリ例：
// SELECT * FROM bookmarks 
// WHERE (title % 'search_term' OR description % 'search_term' OR memo % 'search_term')
// ORDER BY similarity(title || ' ' || description || ' ' || memo, 'search_term') DESC;
```

### メタデータ取得API（三段構え）
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

## データベース・API層

### Supabase Auth 設定
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

// ホワイトリストチェック（citext使用により大文字小文字は自動無視）
export const checkWhitelistEmail = async (email: string): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('allowed_emails')
      .select('email')
      .eq('email', email) // citextにより自動で大文字小文字無視
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
        Row: { email: string } // citext型だがTypeScriptでは string として扱う
        Insert: { email: string }
        Update: { email?: string }
      }
      bookmarks: {
        Row: BookmarkRow & { canonical_url: string }
        Insert: BookmarkInsert & { canonical_url: string }
        Update: BookmarkUpdate & { canonical_url?: string }
      }
      tags: {
        Row: TagRow & { parent_tag_id?: string; display_order: number }
        Insert: TagInsert & { parent_tag_id?: string; display_order?: number }
        Update: TagUpdate & { parent_tag_id?: string; display_order?: number }
      }
      // ... 他のテーブル
    }
  }
}
```

## BookmarkService（データアクセスレイヤー）

### 基本CRUD操作
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
}
```

### 日本語対応全文検索
```typescript
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
```

### URL正規化と重複制御
```typescript
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
```