import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '@/components/common/auth-provider'
import { supabase } from '@/lib/supabase'

// タグの基本型（database.tsから取得予定）
export interface TagRow {
  id: string
  user_id: string
  name: string
  color: string
  parent_tag_id: string | null
  display_order: number
  created_at: string
}

// 階層構造を持つタグ型
export interface TagWithChildren extends TagRow {
  children?: TagWithChildren[]
  level: number
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
  const [tagsTree, setTagsTree] = useState<TagWithChildren[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        .order('parent_tag_id', { ascending: true, nullsFirst: true }) // 親タグを先に
        .order('display_order', { ascending: true }) // 同階層内の順序

      if (error) throw error

      const tagData = data || []
      setTags(tagData)
      setTagsTree(buildTagTree(tagData))
      setError(null)
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

            const currentTags = tagsRef.current
            console.log('📦 Current tags in state:', currentTags.length)

            // ユーザーIDチェック（セキュリティ）
            const tagUserId = realtimePayload.new?.user_id || realtimePayload.old?.user_id
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

                  // 楽観的削除の確認
                  const existingTag = currentTags.find(
                    (t) => t.id === deletedTag.id,
                  )
                  if (!existingTag) {
                    console.log(
                      '🤝 Realtime DELETE confirms optimistic deletion:',
                      deletedTag.id,
                    )
                  } else {
                    console.log(
                      '⚡ Realtime DELETE from external source (extension, etc):',
                      deletedTag.id,
                    )
                  }

                  console.log('✅ Removing tag from state via realtime')
                  setTags((current) => {
                    const updated = current.filter(
                      (t) => t.id !== deletedTag.id,
                    )
                    setTagsTree(buildTagTree(updated))
                    return updated
                  })
                  break
                }

                case 'INSERT': {
                  if (!realtimePayload.new) return
                  const newTag = realtimePayload.new
                  console.log('📝 Processing INSERT event for tag:', newTag.id)

                  // 重複チェック（楽観的追加との重複回避）
                  const existingTag = currentTags.find(
                    (t) => t.id === newTag.id,
                  )
                  if (existingTag) {
                    console.log(
                      '🤝 Realtime INSERT confirms optimistic creation:',
                      newTag.id,
                    )
                    // 既存のタグを新しいデータで更新（サーバーからの正式データで置換）
                    setTags((current) => {
                      const updated = current.map((t) =>
                        t.id === newTag.id ? newTag : t,
                      )
                      setTagsTree(buildTagTree(updated))
                      return updated
                    })
                  } else {
                    console.log('✨ Adding new tag to state from realtime')
                    setTags((current) => {
                      const updated = [...current, newTag]
                      setTagsTree(buildTagTree(updated))
                      return updated
                    })
                  }
                  break
                }

