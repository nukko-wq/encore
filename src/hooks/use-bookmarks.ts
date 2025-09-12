import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/components/common/auth-provider'
import { supabase } from '@/lib/supabase'
import type { Bookmark, BookmarkFilters } from '@/types/database'

export function useBookmarks(filters?: BookmarkFilters) {
  const { user } = useAuth()
  const [allBookmarks, setAllBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // クライアントサイドフィルタリング
  const bookmarks = useMemo(() => {
    if (!allBookmarks) return []

    return allBookmarks.filter((bookmark) => {
      // タグフィルタリング
      if (filters?.tags) {
        const hasTag = bookmark.bookmark_tags?.some(
          (tagRelation) => tagRelation.tag_id === filters.tags,
        )
        if (!hasTag) return false
      }

      // ステータスフィルタリング
      if (filters?.status) {
        if (Array.isArray(filters.status)) {
          if (!filters.status.includes(bookmark.status)) return false
        } else {
          if (bookmark.status !== filters.status) return false
        }
      }

      // お気に入りフィルタリング
      if (filters?.is_favorite !== undefined) {
        if (bookmark.is_favorite !== filters.is_favorite) return false
      }

      // ピン留めフィルタリング
      if (filters?.is_pinned !== undefined) {
        if (bookmark.is_pinned !== filters.is_pinned) return false
      }

      // 検索フィルタリング
      if (filters?.search) {
        const searchTerm = filters.search.toLowerCase()
        const titleMatch = bookmark.title?.toLowerCase().includes(searchTerm)
        const descriptionMatch = bookmark.description
          ?.toLowerCase()
          .includes(searchTerm)
        const memoMatch = bookmark.memo?.toLowerCase().includes(searchTerm)

        if (!titleMatch && !descriptionMatch && !memoMatch) return false
      }

      return true
    })
  }, [allBookmarks, filters])

  // stale closure対策：常に最新のbookmarks状態をrefで保持
  const bookmarksRef = useRef(bookmarks)
  bookmarksRef.current = bookmarks

  // 全ブックマーク取得関数
  const fetchAllBookmarks = useCallback(async () => {
    try {
      setLoading(true)
      const url = '/api/bookmarks'
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error('ブックマークの取得に失敗しました')
      }
      const result = await response.json()
      setAllBookmarks(result.data || [])
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
    fetchAllBookmarks()
  }, [fetchAllBookmarks])

  // Supabase Realtimeでリアルタイム更新（フィルターなし、クライアント側で処理）
  useEffect(() => {
    if (!user) return

    let reconnectTimeoutId: NodeJS.Timeout | null = null
    let reconnectAttempts = 0
    const maxReconnectAttempts = 3
    let isUnmounted = false
    let currentChannel: any = null // 現在のチャンネル参照を保持

    const setupRealtime = (): (() => void) => {
      console.log(
        `🔧 Setting up Realtime for user: ${user.id} (attempt ${reconnectAttempts + 1})`,
      )
      const channelName = `bookmarks-changes-${user.id}`
      console.log('📻 Creating channel:', channelName)

      // 既存のチャンネルがあればクリーンアップ
      if (currentChannel) {
        console.log('🧹 Cleaning up previous channel before setup')
        currentChannel.unsubscribe()
      }

      const channel = supabase.channel(channelName)

      // 現在のチャンネル参照を更新
      currentChannel = channel
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

                  setAllBookmarks((prev) => {
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
                setAllBookmarks((prev) => {
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
                    setAllBookmarks((prev) => {
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
                setAllBookmarks((prev) => {
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
                setAllBookmarks((prev) => {
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
          console.log(
            `📡 Bookmark realtime subscription status: ${status} (attempt ${reconnectAttempts + 1})`,
          )

          if (status === 'SUBSCRIBED') {
            console.log(
              '✅ Bookmark realtime connected successfully for channel:',
              channelName,
            )
            // 接続成功時は再接続カウンターをリセット
            reconnectAttempts = 0
            setError(null) // 接続成功時はエラーをクリア
          } else if (status === 'CHANNEL_ERROR') {
            // エラーメッセージの詳細を解析してフィルタリング
            const errorMessage = err
              ? typeof err === 'string'
                ? err
                : typeof err === 'object'
                  ? JSON.stringify(err)
                  : String(err)
              : 'Unknown error'

            // 一般的でノイズとなる"Unknown error"は警告レベルでログ
            if (errorMessage === 'Unknown error') {
              console.debug('🔕 Realtime channel error (benign):', errorMessage)
            } else {
              console.warn(
                '⚠️ Realtime channel error (non-critical):',
                errorMessage,
              )
            }

            // CHANNEL_ERRORでは再接続しない（無限ループを防ぐため）
            // クライアントサイドフィルタリングがあるため基本機能は動作する
          } else if (status === 'TIMED_OUT') {
            console.warn('⏰ Bookmark realtime connection timed out')

            // タイムアウト時の再接続を試行
            if (reconnectAttempts < maxReconnectAttempts && !isUnmounted) {
              reconnectAttempts++
              console.log(
                `🔄 Reconnecting after timeout (attempt ${reconnectAttempts}/${maxReconnectAttempts})`,
              )

              // 現在のチャンネルをクリーンアップしてから再接続
              const retryDelay = Math.min(1000 * 2 ** reconnectAttempts, 10000)
              reconnectTimeoutId = setTimeout(() => {
                if (!isUnmounted) {
                  // setupRealtime内でクリーンアップされるため、ここでは不要
                  setupRealtime()
                }
              }, retryDelay)
            } else {
              console.warn(
                '⚠️ Realtime connection failed after max attempts, continuing without realtime updates',
              )
            }
          } else if (status === 'CLOSED') {
            console.warn(
              '🔐 Bookmark realtime connection closed for channel:',
              channelName,
            )

            // 予期しない切断時の再接続
            if (reconnectAttempts < maxReconnectAttempts && !isUnmounted) {
              reconnectAttempts++
              console.log(
                `🔄 Reconnecting after unexpected closure (attempt ${reconnectAttempts}/${maxReconnectAttempts})`,
              )
              const retryDelay = Math.min(1000 * 2 ** reconnectAttempts, 10000)
              reconnectTimeoutId = setTimeout(() => {
                if (!isUnmounted) {
                  // setupRealtime内でクリーンアップされるため、ここでは不要
                  setupRealtime()
                }
              }, retryDelay)
            } else {
              console.warn(
                '⚠️ Realtime connection closed after max attempts, continuing without realtime updates',
              )
            }
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

          // エラーの詳細ログは重要な場合のみ出力
          if (err && status !== 'CHANNEL_ERROR') {
            const errorMessage = err
              ? typeof err === 'string'
                ? err
                : String(err)
              : 'undefined'

            // CHANNEL_ERROR以外の重要なエラーのみログ出力
            if (errorMessage !== 'Unknown error') {
              console.error('📛 Realtime error details:', {
                error: errorMessage,
                status,
                channelName,
              })
            }
          }
        })

      return () => {
        console.log(
          '🔌 Unsubscribing from bookmark realtime channel:',
          channelName,
        )
        if (currentChannel === channel) {
          currentChannel = null
        }
        channel.unsubscribe()
      }
    }

    // 初回接続
    const initialCleanup = setupRealtime()

    // useEffect全体のクリーンアップ関数
    return () => {
      console.log('🧹 Cleaning up bookmark realtime connection')
      isUnmounted = true

      // 保留中の再接続タイマーをクリア
      if (reconnectTimeoutId) {
        clearTimeout(reconnectTimeoutId)
        reconnectTimeoutId = null
      }

      // チャンネルのクリーンアップ
      initialCleanup()

      // 現在のチャンネル参照もクリア
      if (currentChannel) {
        currentChannel.unsubscribe()
        currentChannel = null
      }
    }
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
      setAllBookmarks((prev) => [tempBookmark, ...prev])
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
        setAllBookmarks((prev) => {
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
        setAllBookmarks((prev) =>
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
      setAllBookmarks((prev) =>
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
        setAllBookmarks((prev) => {
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
            setAllBookmarks((prev) =>
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
          setAllBookmarks((prev) =>
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
    setAllBookmarks((prev) => {
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
          setAllBookmarks((prev) =>
            prev.filter((bookmark) => bookmark.id !== id),
          )
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
        setAllBookmarks((prev) =>
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
    allBookmarks,
    loading,
    error,
    createBookmark,
    updateBookmark,
    deleteBookmark,
    refetch: fetchAllBookmarks, // 手動リフレッシュが必要な場合
  }
}
