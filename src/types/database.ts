// データベース型定義
// Supabaseから生成される型に対応

export type BookmarkStatus = 'unread' | 'read' | 'archived' | 'deleted'

export interface Bookmark {
  id: string
  user_id: string
  url: string
  canonical_url: string
  title: string | null
  description: string | null
  thumbnail_url: string | null
  memo: string | null
  is_favorite: boolean
  is_pinned: boolean
  status: BookmarkStatus
  pinned_at: string | null
  created_at: string
  updated_at: string
  bookmark_tags?: Array<{
    tag_id: string
    tag: {
      id: string
      name: string
      color: string
    }
  }>
}

export interface AllowedEmail {
  email: string
}

// データベース操作の戻り値型
export interface DatabaseResult<T> {
  data: T | null
  error: Error | null
}

// ブックマーク作成用の型
export interface CreateBookmarkData {
  url: string
  canonical_url: string
  title?: string
  description?: string
  thumbnail_url?: string
  memo?: string
  is_favorite?: boolean
  is_pinned?: boolean
  status?: BookmarkStatus
}

// ブックマーク更新用の型
export interface UpdateBookmarkData {
  url?: string
  canonical_url?: string
  title?: string
  description?: string
  thumbnail_url?: string
  memo?: string
  is_favorite?: boolean
  is_pinned?: boolean
  status?: BookmarkStatus
  pinned_at?: string | null
}

// フィルタリング用の型
export interface BookmarkFilters {
  status?: BookmarkStatus | BookmarkStatus[]
  tags?: string
  is_favorite?: boolean
  is_pinned?: boolean
  search?: string
}

// ページネーション用の型
export interface PaginationOptions {
  page?: number
  limit?: number
  sort_by?: 'created_at' | 'updated_at' | 'title'
  sort_order?: 'asc' | 'desc'
}

// 検索結果型
export interface BookmarkSearchResult {
  bookmarks: Bookmark[]
  total: number
  page: number
  limit: number
  has_next: boolean
  has_prev: boolean
}

// リンクプレビュー関連の型定義
export type PreviewStatus = 'success' | 'partial' | 'failed'
export type PreviewSource = 'node' | 'external' | 'fallback'

export interface LinkPreview {
  id: string
  url: string
  title: string | null
  description: string | null
  image: string | null
  favicon: string | null
  site_name: string | null
  status: PreviewStatus
  source: PreviewSource
  fetched_at: string
  revalidate_at: string
  retry_count: number
  created_at: string
  updated_at: string
}

// メタデータ抽出結果の型
export interface MetadataExtractResult {
  success: boolean
  data?: {
    title: string
    description: string
    image: string
    favicon: string
    siteName: string
    url: string
  }
  error?: string
  source: PreviewSource
}

// URL正規化結果の型
export interface UrlNormalizationResult {
  success: boolean
  originalUrl: string
  normalizedUrl: string
  source: 'edge'
  error?: string
}

// キャッシュチェック結果の型
export interface CacheCheckResult {
  cached: boolean
  data?: LinkPreview
  shouldFetch?: boolean
  normalizedUrl?: string
  source: 'cache' | 'node'
}

// リンクプレビュー作成用の型
export interface CreateLinkPreviewData {
  url: string
  title?: string
  description?: string
  image?: string
  favicon?: string
  site_name?: string
  status: PreviewStatus
  source: PreviewSource
  retry_count?: number
}

// ブックマーク-タグ関連の型定義
export interface BookmarkTag {
  id: string
  bookmark_id: string
  tag_id: string
  created_at: string
}

// ブックマーク-タグ作成用の型
export interface CreateBookmarkTagData {
  bookmark_id: string
  tag_id: string
}

// タグ付きブックマーク（JOINクエリ用）
export interface BookmarkWithTags extends Bookmark {
  tags?: {
    id: string
    name: string
    color: string
  }[]
}
