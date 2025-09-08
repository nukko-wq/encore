import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import type { Bookmark } from '@/types/database'

export interface BookmarkFilters {
  status?: 'unread' | 'read' | 'archived'
  tags?: string[]
  is_favorite?: boolean
  is_pinned?: boolean
  search?: string
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ブックマーク取得関数（useCallbackで依存関係を管理）
  const fetchBookmarks = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/bookmarks')
      if (!response.ok) {
        throw new Error('Failed to fetch bookmarks')
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
  }, [])

  // 初回データ取得
  useEffect(() => {
    fetchBookmarks()
  }, [fetchBookmarks])

  // Supabase Realtimeでリアルタイム更新（ユーザースコープ絞り込み）
  useEffect(() => {
    const setupRealtime = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const channel = supabase
        .channel('bookmarks-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookmarks',
            filter: `user_id=eq.${user.id}`, // ユーザースコープでフィルタ
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setBookmarks((prev) => [payload.new as Bookmark, ...prev])
            } else if (payload.eventType === 'UPDATE') {
              setBookmarks((prev) =>
                prev.map((bookmark) =>
                  bookmark.id === payload.new.id
                    ? (payload.new as Bookmark)
                    : bookmark,
                ),
              )
            } else if (payload.eventType === 'DELETE') {
              setBookmarks((prev) =>
                prev.filter((bookmark) => bookmark.id !== payload.old.id),
              )
            }
          },
        )
        .subscribe()

      return () => {
        channel.unsubscribe()
      }
    }

    const cleanup = setupRealtime()
    return () => {
      cleanup.then((cleanupFn) => cleanupFn?.())
    }
  }, [])

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
        throw new Error(result.error || 'Failed to create bookmark')
      }

      const result = await response.json()
      // Realtimeで自動更新されるので、手動更新は不要
      return result.data
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'ブックマークの作成に失敗しました',
      )
      throw err
    }
  }

  const updateBookmark = async (id: string, updates: Partial<Bookmark>) => {
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
        throw new Error(result.error || 'Failed to update bookmark')
      }

      const result = await response.json()
      return result.data
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'ブックマークの更新に失敗しました',
      )
      throw err
    }
  }

  const deleteBookmark = async (id: string) => {
    try {
      const response = await fetch(`/api/bookmarks/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Failed to delete bookmark')
      }
    } catch (err) {
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
