import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient, createServiceRoleClient } from '@/lib/supabase-server'
import { normalizeUrl } from '@/lib/url-normalization'
import type {
  Bookmark,
  BookmarkFilters,
  BookmarkSearchResult,
  CreateBookmarkData,
  PaginationOptions,
  UpdateBookmarkData,
} from '@/types/database'

export class BookmarkService {
  /**
   * ブックマーク一覧取得
   * RLSポリシーにより自動でユーザーのデータのみ取得
   */
  async getBookmarks(
    filters?: BookmarkFilters,
    pagination?: PaginationOptions,
  ): Promise<BookmarkSearchResult> {
    const supabase = await this.getClient()

    // デバッグ: 認証状態確認
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    console.log('🔍 BookmarkService.getBookmarks - 認証状態:', {
      user: user
        ? { id: user.id, email: user.email, created_at: user.created_at }
        : null,
      authError: authError?.message,
    })

    // デバッグ: ホワイトリスト確認
    if (user?.email) {
      const { data: allowedEmail, error: whitelistError } = await supabase
        .from('allowed_emails')
        .select('email')
        .eq('email', user.email)
        .single()

      console.log('🔍 BookmarkService.getBookmarks - ホワイトリスト状況:', {
        userEmail: user.email,
        isWhitelisted: !!allowedEmail,
        whitelistError: whitelistError?.message,
        whitelistData: allowedEmail,
      })
    }

    // デフォルト値設定
    const page = pagination?.page ?? 1
    const limit = Math.min(pagination?.limit ?? 20, 100) // 最大100件に制限
    const sortBy = pagination?.sort_by ?? 'created_at'
    const sortOrder = pagination?.sort_order ?? 'desc'
    const offset = (page - 1) * limit

    // 総件数取得用クエリ
    let countQuery = supabase
      .from('bookmarks')
      .select('*', { count: 'exact', head: true })

    // データ取得用クエリ
    let dataQuery = supabase
      .from('bookmarks')
      .select('*')
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(offset, offset + limit - 1)

    // フィルタ適用（両クエリに同じフィルタを適用）
    const applyFilters = (query: any) => {
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

      return query
    }

    countQuery = applyFilters(countQuery)
    dataQuery = applyFilters(dataQuery)

    // 並行実行で総件数とデータを取得
    const [countResult, dataResult] = await Promise.all([countQuery, dataQuery])

    // デバッグ: クエリ結果確認
    console.log('🔍 BookmarkService.getBookmarks - クエリ結果:', {
      countResult: {
        data: countResult.count,
        error: countResult.error?.message,
        status: countResult.status,
        statusText: countResult.statusText,
      },
      dataResult: {
        dataLength: dataResult.data?.length,
        error: dataResult.error?.message,
        status: dataResult.status,
        statusText: dataResult.statusText,
      },
      filters,
      pagination: { page, limit, sortBy, sortOrder },
    })

    if (countResult.error) {
      console.error('❌ Count query error:', countResult.error)
      throw new Error(`Failed to count bookmarks: ${countResult.error.message}`)
    }

    const total = countResult.count ?? 0
    const bookmarks = dataResult.data || []

    // RLSエラーの場合、サービスロールクライアントで再試行
    if (dataResult.error || bookmarks.length === 0) {
      console.warn('⚠️ RLS query failed, attempting service role client fallback')
      
      const serviceClient = createServiceRoleClient()
      
      // サービスロールクライアントで再試行（user_idで明示的にフィルタ）
      const [fallbackCountResult, fallbackDataResult] = await Promise.all([
        serviceClient
          .from('bookmarks')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user?.id),
        serviceClient
          .from('bookmarks')
          .select('*')
          .eq('user_id', user?.id)
          .order(sortBy, { ascending: sortOrder === 'asc' })
          .range(offset, offset + limit - 1)
      ])

      console.log('🔄 Service role fallback results:', {
        fallbackCount: fallbackCountResult.count,
        fallbackData: fallbackDataResult.data?.length,
        fallbackErrors: {
          count: fallbackCountResult.error?.message,
          data: fallbackDataResult.error?.message,
        }
      })

      if (!fallbackDataResult.error && fallbackDataResult.data) {
        const fallbackTotal = fallbackCountResult.count ?? 0
        const fallbackBookmarks = fallbackDataResult.data || []

        console.log('✅ Service role fallback successful:', {
          totalBookmarks: fallbackTotal,
          returnedBookmarks: fallbackBookmarks.length,
        })

        return {
          bookmarks: fallbackBookmarks,
          total: fallbackTotal,
          page,
          limit,
          has_next: offset + limit < fallbackTotal,
          has_prev: page > 1,
        }
      }
    }

