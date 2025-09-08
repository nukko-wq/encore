'use client'

import type { Bookmark } from '@/types/database'

interface BookmarkCardProps {
  bookmark: Bookmark
}

export default function BookmarkCard({ bookmark }: BookmarkCardProps) {
  return (
    <a
      key={bookmark.id}
      href={bookmark.url}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-all duration-200 flex flex-col h-80 sm:h-96 hover:scale-105 cursor-pointer group"
    >
      {/* サムネイル画像 */}
      <div className="h-32 sm:h-40 bg-gray-100 relative flex-shrink-0">
        {bookmark.thumbnail_url ? (
          <img
            className="w-full h-full object-cover"
            src={bookmark.thumbnail_url}
            alt=""
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              className="w-12 h-12 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-label="画像なし"
            >
              <title>画像なし</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* カードコンテンツ */}
      <div className="p-4 flex-1 flex flex-col">
        {/* タイトル */}
        <h3 className="text-base font-medium text-gray-900 line-clamp-2 mb-2">
          {bookmark.title || 'タイトルなし'}
        </h3>

        {/* URL */}
        <div className="text-xs text-blue-600 truncate mb-2">
          {bookmark.url}
        </div>

        {/* 説明文 */}
        {bookmark.description && (
          <p className="text-sm text-gray-700 line-clamp-3 mb-3">
            {bookmark.description}
          </p>
        )}

        {/* メモ */}
        {bookmark.memo && (
          <div className="mb-3 p-2 bg-yellow-50 rounded-md">
            <p className="text-xs text-yellow-800 line-clamp-2">
              <span className="font-medium">メモ: </span>
              {bookmark.memo}
            </p>
          </div>
        )}

        {/* フッター情報 */}
        <div className="mt-auto">
          {/* ステータス・お気に入り・ピン留めバッジ */}
          <div className="flex flex-wrap gap-1 mb-2">
            {bookmark.is_favorite && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                ★
              </span>
            )}
            {bookmark.is_pinned && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                📌
              </span>
            )}
            {bookmark.status === 'read' && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                既読
              </span>
            )}
          </div>

          {/* 作成日 */}
          <div className="text-xs text-gray-500">
            {new Date(bookmark.created_at).toLocaleDateString('ja-JP')}
          </div>
        </div>
      </div>
    </a>
  )
}
