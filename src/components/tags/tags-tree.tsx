'use client'

import { useCallback, useEffect, useState } from 'react'
import { type TagRow, type TagWithChildren, useTags } from '@/hooks/use-tags'

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
  const { tagsTree, loading, error, updateTag, deleteTag, reorderTags } =
    useTags()
  const [draggedTag, setDraggedTag] = useState<string | null>(null)
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set())

  // タグツリーが更新されたときに、子を持つルートタグを自動展開
  useEffect(() => {
    if (tagsTree.length > 0) {
      const newExpandedTags = new Set<string>()
      tagsTree.forEach((rootTag) => {
        if (rootTag.children && rootTag.children.length > 0) {
          newExpandedTags.add(rootTag.id)
        }
      })
      setExpandedTags(newExpandedTags)
    }
  }, [tagsTree])

  // タグの展開/折りたたみ
  const toggleExpand = useCallback((tagId: string) => {
    setExpandedTags((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(tagId)) {
        newSet.delete(tagId)
      } else {
        newSet.add(tagId)
      }
      return newSet
    })
  }, [])

  // ドラッグ開始
  const handleDragStart = useCallback((e: React.DragEvent, tagId: string) => {
    setDraggedTag(tagId)
    e.dataTransfer.setData('text/plain', tagId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  // ドロップ処理
  const handleDrop = useCallback(
    async (
      e: React.DragEvent,
      targetTagId: string,
      position: 'before' | 'after' | 'inside',
    ) => {
      e.preventDefault()
      if (!draggedTag || draggedTag === targetTagId) return

      try {
        if (position === 'inside') {
          // 親子関係の変更
          await updateTag(draggedTag, { parent_tag_id: targetTagId })
        } else {
          // 並び順の変更（簡略化実装）
          console.log('Reorder:', { draggedTag, targetTagId, position })
          // 実際の並び順変更は複雑なため、ここでは省略
          // 必要に応じて詳細な並び順ロジックを実装
        }
      } catch (error) {
        console.error('Failed to move tag:', error)
      } finally {
        setDraggedTag(null)
      }
    },
    [draggedTag, updateTag],
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
    (tag: TagWithChildren) => {
      const hasChildren = tag.children && tag.children.length > 0
      const isExpanded = expandedTags.has(tag.id)
      const isSelected = selectedTagId === tag.id

      return (
        <div key={tag.id} className="tag-item">
          <div
            className={`flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer transition-colors ${
              isSelected ? 'bg-blue-100 hover:bg-blue-150' : ''
            }`}
            style={{ marginLeft: `${tag.level * 20}px` }}
            draggable
            onDragStart={(e) => handleDragStart(e, tag.id)}
            onDrop={(e) => handleDrop(e, tag.id, 'inside')}
            onDragOver={handleDragOver}
            onClick={() => onTagSelect?.(tag.id)}
          >
            {/* 展開/折りたたみボタン */}
            {hasChildren && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleExpand(tag.id)
                }}
                className="w-4 h-4 flex items-center justify-center text-gray-500 hover:text-gray-700"
                aria-label={isExpanded ? 'タグを折りたたむ' : 'タグを展開'}
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            )}
            {!hasChildren && <div className="w-4" />}

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

          {/* 子タグの再帰レンダリング */}
          {hasChildren && isExpanded && (
            <div className="tag-children">{tag.children?.map(renderTag)}</div>
          )}
        </div>
      )
    },
    [
      expandedTags,
      selectedTagId,
      handleDragStart,
      handleDrop,
      handleDragOver,
      onTagSelect,
      onTagEdit,
      toggleExpand,
      handleDeleteTag,
    ],
  )

  if (loading) {
    return (
      <div className="tags-tree">
        <h3 className="text-lg font-semibold mb-4">タグ階層</h3>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 ml-6"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="tags-tree">
        <h3 className="text-lg font-semibold mb-4">タグ階層</h3>
        <div className="text-red-600 text-sm">エラー: {error}</div>
      </div>
    )
  }

  return (
    <div className="tags-tree">
      <h3 className="text-lg font-semibold mb-4">タグ階層</h3>

      {tagsTree.length === 0 ? (
        <div className="text-gray-500 text-sm">タグがありません</div>
      ) : (
        <div className="space-y-1 group">{tagsTree.map(renderTag)}</div>
      )}
    </div>
  )
}
