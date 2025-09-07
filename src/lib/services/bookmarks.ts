import { supabase } from '@/lib/supabase'

// Phase1では基本的な型定義を使用
interface Bookmark {
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
  status: 'unread' | 'read'
  pinned_at: string | null
  created_at: string
  updated_at: string
}

interface BookmarkFilters {
  status?: 'unread' | 'read'
  is_favorite?: boolean
  is_pinned?: boolean
  offset?: number
  limit?: number
}

export class BookmarkService {
  // URL正規化（重複防止用）
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url)

      // トラッキングパラメータ除去
      const trackingParams = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_term',
        'utm_content',
        'fbclid',
        'gclid',
        'msclkid',
        '_ga',
        'mc_eid',
      ]

      trackingParams.forEach((param) => {
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

  // RLSポリシーにより自動でユーザーのデータのみ取得
  async getBookmarks(filters?: BookmarkFilters): Promise<Bookmark[]> {
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

    if (filters?.is_pinned) {
      query = query.eq('is_pinned', filters.is_pinned)
    }

    // ページングサポート
    if (filters?.offset !== undefined && filters?.limit !== undefined) {
      query = query.range(filters.offset, filters.offset + filters.limit - 1)
    } else if (filters?.limit !== undefined) {
      query = query.limit(filters.limit)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to fetch bookmarks: ${error.message}`)
    }

    return data || []
  }

  // RLSポリシーにより自動でホワイトリスト＆所有者チェック
  async createBookmark(data: {
    url: string
    title?: string
    description?: string
    memo?: string
  }): Promise<Bookmark> {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('User not authenticated')
    }

    // RLSポリシーでホワイトリスト＆所有者チェックが自動実行
    // canonical_urlのユニーク制約により重複は自動で防止される
    const { data: bookmark, error } = await supabase
      .from('bookmarks')
      .insert({
        user_id: user.id,
        url: data.url,
        canonical_url: this.normalizeUrl(data.url), // 正規化済みURL
        title: data.title || 'Untitled',
        description: data.description || null,
        memo: data.memo || null,
      })
      .select()
      .single()

    if (error) {
      // 重複URLの場合のエラーハンドリング
      if (error.code === '23505') {
        // unique_violation
        throw new Error('このURLは既に保存されています')
      }
      throw new Error(`Failed to create bookmark: ${error.message}`)
    }

    return bookmark
  }

  async updateBookmark(
    id: string,
    updates: Partial<Bookmark>,
  ): Promise<Bookmark> {
    // RLSポリシーにより自動で所有者チェック
    const { data, error } = await supabase
      .from('bookmarks')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
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
    const { error } = await supabase.from('bookmarks').delete().eq('id', id)

    if (error) {
      throw new Error(`Failed to delete bookmark: ${error.message}`)
    }
  }

  // お気に入り切り替え
  async toggleFavorite(id: string, isFavorite: boolean): Promise<Bookmark> {
    return this.updateBookmark(id, { is_favorite: isFavorite })
  }

  // ピン留め切り替え
  async togglePin(id: string, isPinned: boolean): Promise<Bookmark> {
    const updates: Partial<Bookmark> = {
      is_pinned: isPinned,
      pinned_at: isPinned ? new Date().toISOString() : null,
    }
    return this.updateBookmark(id, updates)
  }

  // 既読切り替え
  async toggleReadStatus(
    id: string,
    status: 'read' | 'unread',
  ): Promise<Bookmark> {
    return this.updateBookmark(id, { status })
  }

  // 日本語対応全文検索（Trigramベース）
  async searchBookmarks(
    searchTerm: string,
    filters?: BookmarkFilters,
  ): Promise<Bookmark[]> {
    if (!searchTerm.trim()) {
      return this.getBookmarks(filters)
    }

    // Phase1では基本的なILIKE検索を使用
    return this.searchBookmarksFallback(searchTerm, filters)
  }

  // フォールバック検索（ILIKE使用）
  private async searchBookmarksFallback(
    searchTerm: string,
    filters?: BookmarkFilters,
  ): Promise<Bookmark[]> {
    const searchPattern = `%${searchTerm}%`

    let query = supabase
      .from('bookmarks')
      .select('*')
      .or(
        `title.ilike.${searchPattern},description.ilike.${searchPattern},memo.ilike.${searchPattern}`,
      )
      .order('created_at', { ascending: false })

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.is_favorite) {
      query = query.eq('is_favorite', filters.is_favorite)
    }

    if (filters?.is_pinned) {
      query = query.eq('is_pinned', filters.is_pinned)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to search bookmarks: ${error.message}`)
    }

    return data || []
  }

  // 重複チェック用メソッド（オプション機能）
  async checkDuplicate(url: string): Promise<Bookmark | null> {
    const canonicalUrl = this.normalizeUrl(url)

    const { data } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('canonical_url', canonicalUrl)
      .single()

    return data || null
  }
}
