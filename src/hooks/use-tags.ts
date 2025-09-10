import { useCallback, useEffect, useState } from 'react'
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

        // 手動でステート更新（即座反映）
        setTags(prev => [...prev, newTag])
        setError(null)

        console.log('✅ Tag created successfully:', {
          id: newTag.id,
          name: newTag.name,
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

        // 手動でステート更新（即座反映）
        setTags(prev => prev.map(tag => tag.id === id ? updatedTag : tag))
        setError(null)

        console.log('✅ Tag updated successfully:', {
          id: updatedTag.id,
          name: updatedTag.name,
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

        // 手動でステート更新（即座反映）
        setTags(prev => prev.filter(tag => tag.id !== id))
        setError(null)

        console.log('✅ Tag deleted successfully:', { id })
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
        
        // 更新後に再取得してステート更新
        await fetchTags()
        setError(null)
        
        console.log('✅ Tags reordered successfully')
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'タグの並び順更新に失敗しました'
        setError(errorMessage)
        throw new Error(errorMessage)
      }
    },
    [user, fetchTags],
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
