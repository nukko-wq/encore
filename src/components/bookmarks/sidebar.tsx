'use client'

import { useState } from 'react'
import { useTags, type TagRow } from '@/hooks/use-tags'

interface BookmarksSidebarProps {
  selectedTagIds: string[]
  onTagFilter: (tagIds: string[]) => void
  bookmarkCounts?: Record<string, number>
  compact?: boolean
}

export default function BookmarksSidebar({
  selectedTagIds,
  onTagFilter,
  bookmarkCounts = {},
  compact = false,
}: BookmarksSidebarProps) {
  const { tags, loading, error } = useTags()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleTagClick = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      // 既に選択されている場合は除外
      onTagFilter(selectedTagIds.filter((id) => id !== tagId))
    } else {
      // 新しく選択
      onTagFilter([...selectedTagIds, tagId])
    }
  }

  const handleClearFilter = () => {
    onTagFilter([])
  }

  if (error) {
    return (
      <div className="w-64 bg-white border-r border-gray-200 p-4">
        <div className="text-red-600 text-sm">
          タグの読み込みでエラーが発生しました
        </div>
      </div>
    )
  }

  if (compact) {
    return (
      <div className="w-full">
        {loading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-gray-200 rounded" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {/* 全て表示オプション */}
            <button
              onClick={handleClearFilter}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selectedTagIds.length === 0
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              type="button"
            >
              <div className="flex items-center justify-between">
                <span>すべて</span>
                <span className="text-xs text-gray-500">
                  {Object.values(bookmarkCounts).reduce(
                    (sum, count) => sum + count,
                    0,
                  )}
                </span>
              </div>
            </button>

            {/* タグリスト */}
            {tags.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-500 text-center">
                タグがありません
              </div>
            ) : (
              tags.map((tag: TagRow) => {
                const isSelected = selectedTagIds.includes(tag.id)
                const count = bookmarkCounts[tag.id] || 0

                return (
                  <button
                    key={tag.id}
                    onClick={() => handleTagClick(tag.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                      isSelected
                        ? 'bg-blue-100 text-blue-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                    type="button"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="truncate">{tag.name}</span>
                      </div>
                      <span className="text-xs text-gray-500 ml-1">
                        {count}
                      </span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="hidden lg:flex w-64 min-h-screen bg-white border-r border-gray-200 flex-col">
      {/* ヘッダー */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">タグ</h2>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="lg:hidden p-1 rounded text-gray-500 hover:text-gray-700"
            type="button"
          >
            <svg
              className={`w-4 h-4 transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* タグリスト */}
      <div
        className={`flex-1 overflow-y-auto ${isCollapsed ? 'hidden lg:block' : ''}`}
      >
        {loading ? (
          <div className="p-4">
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 bg-gray-200 rounded" />
              ))}
            </div>
          </div>
        ) : (
          <div className="p-2">
            {/* 全て表示オプション */}
            <button
              onClick={handleClearFilter}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selectedTagIds.length === 0
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              type="button"
            >
              <div className="flex items-center justify-between">
                <span>すべて</span>
                <span className="text-xs text-gray-500">
                  {Object.values(bookmarkCounts).reduce(
                    (sum, count) => sum + count,
                    0,
                  )}
                </span>
              </div>
            </button>

            {/* タグリスト */}
            <div className="mt-2 space-y-1">
              {tags.length === 0 ? (
                <div className="px-3 py-4 text-sm text-gray-500 text-center">
                  タグがありません
                </div>
              ) : (
                tags.map((tag: TagRow) => {
                  const isSelected = selectedTagIds.includes(tag.id)
                  const count = bookmarkCounts[tag.id] || 0

                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleTagClick(tag.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        isSelected
                          ? 'bg-blue-100 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                      type="button"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="truncate">{tag.name}</span>
                        </div>
                        <span className="text-xs text-gray-500 ml-1">
                          {count}
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* 選択中のタグ表示 */}
      {selectedTagIds.length > 0 && (
        <div className="border-t border-gray-200 p-3">
          <div className="text-xs text-gray-500 mb-2">
            選択中のタグ ({selectedTagIds.length})
          </div>
          <div className="space-y-1">
            {selectedTagIds.map((tagId) => {
              const tag = tags.find((t) => t.id === tagId)
              if (!tag) return null

              return (
                <div
                  key={tagId}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-1">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="text-gray-700">{tag.name}</span>
                  </div>
                  <button
                    onClick={() => handleTagClick(tagId)}
                    className="text-gray-400 hover:text-gray-600"
                    type="button"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
