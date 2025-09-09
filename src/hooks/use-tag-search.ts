'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTags } from './use-tags'
import type { TagRow } from './use-tags'

interface TagSearchResult {
  searchQuery: string
  setSearchQuery: (query: string) => void
  filteredTags: TagRow[]
  frequentTags: TagRow[]
  showCreateOption: boolean
  createNewTag: (name: string, color?: string) => Promise<TagRow>
  isLoading: boolean
  error: string | null
}

// デバウンス用のカスタムフック
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export function useTagSearch(): TagSearchResult {
  const { tags, createTag, loading: tagsLoading, error: tagsError } = useTags()
  const [searchQuery, setSearchQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  
  // 300ms デバウンス
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // よく使うタグの抽出（仮実装：作成日順で最新の5個）
  const frequentTags = useMemo(() => {
    return [...tags]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
  }, [tags])

  // 検索結果のフィルタリング
  const filteredTags = useMemo(() => {
    if (!debouncedSearchQuery.trim()) {
      return tags
    }

    const query = debouncedSearchQuery.toLowerCase()
    return tags.filter(tag => 
      tag.name.toLowerCase().includes(query)
    )
  }, [tags, debouncedSearchQuery])

  // 新規作成オプションの表示判定
  const showCreateOption = useMemo(() => {
    if (!searchQuery.trim()) return false
    
    // 既存のタグと完全一致する場合は新規作成オプションを表示しない
    const exactMatch = tags.some(tag => 
      tag.name.toLowerCase() === searchQuery.toLowerCase()
    )
    
    return !exactMatch
  }, [searchQuery, tags])

  // 新規タグ作成
  const createNewTag = useCallback(
    async (name: string, color = '#6366f1') => {
      if (!name.trim()) {
        throw new Error('タグ名を入力してください')
      }

      // 重複チェック
      const existingTag = tags.find(tag => 
        tag.name.toLowerCase() === name.toLowerCase()
      )
      if (existingTag) {
        throw new Error('同じ名前のタグが既に存在します')
      }

      setIsCreating(true)
      try {
        const newTag = await createTag({
          name: name.trim(),
          color,
          parent_tag_id: null,
          display_order: 0,
        })
        
        // 検索クエリをクリア
        setSearchQuery('')
        return newTag
      } catch (error) {
        throw error
      } finally {
        setIsCreating(false)
      }
    },
    [tags, createTag],
  )

  return {
    searchQuery,
    setSearchQuery,
    filteredTags,
    frequentTags,
    showCreateOption,
    createNewTag,
    isLoading: tagsLoading || isCreating,
    error: tagsError,
  }
}