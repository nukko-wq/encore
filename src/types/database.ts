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
