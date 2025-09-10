'use client'

import { useCallback, useState } from 'react'
import { type TagRow, useTags } from '@/hooks/use-tags'

interface TagsTreeProps {
  onTagSelect?: (tagId: string) => void
  selectedTagId?: string
  onTagEdit?: (tag: TagRow) => void
}

export default function TagsTree({
  onTagSelect,
  selectedTagId,
  onTagEdit,
}: TagsTreeProps) {
  const { tags, loading, error, deleteTag } = useTags()
  const [draggedTag, setDraggedTag] = useState<string | null>(null)

  // ドラッグ開始
  const handleDragStart = useCallback((e: React.DragEvent, tagId: string) => {
    setDraggedTag(tagId)
    e.dataTransfer.setData('text/plain', tagId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  // ドロップ処理（並び順変更のみサポート）
  const handleDrop = useCallback(
    async (e: React.DragEvent, targetTagId: string) => {
      e.preventDefault()
      if (!draggedTag || draggedTag === targetTagId) return

      try {
        // 並び順の変更（簡略化実装）
        console.log('Reorder:', { draggedTag, targetTagId })
        // 実際の並び順変更は複雑なため、ここでは省略
        // 必要に応じて詳細な並び順ロジックを実装
      } catch (error) {
        console.error('Failed to move tag:', error)
      } finally {
        setDraggedTag(null)
      }
    },
    [draggedTag],
  )

  // ドラッグオーバー
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  // タグ削除の確認
  const handleDeleteTag = useCallback(
    async (tagId: string, tagName: string) => {
      if (!window.confirm(`タグ「${tagName}」を削除しますか？`)) return

      try {
        await deleteTag(tagId)
      } catch (error) {
        console.error('Failed to delete tag:', error)
      }
    },
    [deleteTag],
  )

  // 個別タグレンダリング
  const renderTag = useCallback(
    (tag: TagRow) => {
      const isSelected = selectedTagId === tag.id

      return (
        <div key={tag.id} className="tag-item">
          <div
            className={`flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors group ${
              isSelected ? 'bg-blue-100 hover:bg-blue-150' : ''
            }`}
            draggable
            onDragStart={(e) => handleDragStart(e, tag.id)}
            onDrop={(e) => handleDrop(e, tag.id)}
            onDragOver={handleDragOver}
            onClick={() => onTagSelect?.(tag.id)}
          >
            {/* タグカラー */}
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: tag.color }}
              aria-label="タグカラー"
            />

            {/* タグ名 */}
            <span className="font-medium text-gray-900 flex-grow">
              {tag.name}
            </span>

            {/* タグID（デバッグ用） */}
            <span className="text-xs text-gray-400">#{tag.id.slice(-6)}</span>

            {/* アクションボタン */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onTagEdit?.(tag)
                }}
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-blue-600 rounded"
                aria-label={`タグ「${tag.name}」を編集`}
              >
                ✏️
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteTag(tag.id, tag.name)
                }}
                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-600 rounded"
                aria-label={`タグ「${tag.name}」を削除`}
              >
                🗑️
              </button>
            </div>
          </div>
        </div>
      )
    },
    [
      selectedTagId,
      handleDragStart,
      handleDrop,
      handleDragOver,
      onTagSelect,
      onTagEdit,
      handleDeleteTag,
    ],
  )

  if (loading) {
    return (
      <div className="tags-list">
        <h3 className="text-lg font-semibold mb-4">タグ一覧</h3>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="tags-list">
        <h3 className="text-lg font-semibold mb-4">タグ一覧</h3>
        <div className="text-red-600 text-sm">エラー: {error}</div>
      </div>
    )
  }

  return (
    <div className="tags-list">
      <h3 className="text-lg font-semibold mb-4">タグ一覧</h3>

      {tags.length === 0 ? (
        <div className="text-gray-500 text-sm">タグがありません</div>
      ) : (
        <div className="space-y-1">{tags.map(renderTag)}</div>
      )}
    </div>
  )
}
