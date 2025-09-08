import { createClient } from '@/lib/supabase-server'
import type {
  Bookmark,
  BookmarkFilters,
  CreateBookmarkData,
  UpdateBookmarkData,
} from '@/types/database'

export class BookmarkService {
  /**
   * ブックマーク一覧取得
   * RLSポリシーにより自動でユーザーのデータのみ取得
   */
  async getBookmarks(filters?: BookmarkFilters): Promise<Bookmark[]> {
    const supabase = await createClient()

    let query = supabase
      .from('bookmarks')
      .select('*')
      .order('created_at', { ascending: false })

    // フィルタ適用
    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status)
      } else {
        query = query.eq('status', filters.status)
      }
    }

    if (filters?.is_favorite !== undefined) {
      query = query.eq('is_favorite', filters.is_favorite)
    }

    if (filters?.is_pinned !== undefined) {
      query = query.eq('is_pinned', filters.is_pinned)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to fetch bookmarks: ${error.message}`)
    }

    return data || []
  }

  /**
   * ブックマーク作成
   * RLSポリシーにより自動でホワイトリスト＆所有者チェック
   */
  async createBookmark(data: {
    url: string
    title?: string
    description?: string
  }): Promise<Bookmark> {
    const supabase = await createClient()

    // 現在のユーザー取得
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('User not authenticated')
    }

    // URL正規化
    const canonicalUrl = this.normalizeUrl(data.url)

    // 基本的なメタデータ抽出（タイトルが未指定の場合）
    let title = data.title
    if (!title) {
      try {
        title = await this.extractTitle(data.url)
      } catch (error) {
        console.warn('Failed to extract title:', error)
        title = 'Untitled'
      }
    }

    const bookmarkData: CreateBookmarkData = {
      url: data.url,
      canonical_url: canonicalUrl,
      title: title || 'Untitled',
      description: data.description,
      is_favorite: false,
      is_pinned: false,
      status: 'unread',
    }

    // RLSポリシーでホワイトリスト＆所有者チェックが自動実行
    const { data: bookmark, error } = await supabase
      .from('bookmarks')
      .insert({
        user_id: user.id,
        ...bookmarkData,
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

  /**
   * ブックマーク更新
   */
  async updateBookmark(
    id: string,
    updates: UpdateBookmarkData,
  ): Promise<Bookmark> {
    const supabase = await createClient()

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

  /**
   * ブックマーク削除
   */
  async deleteBookmark(id: string): Promise<void> {
    const supabase = await createClient()

    // RLSポリシーにより自動で所有者チェック
    const { error } = await supabase.from('bookmarks').delete().eq('id', id)

    if (error) {
      throw new Error(`Failed to delete bookmark: ${error.message}`)
    }
  }

  /**
   * 重複チェック
   */
  async checkDuplicate(url: string): Promise<Bookmark | null> {
    const canonicalUrl = this.normalizeUrl(url)
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('canonical_url', canonicalUrl)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found
      throw new Error(`Failed to check duplicate: ${error.message}`)
    }

    return data || null
  }

  /**
   * URL正規化（重複防止用）
   */
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

  /**
   * 簡易メタデータ抽出（タイトルのみ）
   */
  private async extractTitle(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; Encore/1.0; +https://encore.example.com)',
        },
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const html = await response.text()

      // シンプルなタイトル抽出
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      if (titleMatch?.[1]) {
        return titleMatch[1].trim()
      }

      // OGタイトルをフォールバック
      const ogTitleMatch = html.match(
        /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i,
      )
      if (ogTitleMatch?.[1]) {
        return ogTitleMatch[1].trim()
      }

      // URLからファイル名を抽出（最終フォールバック）
      const urlObj = new URL(url)
      const pathname = urlObj.pathname
      const filename = pathname.split('/').pop()

      return filename && filename !== '' ? filename : 'Untitled'
    } catch (error) {
      console.warn('Title extraction failed:', error)
      throw error
    }
  }
}

// シングルトンインスタンス
export const bookmarkService = new BookmarkService()
