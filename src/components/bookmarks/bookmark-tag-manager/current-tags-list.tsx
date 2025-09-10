'use client'

import { Button } from 'react-aria-components'
import type { TagRow } from '@/hooks/use-tags'

interface CurrentTagsListProps {
  tags: TagRow[]
  onRemove: (tagId: string) => void
  isLoading?: boolean
}

export default function CurrentTagsList({
  tags,
  onRemove,
  isLoading = false,
}: CurrentTagsListProps) {
  if (tags.length === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-2">
        タグが設定されていません
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-medium text-gray-700 uppercase tracking-wide">
        現在のタグ
      </h4>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <div
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white transition-opacity duration-200"
            style={{ backgroundColor: tag.color }}
          >
            <span className="truncate max-w-20">{tag.name}</span>
            <Button
              onPress={() => onRemove(tag.id)}
              isDisabled={isLoading}
              className="w-4 h-4 rounded-full hover:bg-black/20 flex items-center justify-center outline-none transition-colors duration-200 disabled:opacity-50"
              aria-label={`タグ「${tag.name}」を削除`}
            >
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
