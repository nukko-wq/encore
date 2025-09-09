import { useCallback, useEffect, useState } from 'react'
import type { Bookmark, BookmarkFilters } from '@/types/database'

export function useBookmarks(filters?: BookmarkFilters) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const createBookmark = async (data: {
    url: string
    title?: string
    description?: string
  }) => {
    try {
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
      const newBookmark = result.data

      // 手動でローカル状態を更新（リストの先頭に追加）- 即時反映
      setBookmarks((prev) => [newBookmark, ...prev])
      setError(null)

      // 後追いで正確な一覧を再取得（ページング/ソート整合性確保）
      fetchBookmarks()

      return newBookmark
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'ブックマークの作成に失敗しました',
      )
      throw err
    }
  }

  const updateBookmark = async (id: string, updates: Partial<Bookmark>) => {
    // 楽観的更新：即座にローカル状態を更新
    const previousBookmarks = bookmarks
    setBookmarks((prev) =>
      prev.map((bookmark) =>
        bookmark.id === id ? { ...bookmark, ...updates } : bookmark,
      ),
    )

    try {
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

      // サーバーからの正式な結果で状態を更新
      setBookmarks((prev) =>
        prev.map((bookmark) =>
          bookmark.id === id ? updatedBookmark : bookmark,
        ),
      )
      setError(null)

      // 後追いで正確な一覧を再取得（フィルタやソートの整合性確保）
      fetchBookmarks()

      return updatedBookmark
    } catch (err) {
      // エラー時は前の状態に戻す（ロールバック）
      setBookmarks(previousBookmarks)
      setError(
        err instanceof Error ? err.message : 'ブックマークの更新に失敗しました',
      )
      throw err
    }
  }

  const deleteBookmark = async (id: string) => {
    // 楽観的更新：即座にローカル状態から削除
    const previousBookmarks = bookmarks
    setBookmarks((prev) => prev.filter((bookmark) => bookmark.id !== id))

    try {
      const response = await fetch(`/api/bookmarks/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'ブックマークの削除に失敗しました')
      }

      setError(null)

      // 後追いで正確な一覧を再取得（整合性確保）
      fetchBookmarks()
    } catch (err) {
      // エラー時は前の状態に戻す（ロールバック）
      setBookmarks(previousBookmarks)
      setError(
        err instanceof Error ? err.message : 'ブックマークの削除に失敗しました',
      )
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
    refetch: fetchBookmarks, // 手動リフレッシュが必要な場合
  }
}