    // 通常のRLSクエリが成功した場合
    if (dataResult.error) {
      console.error('❌ Data query error:', dataResult.error)
      throw new Error(`Failed to fetch bookmarks: ${dataResult.error.message}`)
    }

    console.log('✅ BookmarkService.getBookmarks - 通常RLS結果:', {
      totalBookmarks: total,
      returnedBookmarks: bookmarks.length,
      page,
      limit,
    })

    return {
      bookmarks,
      total,
      page,
      limit,
      has_next: offset + limit < total,
      has_prev: page > 1,
    }
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
    const supabase = await this.getClient()

    // 現在のユーザー取得
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new Error('User not authenticated')
    }

    // URL正規化
    const canonicalUrl = this.normalizeUrl(data.url)

    // メタデータ抽出（新API使用）
    let title = data.title
    let description = data.description
    let thumbnailUrl = ''

    if (!title || !description) {
      try {
        const metadata = await this.extractMetadata(data.url)
        title = title || metadata.title || 'Untitled'
        description = description || metadata.description || ''
        thumbnailUrl = metadata.image || ''
      } catch (error) {
        console.warn('Failed to extract metadata:', error)
        title = title || 'Untitled'
      }
    }

    const bookmarkData: CreateBookmarkData = {
      url: data.url,
      canonical_url: canonicalUrl,
      title: title || 'Untitled',
      description: description,
      thumbnail_url: thumbnailUrl,
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
    const supabase = await this.getClient()

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
    const supabase = await this.getClient()

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
    const supabase = await this.getClient()

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
   * URL正規化（重複防止用）- 統一モジュール使用
   */
  private normalizeUrl(url: string): string {
    return normalizeUrl(url)
  }

  /**
   * メタデータ抽出（直接実装）
   */
  private async extractMetadata(url: string): Promise<{
    title: string
    description: string
    image: string
  }> {
    try {
      // 動的インポートでメタデータ抽出処理を実行
      const { extractMetadataFromHtml } = await import('@/lib/metadata-extractor')
      const result = await extractMetadataFromHtml(url)

      return {
        title: result.title || 'Untitled',
        description: result.description || '',
        image: result.image || '',
      }
    } catch (error) {
      console.warn('Metadata extraction failed:', error)
      throw error
    }
  }

  // Supabaseクライアントキャッシュ（静的）
  private static clientCache: Map<string, SupabaseClient> = new Map()

  /**
   * キャッシュ済みSupabaseクライアント取得
   * パフォーマンス向上のため接続を再利用
   */
  private async getClient(): Promise<SupabaseClient> {
    const cacheKey = 'bookmark-service'

    if (!BookmarkService.clientCache.has(cacheKey)) {
      const client = await createClient()
      BookmarkService.clientCache.set(cacheKey, client)
      return client
    }

    const cachedClient = BookmarkService.clientCache.get(cacheKey)
    if (!cachedClient) {
      throw new Error('Failed to retrieve cached Supabase client')
    }

    return cachedClient
  }
}

// シングルトンインスタンス
export const bookmarkService = new BookmarkService()
