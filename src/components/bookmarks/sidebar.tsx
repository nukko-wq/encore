'use client'

import { useState } from 'react'
import { useTags, type TagRow } from '@/hooks/use-tags'

interface BookmarksSidebarProps {
  selectedTagId: string | null
  onTagFilter: (tagId: string | null) => void
  bookmarkCounts?: Record<string, number>
  compact?: boolean
}

export default function BookmarksSidebar({
  selectedTagId,
  onTagFilter,
  bookmarkCounts = {},
  compact = false,
}: BookmarksSidebarProps) {
  const { tags, loading, error } = useTags()
  const [isCollapsed, setIsCollapsed] = useState(false)

  const handleTagClick = (tagId: string) => {
    if (selectedTagId === tagId) {
      // 既に選択されている場合は解除
      onTagFilter(null)
    } else {
      // 新しく選択
      onTagFilter(tagId)
    }
  }

  const handleClearFilter = () => {
    onTagFilter(null)
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
                selectedTagId === null
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
                const isSelected = selectedTagId === tag.id
                const count = bookmarkCounts[tag.id] || 0

                return (
                  <button
                    key={tag.id}
                    onClick={() => handleTagClick(tag.id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:cursor-pointer ${
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
    <div className="hidden lg:flex w-64 min-h-screen border-r border-gray-200 flex-col shadow-sm">
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
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:cursor-pointer ${
                selectedTagId === null
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
                  const isSelected = selectedTagId === tag.id
                  const count = bookmarkCounts[tag.id] || 0

                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleTagClick(tag.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors hover:cursor-pointer ${
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
    </div>
  )
}
