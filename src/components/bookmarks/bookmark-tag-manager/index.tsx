'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Button,
} from 'react-aria-components'
import { useBookmarkTags } from '@/hooks/use-bookmark-tags'
import { useTagSearch } from '@/hooks/use-tag-search'
import CurrentTagsList from './current-tags-list'
import TagSearchInput from './tag-search-input'
import TagSuggestions from './tag-suggestions'
import TagColorPicker from './tag-color-picker'
import type { Bookmark } from '@/types/database'

interface BookmarkTagManagerProps {
  bookmark: Bookmark
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

export default function BookmarkTagManager({
  bookmark,
  isOpen,
  onOpenChange,
}: BookmarkTagManagerProps) {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [newTagColor, setNewTagColor] = useState('#6366f1')
  const popoverRef = useRef<HTMLDivElement>(null)

  const {
    tags: currentTags,
    loading: tagsLoading,
    error: tagsError,
    addTag,
    removeTag,
  } = useBookmarkTags(bookmark.id)

  const {
    searchQuery,
    setSearchQuery,
    filteredTags,
    frequentTags,
    showCreateOption,
    createNewTag,
    isLoading: searchLoading,
    error: searchError,
  } = useTagSearch()

  // 現在付いているタグのIDセット（高速検索用）- useMemoで最適化
  const currentTagIds = useMemo(() => {
    return new Set(currentTags.map(tag => tag.id))
  }, [currentTags])

  // タグ選択/削除のハンドラー
  const handleTagToggle = useCallback(
    async (tagId: string) => {
      try {
        // 最新のcurrentTagsを直接チェックして依存関係の問題を回避
        const isCurrentlyTagged = currentTags.some(tag => tag.id === tagId)
        if (isCurrentlyTagged) {
          await removeTag(tagId)
        } else {
          await addTag(tagId)
        }
      } catch (error) {
        console.error('Failed to toggle tag:', error)
      }
    },
    [currentTags, addTag, removeTag],
  )

  // 新規タグ作成
  const handleCreateNewTag = useCallback(
    async (name: string) => {
      try {
        const newTag = await createNewTag(name, newTagColor)
        // 作成したタグを即座にブックマークに追加
        await addTag(newTag.id)
        setShowColorPicker(false)
        setNewTagColor('#6366f1')
      } catch (error) {
        console.error('Failed to create tag:', error)
      }
    },
    [createNewTag, newTagColor, addTag],
  )

  // Escapeキーでポップオーバーを閉じる & フォーカス管理
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault()
        onOpenChange(false)
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      // フォーカスをダイアログ内に移動
      if (popoverRef.current) {
        popoverRef.current.focus()
      }
      // bodyのスクロールを無効化
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // bodyのスクロールを復元
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onOpenChange])

  // ポップオーバーが閉じられた時の状態リセット
  const handleOpenChange = useCallback(
    (open: boolean) => {
      onOpenChange(open)
      if (!open) {
        setSearchQuery('')
        setShowColorPicker(false)
        setNewTagColor('#6366f1')
      }
    },
    [onOpenChange, setSearchQuery],
  )

  const isLoading = tagsLoading || searchLoading
  const error = tagsError || searchError

  if (!isOpen) return null

  // Portal を使用してbody要素に直接レンダリング
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-16">
      {/* オーバーレイ */}
      <div 
        className="fixed inset-0 bg-black/25"
        onClick={() => handleOpenChange(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleOpenChange(false)
          }
        }}
        role="button"
        tabIndex={0}
        aria-label="ダイアログを閉じる"
      />
      
      {/* ポップオーバーコンテンツ */}
      <div
        ref={popoverRef}
        className="relative min-w-80 max-w-96 bg-white rounded-lg shadow-xl ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95 duration-200 outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-manager-title"
        tabIndex={-1}
      >
        <div className="p-4 space-y-4">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <h3 id="tag-manager-title" className="text-sm font-medium text-gray-900">
              タグを管理
            </h3>
            <Button
              onPress={() => handleOpenChange(false)}
              className="w-6 h-6 rounded-full hover:bg-gray-100 flex items-center justify-center outline-none"
              aria-label="閉じる"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Button>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          {/* 現在のタグ表示 */}
          <CurrentTagsList
            tags={currentTags}
            onRemove={handleTagToggle}
            isLoading={isLoading}
          />

          {/* 検索入力 */}
          <TagSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            onCreateNew={showCreateOption ? handleCreateNewTag : undefined}
            placeholder="タグを検索または新規作成..."
            disabled={isLoading}
          />

          {/* 色選択（新規作成時） */}
          {showCreateOption && (
            <TagColorPicker
              isOpen={showColorPicker}
              onOpenChange={setShowColorPicker}
              selectedColor={newTagColor}
              onColorChange={setNewTagColor}
            />
          )}

          {/* タグ候補リスト */}
          <TagSuggestions
            allTags={filteredTags}
            frequentTags={frequentTags}
            selectedTagIds={currentTagIds}
            searchQuery={searchQuery}
            onTagSelect={handleTagToggle}
            showCreateOption={showCreateOption}
            onCreateNew={handleCreateNewTag}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>,
    document.body
  )
}