'use client'

import { useState } from 'react'
import type { Bookmark } from '@/types/database'

interface BookmarkDeleteDialogProps {
  bookmark: Bookmark
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}

export default function BookmarkDeleteDialog({
  bookmark,
  onDelete,
  onClose,
}: BookmarkDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')

  const handleDelete = async () => {
    setIsDeleting(true)
    setError('')

    try {
      await onDelete(bookmark.id)
      onClose()
    } catch (error) {
      console.error('Delete error:', error)
      setError(error instanceof Error ? error.message : '削除に失敗しました')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            ブックマークの削除
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            disabled={isDeleting}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>閉じる</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* コンテンツ */}
        <div className="p-6">
          <div className="mb-4">
            <p className="text-gray-700 mb-4">
              以下のブックマークを削除しますか？この操作は取り消せません。
            </p>

            {/* ブックマーク情報 */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="flex items-start space-x-3">
                {bookmark.thumbnail_url && (
                  <img
                    src={bookmark.thumbnail_url}
                    alt={bookmark.title || 'ブックマークのサムネイル'}
                    className="w-12 h-12 rounded object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-gray-900 line-clamp-2">
                    {bookmark.title || 'タイトルなし'}
                  </h3>
                  <p className="text-xs text-blue-600 truncate mt-1">
                    {bookmark.url}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md mb-4">
              {error}
            </div>
          )}

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 focus:outline-none transition-colors duration-200 cursor-pointer"
              disabled={isDeleting}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {isDeleting ? (
                <span className="flex items-center justify-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <title>削除中</title>
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  削除中...
                </span>
              ) : (
                '削除'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
