import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/common/auth-provider'
import { supabase } from '@/lib/supabase'

// タグの基本型（database.tsから取得予定）
export interface TagRow {
  id: string
  user_id: string
  name: string
  color: string
  display_order: number
  created_at: string
}

// Realtime ペイロードの型定義
interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new?: TagRow
  old?: TagRow
}

export function useTags() {
  const { user } = useAuth()
  const [tags, setTags] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // デバッグ: 最小限のログ
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 useTags:', {
      hasUser: !!user,
      loading,
      tagsCount: tags.length,
    })
  }

  // stale closure対策：常に最新のtags状態をrefで保持
  const tagsRef = useRef(tags)
  tagsRef.current = tags

  // タグ取得関数（useCallbackで依存関係を管理）
  const fetchTags = useCallback(async () => {
    if (!user) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('user_id', user.id)
        .order('display_order', { ascending: true }) // 表示順序

      if (error) throw error

      const tagData = data || []
      setTags(tagData)
      setError(null)

      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Tags fetched successfully:', { count: tagData.length })
      }
    } catch (err) {
      console.error('Error fetching tags:', err)
      setError(err instanceof Error ? err.message : 'タグの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [user])

  // 初回タグ取得
  useEffect(() => {
    if (user) {
      fetchTags()
    }
  }, [fetchTags, user])

  // フォールバック: loadingが長時間trueの場合に強制解除
  useEffect(() => {
    if (!loading) return

    const fallbackTimeout = setTimeout(() => {
      console.warn('⚠️ Loading timeout reached, forcing loading to false')
      setLoading(false)
      setError(
        'タグの読み込みがタイムアウトしました。ページをリロードしてください。',
      )
    }, 10000)

    return () => clearTimeout(fallbackTimeout)
  }, [loading])

  // Supabase Realtimeでリアルタイム更新（フィルターなし、クライアント側で処理）
  useEffect(() => {
    if (!user) return

    const setupRealtime = () => {
      console.log('🔧 Setting up Realtime for tags user:', user.id)
      const channelName = `tags-changes-${user.id}`
      console.log('📻 Creating tags channel:', channelName)

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tags',
          },
          (payload) => {
            const realtimePayload = payload as unknown as RealtimePayload
            console.log('🔔 Realtime event received:', {
              event: realtimePayload.eventType,
              new: realtimePayload.new,
              old: realtimePayload.old,
            })

            console.log('📦 Realtime event triggered')

            // ユーザーIDチェック（セキュリティ）
            const tagUserId =
              realtimePayload.new?.user_id || realtimePayload.old?.user_id
            if (tagUserId !== user.id) {
              console.log('🚫 Ignoring event for different user:', tagUserId)
              return
            }

            try {
              switch (realtimePayload.eventType) {
                case 'DELETE': {
                  if (!realtimePayload.old) return
                  const deletedTag = realtimePayload.old
                  console.log(
                    '🗑️ Processing DELETE event for tag:',
                    deletedTag.id,
                  )

                  setTags((current) => {
                    console.log('✅ Removing tag from state via Realtime')
                    return current.filter((t) => t.id !== deletedTag.id)
                  })
                  break
                }

                case 'INSERT': {
                  if (!realtimePayload.new) return
                  const newTag = realtimePayload.new
                  console.log('📝 Processing INSERT event for tag:', newTag.id)

                  setTags((current) => {
                    // 既存のタグをIDでチェック
                    const existingTagById = current.find(
                      (t) => t.id === newTag.id,
                    )

                    if (existingTagById) {
                      console.log('🤝 Tag already exists, skipping:', newTag.id)
                      return current
                    }

                    console.log('✨ Adding new tag from Realtime:', newTag.id)
                    return [...current, newTag]
                  })
                  break
                }

                case 'UPDATE': {
                  if (!realtimePayload.new) return
                  const updatedTag = realtimePayload.new
                  console.log(
                    '✏️ Processing UPDATE event for tag:',
                    updatedTag.id,
                  )

                  setTags((current) => {
                    console.log('✅ Applying tag update from Realtime')
                    return current.map((t) =>
                      t.id === updatedTag.id ? updatedTag : t,
                    )
                  })
                  break
                }

                default:
                  console.log(
                    '❓ Unknown realtime event type:',
                    realtimePayload.eventType,
                  )
              }
            } catch (error) {
              console.error('💥 Error processing realtime tag change:', error)
            }
          },
        )
        .subscribe((status, err) => {
          console.log('📡 Tag realtime subscription status:', status)

          if (status === 'SUBSCRIBED') {
            console.log(
              '✅ Tag realtime connected successfully for channel:',
              channelName,
            )
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Tag realtime channel error:', err)
          } else if (status === 'TIMED_OUT') {
            console.error('⏰ Tag realtime connection timed out')
          } else if (status === 'CLOSED') {
            console.log(
              '🔐 Tag realtime connection closed for channel:',
              channelName,
            )
          } else {
            console.log(
              '🔄 Connecting to tag realtime for channel:',
              channelName,
            )
            console.log('📊 Tag realtime status:', status)
          }

          if (err) {
            console.error('🗃️ Tag realtime error details:', err)
          }
        })

      return () => {
        console.log('🔌 Unsubscribing from tag realtime channel:', channelName)
        supabase.removeChannel(channel)
      }
    }

    const cleanup = setupRealtime()
    return cleanup
  }, [user])

  const createTag = useCallback(
    async (data: { name: string; color?: string; display_order?: number }) => {
      if (!user) throw new Error('認証が必要です')

      console.log('🚀 Creating tag via API:', {
        name: data.name,
        color: data.color || '#6366f1',
      })

      setIsCreating(true)
      try {
        const { data: newTag, error } = await supabase
          .from('tags')
          .insert({
            ...data,
            user_id: user.id,
            color: data.color || '#6366f1',
          })
          .select()
          .single()

        if (error) throw error

        console.log('✅ Tag created successfully:', {
          id: newTag.id,
          name: newTag.name,
          message: 'Waiting for Realtime event to update UI...',
        })

        return newTag
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'タグの作成に失敗しました'
        setError(errorMessage)
        throw new Error(errorMessage)
      } finally {
        setIsCreating(false)
      }
    },
    [user],
  )

  const updateTag = useCallback(
    async (id: string, updates: Partial<TagRow>) => {
      if (!user) throw new Error('認証が必要です')

      console.log('🚀 Updating tag via API:', {
        id,
        updates,
      })

      setIsUpdating(true)
      try {
        const { data: updatedTag, error } = await supabase
          .from('tags')
          .update(updates)
          .eq('id', id)
          .eq('user_id', user.id) // 安全のためuser_idもチェック
          .select()
          .single()

        if (error) throw error

        console.log('✅ Tag updated successfully:', {
          id: updatedTag.id,
          name: updatedTag.name,
          message: 'Waiting for Realtime event to update UI...',
        })

        return updatedTag
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'タグの更新に失敗しました'
        setError(errorMessage)
        throw new Error(errorMessage)
      } finally {
        setIsUpdating(false)
      }
    },
    [user],
  )

  const deleteTag = useCallback(
    async (id: string) => {
      if (!user) throw new Error('認証が必要です')

      console.log('🚀 Deleting tag via API:', id)

      setIsDeleting(true)
      try {
        const { error } = await supabase
          .from('tags')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id) // 安全のためuser_idもチェック

        if (error) throw error

        console.log('✅ Tag deleted successfully:', {
          id,
          message: 'Waiting for Realtime event to update UI...',
        })
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'タグの削除に失敗しました'
        setError(errorMessage)
        throw new Error(errorMessage)
      } finally {
        setIsDeleting(false)
      }
    },
    [user],
  )

  // タグの並び順更新
  const reorderTags = useCallback(
    async (updates: { id: string; display_order: number }[]) => {
      if (!user) throw new Error('認証が必要です')

      try {
        // バッチ更新の実行
        const promises = updates.map(
          (update) =>
            supabase
              .from('tags')
              .update({ display_order: update.display_order })
              .eq('id', update.id)
              .eq('user_id', user.id), // 安全のためuser_idもチェック
        )

        await Promise.all(promises)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'タグの並び順更新に失敗しました'
        setError(errorMessage)
        throw new Error(errorMessage)
      }
    },
    [user],
  )

  return {
    tags,
    loading,
    isCreating,
    isUpdating,
    isDeleting,
    error,
    createTag,
    updateTag,
    deleteTag,
    reorderTags,
    refetch: fetchTags,
  }
}
