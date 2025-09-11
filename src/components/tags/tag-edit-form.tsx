'use client'

import { useCallback, useState } from 'react'
import { type TagRow } from '@/hooks/use-tags'
import TagForm from './tag-form'

interface TagEditFormProps {
  tag: TagRow
  onSuccess?: () => void
  onClose?: () => void
  updateTag: (id: string, updates: Partial<TagRow>) => Promise<TagRow>
}

export default function TagEditForm({
  tag,
  onSuccess,
  onClose,
  updateTag,
}: TagEditFormProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDeleteTag = useCallback(async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true)
      return
    }

    setIsDeleting(true)
    try {
      // TODO: deleteTag機能が必要であれば親コンポーネントから渡す
      console.log('Delete functionality needs to be passed from parent')
      onSuccess?.()
    } catch (error) {
      console.error('Failed to delete tag:', error)
    } finally {
      setIsDeleting(false)
    }
  }, [tag.id, onSuccess, showDeleteConfirm])

  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(false)
  }, [])

  return (
    <div className="fixed inset-0 bg-black/25 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">タグを編集</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <span className="sr-only">閉じる</span>
            <svg
              className="w-6 h-6"
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
          </button>
        </div>

        <div className="p-6">
          <TagForm
            editingTag={tag}
            onSuccess={onSuccess}
            onCancel={onClose}
            createTag={async () => {
              throw new Error('Create not available in edit mode')
            }}
            updateTag={updateTag}
          />

          {/* 削除セクション */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              危険な操作
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              このタグを削除すると、関連付けられたブックマークからもタグが除去されます。この操作は取り消せません。
            </p>

            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={handleDeleteTag}
                disabled={isDeleting}
                className="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                タグを削除
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-red-800">
                  本当にタグ「{tag.name}」を削除しますか？
                </p>
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={handleDeleteTag}
                    disabled={isDeleting}
                    className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? '削除中...' : '削除する'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelDelete}
                    disabled={isDeleting}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
