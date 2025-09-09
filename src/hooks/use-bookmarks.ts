import { useCallback, useEffect, useState, useRef } from 'react'
import type { Bookmark, BookmarkFilters } from '@/types/database'

export function useBookmarks(filters?: BookmarkFilters) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // stale closure対策：常に最新のbookmarks状態をrefで保持
  const bookmarksRef = useRef(bookmarks)
  bookmarksRef.current = bookmarks

  // ブックマーク取得関数（useCallbackで依存関係を管理）
  const fetchBookmarks = useCallback(async () => {
    try {
      setLoading(true)

      // URLパラメータ構築
      const params = new URLSearchParams()
      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          for (const status of filters.status) {
            params.append('status', status)
          }
        } else {
          params.append('status', filters.status)
        }
      }
      if (filters?.is_favorite !== undefined)
        params.append('is_favorite', String(filters.is_favorite))
      if (filters?.is_pinned !== undefined)
        params.append('is_pinned', String(filters.is_pinned))
      if (filters?.search) params.append('search', filters.search)
      if (filters?.tags?.length) {
        for (const tag of filters.tags) {
          params.append('tags', tag)
        }
      }

      const url = `/api/bookmarks${params.toString() ? `?${params.toString()}` : ''}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error('ブックマークの取得に失敗しました')
      }
      const result = await response.json()
      setBookmarks(result.data || [])
      setError(null)
    } catch (err) {
      console.error('Error fetching bookmarks:', err)
      setError(
        err instanceof Error ? err.message : 'ブックマークの取得に失敗しました',
      )
    } finally {
      setLoading(false)
    }
  }, [filters])

  // 初回データ取得
  useEffect(() => {
    fetchBookmarks()
  }, [fetchBookmarks])

  const createBookmark = useCallback(
    async (data: { url: string; title?: string; description?: string }) => {
      // 1. 一時IDでtemp entryを即座に作成（真の楽観的更新）
      const tempId = `temp-${crypto.randomUUID()}`
      const tempBookmark: Bookmark & { isLoading?: boolean } = {
        id: tempId,
        url: data.url,
        canonical_url: data.url, // 一時的：APIレスポンスで正式な値に置換
        title: data.title || null, // スケルトンUI用にnullに変更
        description: data.description || null,
        memo: null,
        thumbnail_url: null,
        is_favorite: false,
        is_pinned: false,
        pinned_at: null,
        status: 'unread',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: '', // 一時的：APIレスポンスで正式な値に置換
        isLoading: true, // スケルトンUI表示フラグ
      }

      // 2. 即座にUI更新（楽観的更新）
      setBookmarks((prev) => [tempBookmark, ...prev])
      setError(null)

      try {
        // 3. API呼び出し
        const response = await fetch('/api/bookmarks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        })

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error || 'ブックマークの作成に失敗しました')
        }

        const result = await response.json()
        const savedBookmark = result.data

        // 4. tempを正式なブックマークに置換
        setBookmarks((prev) =>
          prev.map((bookmark) =>
            bookmark.id === tempId ? savedBookmark : bookmark,
          ),
        )

        return savedBookmark
      } catch (err) {
        // 5. エラー時はtempを削除（rollback）
        setBookmarks((prev) =>
          prev.filter((bookmark) => bookmark.id !== tempId),
        )
        setError(
          err instanceof Error
            ? err.message
            : 'ブックマークの作成に失敗しました',
        )
        throw err
      }
    },
    [],
  )

  const updateBookmark = useCallback(
    async (id: string, updates: Partial<Bookmark>) => {
      // 1. 現在の状態をref経由で取得（stale closure回避）
      const previousBookmarks = bookmarksRef.current

      // 2. 楽観的更新：即座にローカル状態を更新
      setBookmarks((prev) =>
        prev.map((bookmark) =>
          bookmark.id === id ? { ...bookmark, ...updates } : bookmark,
        ),
      )
      setError(null)

      try {
        // 3. API呼び出し
        const response = await fetch(`/api/bookmarks/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        })

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error || 'ブックマークの更新に失敗しました')
        }

        const result = await response.json()
        const updatedBookmark = result.data

        // 4. サーバーからの正式な結果で状態を更新
        setBookmarks((prev) =>
          prev.map((bookmark) =>
            bookmark.id === id ? updatedBookmark : bookmark,
          ),
        )

        // fetchBookmarks()呼び出し削除：楽観的更新で完結

        return updatedBookmark
      } catch (err) {
        // 5. エラー時は完全復旧
        setBookmarks(previousBookmarks)
        setError(
          err instanceof Error
            ? err.message
            : 'ブックマークの更新に失敗しました',
        )
        throw err
      }
    },
    [],
  )

  const deleteBookmark = useCallback(async (id: string) => {
    // 1. 現在の状態をref経由で取得（stale closure回避）
    const previousBookmarks = bookmarksRef.current

    // 2. 即座に削除（楽観的更新）
    setBookmarks((prev) => prev.filter((bookmark) => bookmark.id !== id))
    setError(null)

    try {
      // 3. API呼び出し
      const response = await fetch(`/api/bookmarks/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'ブックマークの削除に失敗しました')
      }

      // fetchBookmarks()呼び出し削除：楽観的更新で完結
    } catch (err) {
      // 4. エラー時は完全復旧
      setBookmarks(previousBookmarks)
      setError(
        err instanceof Error ? err.message : 'ブックマークの削除に失敗しました',
      )
      throw err
    }
  }, [])

  return {
    bookmarks,
    loading,
    error,
    createBookmark,
    updateBookmark,
    deleteBookmark,
    refetch: fetchBookmarks, // 手動リフレッシュが必要な場合
  }
}
