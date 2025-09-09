'use client'

import { useState } from 'react'
import type { Bookmark } from '@/types/database'

interface BookmarkFormProps {
  onSuccess?: () => void
  onClose?: () => void
  createBookmark: (data: {
    url: string
    title?: string
    description?: string
  }) => Promise<Bookmark>
}

export default function BookmarkForm({
  onSuccess,
  onClose,
  createBookmark,
}: BookmarkFormProps) {
  const [url, setUrl] = useState('')
  // もうスピナーは使わない
  // const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!url.trim()) {
      setError('URLを入力してください')
      return
    }

    setError('')

    // 楽観的に追加されるので、awaitしないで即閉じる
    const p = createBookmark({
      url: url.trim(),
    })

    setUrl('')

    if (onSuccess) {
      onSuccess()
    }

    if (onClose) {
      onClose()
    }

    // 失敗時のみ後追いで通知（トースト等）
    p.catch((error) => {
      console.error('Error creating bookmark:', error)
      setError(
        error instanceof Error
          ? error.message
          : 'ブックマークの作成に失敗しました',
      )
    })
  }

  return (
    <div 
      className="fixed inset-0 bg-black/25 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            新しいブックマークを追加
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

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
                {error}
              </div>
            )}

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
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none disabled:bg-gray-400 disabled:cursor-default transition-colors duration-200 cursor-pointer"
              >
                保存
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
