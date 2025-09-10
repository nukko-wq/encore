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

  // Supabase Realtimeでリアルタイム更新（フィルターなし、クライアント側で処理）
  useEffect(() => {
    if (!user) return

    const setupRealtime = () => {
      console.log('🔧 Setting up Realtime for user:', user.id)
      const channelName = `bookmarks-changes-${user.id}`
      console.log('📻 Creating channel:', channelName)

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookmarks',
            // RLSによるDELETEフィルター問題を回避するため、フィルターは使用しない
            // filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            try {
              console.log('🔔 Realtime event received:', {
                eventType: payload.eventType,
                schema: payload.schema,
                table: payload.table,
                new: payload.new,
                old: payload.old,
                timestamp: new Date().toISOString(),
              })

              // DELETEイベントの処理（RLS政策対応）
              if (payload.eventType === 'DELETE') {
                const deletedId = payload.old.id as string
                const deletedUserId = payload.old.user_id

                console.log('🗑️ Processing DELETE event:', {
                  deletedId,
                  deletedUserId,
                  currentUserId: user.id,
                })

                // user_idが取得できない場合は、現在のブックマーク一覧に存在するかをチェック
                if (!deletedUserId || deletedUserId === undefined) {
                  console.log(
                    '⚠️ DELETE event has undefined user_id (RLS policy effect)',
                  )
                  console.log(
                    "🔍 Checking if deleted bookmark exists in current user's bookmarks",
                  )

                  setBookmarks((prev) => {
                    const targetBookmark = prev.find((b) => b.id === deletedId)

                    if (!targetBookmark) {
                      console.log(
                        "❌ DELETE event for non-existent bookmark in current user's list:",
                        deletedId,
                      )
                      console.log(
                        '🔍 Available bookmark IDs:',
                        prev.map((b) => b.id),
                      )
                      return prev
                    }

                    console.log(
                      "✅ Found bookmark to delete in current user's list:",
                      {
                        id: targetBookmark.id,
                        title: targetBookmark.title,
                        isDeleting: (targetBookmark as any).isDeleting,
                      },
                    )

                    // 楽観的削除との競合チェック
                    const isOptimisticallyDeleted =
                      (targetBookmark as any).isDeleting === true
                    if (isOptimisticallyDeleted) {
                      console.log(
                        '🤝 Realtime DELETE confirms optimistic deletion:',
                        deletedId,
                      )
                    } else {
                      console.log(
                        '⚡ Realtime DELETE from external source (extension, etc):',
                        deletedId,
                      )
                    }

                    const newBookmarks = prev.filter(
                      (bookmark) => bookmark.id !== deletedId,
                    )
                    console.log('✅ Removing bookmark from state via realtime')
                    console.log(
                      '📊 Bookmarks count: before =',
                      prev.length,
                      ', after =',
                      newBookmarks.length,
                    )
                    return newBookmarks
                  })
                  return
                }

                // user_idが取得できた場合は、ユーザーIDをチェック
                if (deletedUserId !== user.id) {
                  console.log(
                    '🚫 Ignoring DELETE event for different user:',
                    deletedUserId,
                  )
                  return
                }

                console.log('✅ DELETE event for current user, processing...')
                setBookmarks((prev) => {
                  const targetBookmark = prev.find((b) => b.id === deletedId)

                  if (!targetBookmark) {
                    console.log(
                      '⚠️ DELETE event for non-existent bookmark, already removed:',
                      deletedId,
                    )
                    return prev
                  }

                  const isOptimisticallyDeleted =
                    (targetBookmark as any).isDeleting === true
                  if (isOptimisticallyDeleted) {
                    console.log(
                      '🤝 Realtime DELETE confirms optimistic deletion:',
                      deletedId,
                    )
                  } else {
                    console.log(
                      '⚡ Realtime DELETE from external source:',
                      deletedId,
                    )
                  }

                  return prev.filter((bookmark) => bookmark.id !== deletedId)
                })
                return
              }

              // INSERT/UPDATE イベントの詳細処理
              if (
                payload.eventType === 'INSERT' ||
                payload.eventType === 'UPDATE'
              ) {
                const record = payload.new as any

                console.log(
                  '🔍 Detailed user ID comparison for INSERT/UPDATE:',
                  {
                    eventType: payload.eventType,
                    recordUserId: record.user_id,
                    recordUserIdType: typeof record.user_id,
                    currentUserId: user.id,
                    currentUserIdType: typeof user.id,
                    isEqual: record.user_id === user.id,
                    isStrictEqual: record.user_id === user.id,
                    recordId: record.id,
                  },
                )

                // ユーザーID未定義の場合の処理
                if (!record.user_id || record.user_id === undefined) {
                  console.log('⚠️ INSERT/UPDATE event has undefined user_id')

                  if (payload.eventType === 'INSERT') {
                    console.log(
                      '🔍 Checking if this INSERT is for current user by other means',
                    )
                    // 楽観的更新との照合で判定
                    setBookmarks((prev) => {
                      const existingTempBookmark = prev.find((b) => {
                        const isTemporary = (b as any).isLoading === true
                        const urlMatch =
                          isTemporary &&
                          (b.canonical_url === record.canonical_url ||
                            b.url === record.canonical_url ||
                            b.canonical_url === record.url ||
                            b.url === record.url)
                        return urlMatch
                      })

                      if (existingTempBookmark) {
                        console.log(
                          '✅ Found matching temporary bookmark - this INSERT is for current user',
                        )
                        console.log(
                          '🔄 Replacing temp bookmark with realtime data:',
                          {
                            tempId: existingTempBookmark.id,
                            newId: record.id,
                            url: record.canonical_url,
                          },
                        )
                        return prev.map((bookmark) =>
                          bookmark.id === existingTempBookmark.id
                            ? record
                            : bookmark,
                        )
                      }

                      console.log(
                        '❌ No matching temporary bookmark found - ignoring INSERT',
                      )
                      return prev
                    })
                  }
                  return
                }

                // 通常のユーザーIDチェック
                if (record.user_id !== user.id) {
                  console.log(
                    '🚫 Ignoring INSERT/UPDATE event for different user:',
                    record.user_id,
                  )
                  return
                }

                console.log('✅ INSERT/UPDATE event confirmed for current user')
              }

              if (payload.eventType === 'INSERT') {
                const newBookmark = payload.new as Bookmark
                console.log(
                  '➕ Processing INSERT event for bookmark:',
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
                    console.log(
                      '🔍 Bookmark ID already exists (non-temporary), skipping INSERT',
                    )
                    return prev
                  }

                  // 2. URLベースでの重複チェック（楽観的更新との競合を検出）
                  const existingTempBookmark = prev.find((b) => {
                    const isTemporary = (b as any).isLoading === true
                    return (
                      isTemporary &&
                      (b.canonical_url === newBookmark.canonical_url ||
                        b.url === newBookmark.canonical_url ||
                        b.canonical_url === newBookmark.url ||
                        b.url === newBookmark.url)
                    )
                  })

                  if (existingTempBookmark) {
                    console.log(
                      '🔄 Found temporary bookmark with matching URL, replacing with realtime data:',
                      {
                        tempId: existingTempBookmark.id,
                        newId: newBookmark.id,
                        url: newBookmark.canonical_url,
                      },
                    )
                    // 一時ブックマークを正式なブックマークに置換
                    return prev.map((bookmark) =>
                      bookmark.id === existingTempBookmark.id
                        ? newBookmark
                        : bookmark,
                    )
                  }

                  console.log('✨ Adding new bookmark to state from realtime')
                  return [newBookmark, ...prev]
                })
              } else if (payload.eventType === 'UPDATE') {
                const updatedBookmark = payload.new as Bookmark
                console.log(
                  '📝 Processing UPDATE event for bookmark:',
                  updatedBookmark.id,
                )
                setBookmarks((prev) => {
                  const existingBookmark = prev.find(
                    (b) => b.id === updatedBookmark.id,
                  )

                  if (!existingBookmark) {
                    console.log(
                      '⚠️ UPDATE event for non-existent bookmark, ignoring:',
                      updatedBookmark.id,
                    )
                    return prev
                  }

                  // 楽観的更新との競合チェック
                  const isOptimisticallyUpdating =
                    (existingBookmark as Bookmark & { isUpdating?: boolean })
                      .isUpdating === true
                  if (isOptimisticallyUpdating) {
                    console.log(
                      '🤝 Realtime UPDATE confirms optimistic update:',
                      {
                        id: updatedBookmark.id,
                        title: updatedBookmark.title,
                        wasUpdating: true,
                      },
                    )
                  } else {
                    console.log(
                      '⚡ Realtime UPDATE from external source (extension, etc):',
                      {
                        id: updatedBookmark.id,
                        title: updatedBookmark.title,
                        oldTitle: existingBookmark.title,
                        wasUpdating: false,
                      },
                    )
                  }

                  console.log('✅ Applying bookmark update from realtime')
                  return prev.map((bookmark) =>
                    bookmark.id === updatedBookmark.id
                      ? updatedBookmark
                      : bookmark,
                  )
                })
              } else {
                console.warn(
                  '❓ Unknown realtime event type:',
                  (payload as any).eventType,
                )
              }
            } catch (error) {
              console.error(
                '💥 Error processing realtime bookmark change:',
                error,
                payload,
              )
            }
          },
        )
        .subscribe((status, err) => {
          console.log('📡 Bookmark realtime subscription status:', status)

          if (status === 'SUBSCRIBED') {
            console.log(
              '✅ Bookmark realtime connected successfully for channel:',
              channelName,
            )
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Bookmark realtime channel error:', err)
            setError('リアルタイム接続でエラーが発生しました')
          } else if (status === 'TIMED_OUT') {
            console.error('⏰ Bookmark realtime connection timed out')
            setError('リアルタイム接続がタイムアウトしました')
          } else if (status === 'CLOSED') {
            console.warn(
              '🔐 Bookmark realtime connection closed for channel:',
              channelName,
            )
          } else if (status === 'CONNECTING') {
            console.log(
              '🔄 Connecting to bookmark realtime for channel:',
              channelName,
            )
          } else {
            console.log(
              '📊 Bookmark realtime status:',
              status,
              'for channel:',
              channelName,
            )
          }

          if (err) {
            console.error('📛 Bookmark realtime error details:', err)
          }
        })

      return () => {
        console.log(
          '🔌 Unsubscribing from bookmark realtime channel:',
          channelName,
        )
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
        title: data.title,
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
          url: savedBookmark.canonical_url,
        })

        // 4. tempを正式なブックマークに置換
        // 注意：Realtimeイベントが先に到着する可能性があるため、tempIdが存在するかチェック
        setBookmarks((prev) => {
          const tempStillExists = prev.some((b) => b.id === tempId)
          if (tempStillExists) {
            console.log('🔄 Replacing temp bookmark with API result')
            return prev.map((bookmark) =>
              bookmark.id === tempId ? savedBookmark : bookmark,
            )
          } else {
            console.log(
              '⚡ Temp bookmark already replaced by realtime, keeping current state',
            )
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
      const targetBookmark = previousBookmarks.find((b) => b.id === id)

      if (!targetBookmark) {
        console.warn('⚠️ Attempting to update non-existent bookmark:', id)
        throw new Error('更新対象のブックマークが見つかりません')
      }

      console.log('📝 Starting optimistic bookmark update:', {
        id,
        updates,
        currentTitle: targetBookmark.title,
        currentBookmarksCount: previousBookmarks.length,
      })

      // 2. 楽観的更新：isUpdatingフラグを付けて即座にローカル状態を更新
      setBookmarks((prev) =>
        prev.map((bookmark) =>
          bookmark.id === id
            ? ({ ...bookmark, ...updates, isUpdating: true } as Bookmark & {
                isUpdating?: boolean
              })
            : bookmark,
        ),
      )
      setError(null)

      try {
        // 3. API呼び出し
        console.log('📡 Sending PATCH request to API for bookmark:', id)
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

        console.log('✅ API bookmark update successful:', {
          id,
          updatedTitle: updatedBookmark.title,
          updatedFields: Object.keys(updates),
        })

        // 4. サーバーからの正式な結果で状態を更新（isUpdatingフラグ削除）
        // 注意：Realtimeイベントが先に到着する可能性があるため、isUpdatingが存在するかチェック
        setBookmarks((prev) => {
          const currentBookmark = prev.find((b) => b.id === id)
          const isStillUpdating =
            currentBookmark &&
            (currentBookmark as Bookmark & { isUpdating?: boolean })
              .isUpdating === true

          if (isStillUpdating) {
            console.log('🔄 Replacing optimistic update with API result')
            return prev.map((bookmark) =>
              bookmark.id === id ? updatedBookmark : bookmark,
            )
          } else {
            console.log(
              '⚡ Optimistic update already replaced by realtime, keeping current state',
            )
            return prev
          }
        })

        console.log('⏳ Waiting for Realtime UPDATE event to confirm update...')

        // 更新確認のタイムアウトを設定（5秒）
        setTimeout(() => {
          const currentBookmarks = bookmarksRef.current
          const currentBookmark = currentBookmarks.find((b) => b.id === id)
          const isStillUpdating =
            currentBookmark &&
            (currentBookmark as Bookmark & { isUpdating?: boolean })
              .isUpdating === true

          if (isStillUpdating) {
            console.warn(
              '⚠️ Realtime UPDATE event not received after 5 seconds, forcing local update',
            )
            setBookmarks((prev) =>
              prev.map((bookmark) =>
                bookmark.id === id ? updatedBookmark : bookmark,
              ),
            )
          }
        }, 5000)

        return updatedBookmark
      } catch (err) {
        // 5. エラー時は完全復旧
        console.error('❌ Bookmark update failed, rolling back:', {
          id,
          error: err,
          updates,
        })

        // Realtimeで既に更新されている可能性をチェック
        const currentBookmarks = bookmarksRef.current
        const currentBookmark = currentBookmarks.find((b) => b.id === id)
        const isStillUpdating =
          currentBookmark &&
          (currentBookmark as Bookmark & { isUpdating?: boolean })
            .isUpdating === true

        if (!isStillUpdating) {
          console.log(
            '⚡ Bookmark already updated by realtime, not rolling back',
          )
          // Realtimeで既に更新済みの場合は、エラーを記録するが復旧しない
          console.warn(
            '📊 Concurrent update detected - API failed but realtime succeeded',
          )
        } else {
          console.log(
            '🔄 Rolling back optimistic update (removing isUpdating flag)',
          )
          // isUpdatingフラグを削除して元の状態に戻す
          setBookmarks((prev) =>
            prev.map((bookmark) =>
              bookmark.id === id
                ? { ...targetBookmark } // 元のブックマークに復旧
                : bookmark,
            ),
          )
        }

        const errorMessage =
          err instanceof Error
            ? err.message
            : 'ブックマークの更新に失敗しました'
        setError(errorMessage)
        throw new Error(errorMessage)
      }
    },
    [],
  )

  const deleteBookmark = useCallback(async (id: string) => {
    // 1. 現在の状態をref経由で取得（stale closure回避）
    const previousBookmarks = bookmarksRef.current
    const targetBookmark = previousBookmarks.find((b) => b.id === id)

    if (!targetBookmark) {
      console.warn('⚠️ Attempting to delete non-existent bookmark:', id)
      throw new Error('削除対象のブックマークが見つかりません')
    }

    console.log('🗑️ Starting optimistic bookmark deletion:', {
      id,
      title: targetBookmark.title,
      url: targetBookmark.canonical_url || targetBookmark.url,
      currentBookmarksCount: previousBookmarks.length,
    })

    // 2. 楽観的削除：isDeleteingフラグを付けるだけで実際の削除はRealtimeで行う
    setBookmarks((prev) => {
      const updated = prev.map((bookmark) =>
        bookmark.id === id
          ? ({ ...bookmark, isDeleting: true } as Bookmark & {
              isDeleting?: boolean
            })
          : bookmark,
      )
      console.log('🏷️ Added isDeleting flag to bookmark:', id)
      return updated
    })
    setError(null)

    try {
      // 3. API呼び出し
      console.log('📡 Sending DELETE request to API for bookmark:', id)
      const response = await fetch(`/api/bookmarks/${id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'ブックマークの削除に失敗しました')
      }

      console.log('✅ API bookmark deletion successful:', id)
      console.log('⏳ Waiting for Realtime DELETE event to confirm deletion...')

      // 削除確認のタイムアウトを設定（5秒に戻す）
      setTimeout(() => {
        const currentBookmarks = bookmarksRef.current
        const stillExists = currentBookmarks.some((b) => b.id === id)
        if (stillExists) {
          console.warn(
            '⚠️ Realtime DELETE event not received after 5 seconds, forcing local deletion',
          )
          setBookmarks((prev) => prev.filter((bookmark) => bookmark.id !== id))
        }
      }, 5000)
    } catch (err) {
      // 4. エラー時は完全復旧
      console.error('❌ Bookmark deletion failed, rolling back:', {
        id,
        error: err,
      })

      // Realtimeで既に削除されている可能性をチェック
      const currentBookmarks = bookmarksRef.current
      const stillExists = currentBookmarks.some((b) => b.id === id)

      if (!stillExists) {
        console.log('⚡ Bookmark already deleted by realtime, not rolling back')
        // Realtimeで既に削除済みの場合は、エラーを記録するが復旧しない
        console.warn(
          '📊 Concurrent deletion detected - API failed but realtime succeeded',
        )
      } else {
        console.log(
          '🔄 Rolling back optimistic deletion (removing isDeleting flag)',
        )
        // isDeleteingフラグを削除して元の状態に戻す
        setBookmarks((prev) =>
          prev.map((bookmark) =>
            bookmark.id === id
              ? { ...targetBookmark } // 元のブックマークに復旧
              : bookmark,
          ),
        )
      }

      const errorMessage =
        err instanceof Error ? err.message : 'ブックマークの削除に失敗しました'
      setError(errorMessage)
      throw new Error(errorMessage)
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
