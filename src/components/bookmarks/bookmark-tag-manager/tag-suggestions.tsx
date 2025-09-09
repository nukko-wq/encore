'use client'

import { Button } from 'react-aria-components'
import type { TagRow } from '@/hooks/use-tags'

interface TagSuggestionsProps {
  allTags: TagRow[]
  frequentTags: TagRow[]
  selectedTagIds: Set<string>
  searchQuery: string
  onTagSelect: (tagId: string) => void
  showCreateOption: boolean
  onCreateNew: (name: string) => void
  isLoading?: boolean
}

export default function TagSuggestions({
  allTags,
  frequentTags,
  selectedTagIds,
  searchQuery,
  onTagSelect,
  showCreateOption,
  onCreateNew,
  isLoading = false,
}: TagSuggestionsProps) {
  // 選択されていないタグのみを表示
  const availableFrequentTags = frequentTags.filter(tag => !selectedTagIds.has(tag.id))
  const availableAllTags = allTags.filter(tag => !selectedTagIds.has(tag.id))

  const renderTagButton = (tag: TagRow, isSelected: boolean) => (
    <Button
      key={tag.id}
      onPress={() => onTagSelect(tag.id)}
      isDisabled={isLoading}
      className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all duration-200 outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
        isSelected
          ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-500/20'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
      aria-label={`タグ「${tag.name}」を${isSelected ? '削除' : '追加'}`}
    >
      <div
        className="w-3 h-3 rounded-full flex-shrink-0"
        style={{ backgroundColor: tag.color }}
        aria-hidden="true"
      />
      <span className="truncate">{tag.name}</span>
      {isSelected && (
        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </Button>
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-200 rounded w-24"></div>
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-gray-200 rounded w-20"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-h-60 overflow-y-auto">
      {/* よく使うタグ */}
      {!searchQuery && availableFrequentTags.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
            よく使うタグ
          </h4>
          <div className="flex flex-wrap gap-2">
            {availableFrequentTags.map((tag) => 
              renderTagButton(tag, selectedTagIds.has(tag.id))
            )}
          </div>
        </div>
      )}

      {/* すべてのタグ */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
          {searchQuery ? '検索結果' : 'すべてのタグ'}
        </h4>
        
        {availableAllTags.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-4">
            {searchQuery ? 'タグが見つかりません' : 'タグがありません'}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availableAllTags.map((tag) => 
              renderTagButton(tag, selectedTagIds.has(tag.id))
            )}
          </div>
        )}
      </div>

      {/* 新規作成オプション */}
      {showCreateOption && searchQuery.trim() && (
        <div className="border-t pt-4">
          <Button
            onPress={() => onCreateNew(searchQuery.trim())}
            isDisabled={isLoading}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-green-600 bg-green-50 hover:bg-green-100 rounded-md outline-none transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            新しいタグ「{searchQuery.trim()}」を作成
          </Button>
        </div>
      )}
    </div>
  )
}