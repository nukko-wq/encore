'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
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

  // 権限確認のヘルパー関数
  const verifyPermissions = useCallback(
    async (tagId: string) => {
      if (!user || !bookmarkId)
        return { canAccess: false, reason: '認証が必要です' }

      try {
        console.log('🔍 Verifying permissions for:', {
          tagId,
          bookmarkId,
          userId: user.id,
        })

        // ブックマークの権限確認
        const { data: bookmarkData, error: bookmarkError } = await supabase
          .from('bookmarks')
          .select('id, user_id')
          .eq('id', bookmarkId)
          .eq('user_id', user.id)
          .single()

        if (bookmarkError || !bookmarkData) {
          console.log('❌ Bookmark access denied:', bookmarkError)
          return {
            canAccess: false,
            reason: 'ブックマークにアクセスできません',
          }
        }

        // タグの権限確認
        const { data: tagData, error: tagError } = await supabase
          .from('tags')
          .select('id, user_id, name')
          .eq('id', tagId)
          .eq('user_id', user.id)
          .single()

        if (tagError || !tagData) {
          console.log('❌ Tag access denied:', tagError)
          return { canAccess: false, reason: 'タグにアクセスできません' }
        }

        console.log('✅ Permissions verified:', {
          bookmark: bookmarkData,
          tag: tagData,
        })
        return { canAccess: true, reason: 'OK' }
      } catch (err) {
        console.error('💥 Permission verification failed:', err)
        return { canAccess: false, reason: '権限確認に失敗しました' }
      }
    },
    [user, bookmarkId],
  )

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
        .map((bt) => bt.tags)
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

      console.log('🏷️ Adding tag to bookmark:', {
        tagId,
        bookmarkId,
        userId: user.id,
      })

      // 既に追加済みかチェック
      const isAlreadyAdded = bookmarkTags.some((bt) => bt.tag_id === tagId)
      if (isAlreadyAdded) {
        console.log('✅ Tag already added, skipping')
        return
      }

      try {
        // 事前権限確認
        const permissionCheck = await verifyPermissions(tagId)
        if (!permissionCheck.canAccess) {
          throw new Error(`権限エラー: ${permissionCheck.reason}`)
        }

        console.log('🔄 Inserting bookmark_tag record...')
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

        if (error) {
          console.error('❌ Supabase error details:', {
            error,
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
          })
          throw error
        }

        console.log('✅ Tag added successfully:', data)

        // 成功時のみ楽観的更新（Realtimeで更新されるので実際にはこれも不要だが、UX向上のため）
        setBookmarkTags((prev) => [...prev, data])
        if (data.tags) {
          setTags((prev) => [...prev, data.tags as TagRow])
        }
      } catch (err) {
        console.error('💥 Failed to add tag:', {
          error: err,
          tagId,
          bookmarkId,
          userId: user.id,
        })

        const errorMessage =
          err instanceof Error ? err.message : 'タグの追加に失敗しました'
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

      const targetBookmarkTag = bookmarkTags.find((bt) => bt.tag_id === tagId)
      if (!targetBookmarkTag) return

      try {
        const { error } = await supabase
          .from('bookmark_tags')
          .delete()
          .eq('id', targetBookmarkTag.id)

        if (error) throw error

        // 成功時のみ楽観的更新
        setBookmarkTags((prev) => prev.filter((bt) => bt.tag_id !== tagId))
        setTags((prev) => prev.filter((tag) => tag.id !== tagId))
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'タグの削除に失敗しました'
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
