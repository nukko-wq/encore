import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/common/auth-provider'
import { supabase } from '@/lib/supabase'
import type { Bookmark, BookmarkFilters } from '@/types/database'

export function useBookmarks(filters?: BookmarkFilters) {
  const { user } = useAuth()
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

  // Supabase Realtimeでリアルタイム更新（ユーザースコープ絞り込み）
  useEffect(() => {
    if (!user) return

    const setupRealtime = () => {
      const channel = supabase
        .channel(`bookmarks-changes-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookmarks',
            filter: `user_id=eq.${user.id}`, // ユーザースコープでフィルタ
          },
          (payload) => {
            try {
              console.log('Realtime bookmark change received:', payload)

              if (payload.eventType === 'INSERT') {
                const newBookmark = payload.new as Bookmark
                console.log(
                  'Processing INSERT event for bookmark:',
                  newBookmark.id,
                )
                setBookmarks((prev) => {
                  // 改善された重複チェックロジック
                  // 1. IDベースでの重複チェック（一時ブックマークは除外）
                  const existsById = prev.some((b) => {
                    const isTemporary = (b as any).isLoading === true
                    return !isTemporary && b.id === newBookmark.id
                  })
                  
                  if (existsById) {
                    console.log('🔍 Bookmark ID already exists (non-temporary), skipping INSERT')
                    return prev
                  }

                  // 2. URLベースでの重複チェック（楽観的更新との競合を検出）
                  const existingTempBookmark = prev.find((b) => {
                    const isTemporary = (b as any).isLoading === true
                    return isTemporary && 
                           (b.canonical_url === newBookmark.canonical_url || 
                            b.url === newBookmark.canonical_url ||
                            b.canonical_url === newBookmark.url ||
                            b.url === newBookmark.url)
                  })

                  if (existingTempBookmark) {
                    console.log('🔄 Found temporary bookmark with matching URL, replacing with realtime data:', {
                      tempId: existingTempBookmark.id,
                      newId: newBookmark.id,
                      url: newBookmark.canonical_url
                    })
                    // 一時ブックマークを正式なブックマークに置換
                    return prev.map((bookmark) =>
                      bookmark.id === existingTempBookmark.id ? newBookmark : bookmark,
                    )
                  }

                  console.log('✨ Adding new bookmark to state from realtime')
                  return [newBookmark, ...prev]
                })
              } else if (payload.eventType === 'UPDATE') {
                const updatedBookmark = payload.new as Bookmark
                console.log(
                  'Processing UPDATE event for bookmark:',
                  updatedBookmark.id,
                )
                setBookmarks((prev) =>
                  prev.map((bookmark) =>
                    bookmark.id === updatedBookmark.id
                      ? updatedBookmark
                      : bookmark,
                  ),
                )
              } else if (payload.eventType === 'DELETE') {
                const deletedId = payload.old.id as string
                console.log('Processing DELETE event for bookmark:', deletedId)
                setBookmarks((prev) =>
                  prev.filter((bookmark) => bookmark.id !== deletedId),
                )
              } else {
                console.warn(
                  'Unknown realtime event type:',
                  (payload as any).eventType,
                )
              }
            } catch (error) {
              console.error(
                'Error processing realtime bookmark change:',
                error,
                payload,
              )
            }
          },
        )
        .subscribe((status, err) => {
          console.log('📡 Bookmark realtime subscription status:', status)

          if (status === 'SUBSCRIBED') {
            console.log('✅ Bookmark realtime connected successfully')
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Bookmark realtime channel error:', err)
            setError('リアルタイム接続でエラーが発生しました')
          } else if (status === 'TIMED_OUT') {
            console.error('⏰ Bookmark realtime connection timed out')
            setError('リアルタイム接続がタイムアウトしました')
          } else if (status === 'CLOSED') {
            console.warn('🔐 Bookmark realtime connection closed')
          } else if (status === 'CONNECTING') {
            console.log('🔄 Connecting to bookmark realtime...')
          } else {
            console.log('📊 Bookmark realtime status:', status)
          }

          if (err) {
            console.error('📛 Bookmark realtime error details:', err)
          }
        })

      return () => {
        console.log('Unsubscribing from bookmark realtime channel')
        channel.unsubscribe()
      }
    }

    const cleanup = setupRealtime()
    return cleanup
  }, [user]) // userが変わったときに再設定

  const createBookmark = useCallback(
    async (data: { url: string; title?: string; description?: string }) => {
      // 1. 有効なUUIDで一時entryを即座に作成（真の楽観的更新）
      const tempId = crypto.randomUUID() // temp-プレフィックスを削除
      const tempBookmark: Bookmark & { isLoading?: boolean } = {
        id: tempId,
        url: data.url,
        canonical_url: data.url, // 一時的：APIレスポンスで正式な値に置換
        title: data.title || null, // スケルトンUI用のnullに変更
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
      console.log('🚀 Creating optimistic bookmark:', {
        tempId,
        url: data.url,
        title: data.title
      })
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

        console.log('✅ API bookmark creation successful:', {
          tempId,
          savedId: savedBookmark.id,
          url: savedBookmark.canonical_url
        })

        // 4. tempを正式なブックマークに置換
        // 注意：Realtimeイベントが先に到着する可能性があるため、tempIdが存在するかチェック
        setBookmarks((prev) => {
          const tempStillExists = prev.some(b => b.id === tempId)
          if (tempStillExists) {
            console.log('🔄 Replacing temp bookmark with API result')
            return prev.map((bookmark) =>
              bookmark.id === tempId ? savedBookmark : bookmark,
            )
          } else {
            console.log('⚡ Temp bookmark already replaced by realtime, keeping current state')
            return prev
          }
        })

        return savedBookmark
      } catch (err) {
        // 5. エラー時はtempを削除（rollback）
        console.error('❌ Bookmark creation failed, rolling back:', err)
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