                case 'UPDATE': {
                  if (!realtimePayload.new) return
                  const updatedTag = realtimePayload.new
                  console.log(
                    '✏️ Processing UPDATE event for tag:',
                    updatedTag.id,
                  )

                  // 楽観的更新の確認
                  const existingTag = currentTags.find(
                    (t) => t.id === updatedTag.id,
                  )
                  if (existingTag) {
                    console.log(
                      '🤝 Realtime UPDATE confirms optimistic update:',
                      updatedTag.id,
                    )
                  } else {
                    console.log(
                      '⚡ Realtime UPDATE from external source (extension, etc):',
                      updatedTag.id,
                    )
                  }

                  console.log('✅ Applying tag update from realtime')
                  setTags((current) => {
                    const updated = current.map((t) =>
                      t.id === updatedTag.id ? updatedTag : t,
                    )
                    setTagsTree(buildTagTree(updated))
                    return updated
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
    async (data: {
      name: string
      color?: string
      parent_tag_id?: string | null
      display_order?: number
    }) => {
      if (!user) throw new Error('認証が必要です')

      // 1. 楽観的追加：テンポラリIDで即座にstateに追加
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
      const tempTag: TagRow = {
        id: tempId,
        user_id: user.id,
        name: data.name,
        color: data.color || '#6366f1',
        parent_tag_id: data.parent_tag_id || null,
        display_order: data.display_order || 0,
        created_at: new Date().toISOString(),
      }

      console.log('🎯 Optimistically adding tag:', tempTag.id)
      setTags((current) => {
        const updated = [...current, tempTag]
        setTagsTree(buildTagTree(updated))
        return updated
      })

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

        // 注意：Realtimeイベントが先に到着する可能性があるため、tempIdが存在するかチェック
        setTags((current) => {
          const tempExists = current.find((t) => t.id === tempId)
          if (!tempExists) {
            console.log(
              '⚡ Temp tag already replaced by realtime, keeping current state',
            )
            return current
          }

          console.log(
            '🔄 Replacing temp tag with server data:',
            tempId,
            '->',
            newTag.id,
          )
          const updated = current.map((t) => (t.id === tempId ? newTag : t))
          setTagsTree(buildTagTree(updated))
          return updated
        })

        return newTag
      } catch (err) {
        // エラー時は楽観的追加を取り消し
        console.log('❌ Rolling back optimistic tag addition:', tempId)
        setTags((current) => {
          const updated = current.filter((t) => t.id !== tempId)
          setTagsTree(buildTagTree(updated))
          return updated
        })

        const errorMessage =
          err instanceof Error ? err.message : 'タグの作成に失敗しました'
        setError(errorMessage)
        throw new Error(errorMessage)
      }
    },
    [user],
  )

  const updateTag = useCallback(
    async (id: string, updates: Partial<TagRow>) => {
      if (!user) throw new Error('認証が必要です')

      // 1. 楽観的更新：即座にstateを更新
      const originalTag = tagsRef.current.find((t) => t.id === id)
      if (!originalTag) {
        throw new Error('更新対象のタグが見つかりません')
      }

      const optimisticTag: TagRow = { ...originalTag, ...updates }

      console.log('🎯 Optimistically updating tag:', id)
      setTags((current) => {
        const updated = current.map((t) => (t.id === id ? optimisticTag : t))
        setTagsTree(buildTagTree(updated))
        return updated
      })

      try {
        const { data: updatedTag, error } = await supabase
          .from('tags')
          .update(updates)
          .eq('id', id)
          .eq('user_id', user.id) // 安全のためuser_idもチェック
          .select()
          .single()

        if (error) throw error

        // 注意：Realtimeイベントが先に到着する可能性があるため、チェック
        setTags((current) => {
          const currentTag = current.find((t) => t.id === id)
          if (!currentTag) {
            console.log(
              '⚡ Optimistic update already replaced by realtime, keeping current state',
            )
            return current
          }

          console.log('🔄 Replacing optimistic update with server data:', id)
          const updated = current.map((t) => (t.id === id ? updatedTag : t))
          setTagsTree(buildTagTree(updated))
          return updated
        })

        console.log('⏳ Waiting for Realtime UPDATE event to confirm update...')

        // 5秒後にRealtimeイベントが来なかった場合の保険
        setTimeout(() => {
          setTags((current) => {
            const hasBeenUpdated = current.find(
              (t) => t.id === id && t.name === updatedTag.name,
            )
            if (!hasBeenUpdated) {
              console.log(
                '⚠️ Realtime UPDATE event not received after 5 seconds, forcing local update',
              )
              const updated = current.map((t) => (t.id === id ? updatedTag : t))
              setTagsTree(buildTagTree(updated))
              return updated
            }
            return current
          })
        }, 5000)

        return updatedTag
      } catch (err) {
        // エラー時は楽観的更新を取り消し
        // Realtimeで既に更新されている可能性をチェック
        const currentTag = tagsRef.current.find((t) => t.id === id)
        if (
          currentTag &&
          JSON.stringify(currentTag) !== JSON.stringify(originalTag)
        ) {
          console.log('⚡ Tag already updated by realtime, not rolling back')
          // Realtimeで既に更新済みの場合は、エラーを記録するが復旧しない
          console.log(
            '📊 Concurrent update detected - API failed but realtime succeeded',
          )
        } else {
          console.log('❌ Rolling back optimistic tag update:', id)
          setTags((current) => {
            const updated = current.map((t) => (t.id === id ? originalTag : t))
            setTagsTree(buildTagTree(updated))
            return updated
          })
        }

        const errorMessage =
          err instanceof Error ? err.message : 'タグの更新に失敗しました'
        setError(errorMessage)
        throw new Error(errorMessage)
      }
    },
    [user],
  )

  const deleteTag = useCallback(
    async (id: string) => {
      if (!user) throw new Error('認証が必要です')

      // 1. 削除対象のタグを保存（復旧用）
      const originalTag = tagsRef.current.find((t) => t.id === id)
      if (!originalTag) {
        throw new Error('削除対象のタグが見つかりません')
      }

      // 2. 楽観的削除：即座にstateから削除
      console.log('🎯 Optimistically deleting tag:', id)
      setTags((current) => {
        const updated = current.filter((t) => t.id !== id)
        setTagsTree(buildTagTree(updated))
        return updated
      })

      try {
        const { error } = await supabase
          .from('tags')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id) // 安全のためuser_idもチェック

        if (error) throw error

        console.log(
          '⏳ Waiting for Realtime DELETE event to confirm deletion...',
        )

        // 5秒後にRealtimeイベントが来なかった場合の保険
        setTimeout(() => {
          setTags((current) => {
            const stillExists = current.find((t) => t.id === id)
            if (stillExists) {
              console.log(
                '⚠️ Realtime DELETE event not received after 5 seconds, forcing local deletion',
              )
              const updated = current.filter((t) => t.id !== id)
              setTagsTree(buildTagTree(updated))
              return updated
            }
            return current
          })
        }, 5000)
      } catch (err) {
        // エラー時は楽観的削除を取り消し
        // Realtimeで既に削除されている可能性をチェック
        const currentTag = tagsRef.current.find((t) => t.id === id)
        if (!currentTag) {
          console.log('⚡ Tag already deleted by realtime, not rolling back')
          // Realtimeで既に削除済みの場合は、エラーを記録するが復旧しない
          console.log(
            '📊 Concurrent deletion detected - API failed but realtime succeeded',
          )
        } else {
          console.log('❌ Rolling back optimistic tag deletion:', id)
          setTags((current) => {
            const updated = [...current, originalTag]
            setTagsTree(buildTagTree(updated))
            return updated
          })
        }

        const errorMessage =
          err instanceof Error ? err.message : 'タグの削除に失敗しました'
        setError(errorMessage)
        throw new Error(errorMessage)
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
    tagsTree,
    loading,
    error,
    createTag,
    updateTag,
    deleteTag,
    reorderTags,
    refetch: fetchTags,
  }
}

// タグ階層ツリー構築ユーティリティ関数
function buildTagTree(tags: TagRow[]): TagWithChildren[] {
  const tagMap = new Map<string, TagWithChildren>()
  const rootTags: TagWithChildren[] = []

  // 1. マップ作成（全タグを初期化）
  tags.forEach((tag) => {
    tagMap.set(tag.id, { ...tag, children: [], level: 0 })
  })

  // 2. 階層構築
  tags.forEach((tag) => {
    const tagWithChildren = tagMap.get(tag.id)
    if (!tagWithChildren) return

    if (tag.parent_tag_id) {
      // 子タグの場合
      const parent = tagMap.get(tag.parent_tag_id)
      if (parent) {
        parent.children = parent.children || []
        parent.children.push(tagWithChildren)
        tagWithChildren.level = parent.level + 1

        // 親タグ内でdisplay_orderでソート
        parent.children.sort((a, b) => a.display_order - b.display_order)
      } else {
      }
    } else {
      // ルートタグの場合
      rootTags.push(tagWithChildren)
    }
  })

  // 3. ルートレベルでもdisplay_orderでソート
  rootTags.sort((a, b) => a.display_order - b.display_order)

  return rootTags
}
