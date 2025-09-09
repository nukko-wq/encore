'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase-client'
import { useAuth } from '@/components/common/auth-provider'
import type { BookmarkTag, CreateBookmarkTagData } from '@/types/database'
import type { TagRow } from './use-tags'

interface BookmarkTagsResult {
  bookmarkTags: BookmarkTag[]
  tags: TagRow[]
  loading: boolean
  error: string | null
  addTag: (tagId: string) => Promise<void>
  removeTag: (tagId: string) => Promise<void>
  refetch: () => void
}

export function useBookmarkTags(bookmarkId: string): BookmarkTagsResult {
  const { user } = useAuth()
  const [bookmarkTags, setBookmarkTags] = useState<BookmarkTag[]>([])
  const [tags, setTags] = useState<TagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBookmarkTags = useCallback(async () => {
    if (!user || !bookmarkId) return

    try {
      setLoading(true)
      
      // ブックマークのタグ関連データを取得（JOINクエリ）
      const { data, error } = await supabase
        .from('bookmark_tags')
        .select(`
          *,
          tags (
            id,
            name,
            color,
            parent_tag_id,
            display_order,
            created_at
          )
        `)
        .eq('bookmark_id', bookmarkId)

      if (error) throw error

      const bookmarkTagsData = data || []
      const tagsData = bookmarkTagsData
        .map(bt => bt.tags)
        .filter(Boolean) as TagRow[]

      setBookmarkTags(bookmarkTagsData)
      setTags(tagsData)
      setError(null)
    } catch (err) {
      console.error('Error fetching bookmark tags:', err)
      setError(err instanceof Error ? err.message : 'タグの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [user, bookmarkId])

  // 初回データ取得
  useEffect(() => {
    if (user && bookmarkId) {
      fetchBookmarkTags()
    }
  }, [fetchBookmarkTags, user, bookmarkId])

  // Supabase Realtimeでリアルタイム更新
  useEffect(() => {
    if (!user || !bookmarkId) return

    const setupRealtime = () => {
      const channel = supabase
        .channel(`bookmark-tags-${bookmarkId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookmark_tags',
            filter: `bookmark_id=eq.${bookmarkId}`,
          },
          (payload) => {
            console.log('Realtime bookmark_tags change:', payload)
            // 楽観的更新と競合しないよう、少し遅延して再取得
            setTimeout(() => {
              fetchBookmarkTags()
            }, 500)
          },
        )
        .subscribe((status) => {
          console.log('Bookmark tags realtime subscription status:', status)
        })

      return () => {
        console.log('Unsubscribing from bookmark tags realtime channel')
        channel.unsubscribe()
      }
    }

    const cleanup = setupRealtime()
    return cleanup
  }, [user, bookmarkId, fetchBookmarkTags])

  // タグ追加（楽観的更新）
  const addTag = useCallback(
    async (tagId: string) => {
      if (!user || !bookmarkId) throw new Error('認証が必要です')

      // 既に追加済みかチェック
      const isAlreadyAdded = bookmarkTags.some(bt => bt.tag_id === tagId)
      if (isAlreadyAdded) return

      try {
        const { data, error } = await supabase
          .from('bookmark_tags')
          .insert({
            bookmark_id: bookmarkId,
            tag_id: tagId,
          })
          .select(`
            *,
            tags (
              id,
              name,
              color,
              parent_tag_id,
              display_order,
              created_at
            )
          `)
          .single()

        if (error) throw error

        // 成功時のみ楽観的更新（Realtimeで更新されるので実際にはこれも不要だが、UX向上のため）
        setBookmarkTags(prev => [...prev, data])
        if (data.tags) {
          setTags(prev => [...prev, data.tags as TagRow])
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'タグの追加に失敗しました'
        setError(errorMessage)
        throw new Error(errorMessage)
      }
    },
    [user, bookmarkId, bookmarkTags],
  )

  // タグ削除（楽観的更新）
  const removeTag = useCallback(
    async (tagId: string) => {
      if (!user || !bookmarkId) throw new Error('認証が必要です')

      const targetBookmarkTag = bookmarkTags.find(bt => bt.tag_id === tagId)
      if (!targetBookmarkTag) return

      try {
        const { error } = await supabase
          .from('bookmark_tags')
          .delete()
          .eq('id', targetBookmarkTag.id)

        if (error) throw error

        // 成功時のみ楽観的更新
        setBookmarkTags(prev => prev.filter(bt => bt.tag_id !== tagId))
        setTags(prev => prev.filter(tag => tag.id !== tagId))
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'タグの削除に失敗しました'
        setError(errorMessage)
        throw new Error(errorMessage)
      }
    },
    [user, bookmarkId, bookmarkTags],
  )

  return {
    bookmarkTags,
    tags,
    loading,
    error,
    addTag,
    removeTag,
    refetch: fetchBookmarkTags,
  }
}