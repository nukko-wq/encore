'use client'

import { useState } from 'react'
import type { Bookmark } from '@/types/database'

interface BookmarkEditFormProps {
  bookmark: Bookmark
  onSuccess?: () => void
  onClose?: () => void
  updateBookmark: (id: string, updates: Partial<Bookmark>) => Promise<Bookmark>
}

export default function BookmarkEditForm({
  bookmark,
  onSuccess,
  onClose,
  updateBookmark,
}: BookmarkEditFormProps) {
  const [url, setUrl] = useState(bookmark.url)
  const [title, setTitle] = useState(bookmark.title || '')
  const [description, setDescription] = useState(bookmark.description || '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!url.trim()) {
      return
    }

    // 楽観的更新なので、更新処理を開始したらすぐにモーダルを閉じる
    if (onSuccess) {
      onSuccess()
    }

    if (onClose) {
      onClose()
    }

    try {
      await updateBookmark(bookmark.id, {
        url: url.trim(),
        title: title.trim() || null,
        description: description.trim() || null,
      })
    } catch (error) {
      console.error('Error updating bookmark:', error)
      // エラーが発生した場合は、useBookmarksフックが状態を復元するのでここでは何もしない
    }
  }

  return (
    <div className="fixed inset-0 bg-black/25 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            ブックマークを編集
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
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
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="url"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                URL *
              </label>
              <input
                type="url"
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label
                htmlFor="title"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                タイトル
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ブックマークのタイトル"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                説明
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ブックマークの説明"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 focus:outline-none transition-colors duration-200 cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={!url.trim()}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
              >
                更新
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
