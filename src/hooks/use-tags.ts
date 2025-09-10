import { useCallback, useEffect, useState } from 'react'
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

export function useTags() {
  const { user } = useAuth()
  const [tags, setTags] = useState<TagRow[]>([])
  const [tagsTree, setTagsTree] = useState<TagWithChildren[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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


  const createTag = useCallback(
    async (data: {
      name: string
      color?: string
      parent_tag_id?: string | null
      display_order?: number
    }) => {
      if (!user) throw new Error('認証が必要です')

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
        return newTag
      } catch (err) {
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

      try {
        const { data: updatedTag, error } = await supabase
          .from('tags')
          .update(updates)
          .eq('id', id)
          .eq('user_id', user.id) // 安全のためuser_idもチェック
          .select()
          .single()

        if (error) throw error
        return updatedTag
      } catch (err) {
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

      try {
        const { error } = await supabase
          .from('tags')
          .delete()
          .eq('id', id)
          .eq('user_id', user.id) // 安全のためuser_idもチェック

        if (error) throw error
      } catch (err) {
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
    const tagWithChildren = tagMap.get(tag.id)!

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
