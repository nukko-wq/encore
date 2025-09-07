'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'
import { LoginButton } from '@/components/auth/LoginButton'
import { BookmarkService } from '@/lib/services/bookmarks'

export const dynamic = 'force-dynamic'

interface Bookmark {
  id: string
  user_id: string
  url: string
  canonical_url: string
  title: string | null
  description: string | null
  thumbnail_url: string | null
  memo: string | null
  is_favorite: boolean
  is_pinned: boolean
  status: 'unread' | 'read'
  pinned_at: string | null
  created_at: string
  updated_at: string
}

export default function BookmarksPage() {
  const { user, loading, isWhitelisted } = useAuth()
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [bookmarksLoading, setBookmarksLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'read'>(
    'all',
  )
  const [favoriteFilter, setFavoriteFilter] = useState(false)
  const [pinnedFilter, setPinnedFilter] = useState(false)

  const bookmarkService = new BookmarkService()

  const loadBookmarks = useCallback(async () => {
    try {
      setBookmarksLoading(true)
      setError(null)

      const filters: Partial<{
        status: 'unread' | 'read'
        is_favorite: boolean
        is_pinned: boolean
      }> = {}
      if (statusFilter !== 'all') filters.status = statusFilter
      if (favoriteFilter) filters.is_favorite = true
      if (pinnedFilter) filters.is_pinned = true

      const data = searchTerm
        ? await bookmarkService.searchBookmarks(searchTerm, filters)
        : await bookmarkService.getBookmarks(filters)

      setBookmarks(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setBookmarksLoading(false)
    }
  }, [searchTerm, statusFilter, favoriteFilter, pinnedFilter, bookmarkService])

  useEffect(() => {
    if (user && isWhitelisted) {
      loadBookmarks()
    }
  }, [user, isWhitelisted, loadBookmarks])

  const handleToggleFavorite = async (id: string, currentState: boolean) => {
    try {
      await bookmarkService.toggleFavorite(id, !currentState)
      await loadBookmarks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    }
  }

  const handleTogglePin = async (id: string, currentState: boolean) => {
    try {
      await bookmarkService.togglePin(id, !currentState)
      await loadBookmarks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    }
  }

  const handleToggleReadStatus = async (
    id: string,
    currentStatus: 'read' | 'unread',
  ) => {
    try {
      const newStatus = currentStatus === 'read' ? 'unread' : 'read'
      await bookmarkService.toggleReadStatus(id, newStatus)
      await loadBookmarks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-900">読み込み中...</div>
          <div className="mt-2 text-sm text-gray-500">
            認証状態を確認しています
          </div>
        </div>
      </div>
    )
  }

  if (!user || !isWhitelisted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              アクセス権限が必要です
            </h2>
            <p className="text-sm text-gray-600 mb-8">
              ブックマークにアクセスするには、ホワイトリストに登録されたアカウントでログインが必要です。
            </p>
          </div>
          <LoginButton />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <Link
                href="/dashboard"
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                ← ダッシュボード
              </Link>
              <h1 className="text-3xl font-bold text-gray-900">ブックマーク</h1>
            </div>
            <LoginButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* 検索とフィルター */}
          <div className="mb-6 bg-white p-6 rounded-lg shadow">
            <div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="タイトル、説明、メモを検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex space-x-4">
                <select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as 'all' | 'unread' | 'read')
                  }
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">全て</option>
                  <option value="unread">未読</option>
                  <option value="read">既読</option>
                </select>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={favoriteFilter}
                    onChange={(e) => setFavoriteFilter(e.target.checked)}
                    className="mr-2"
                  />
                  お気に入りのみ
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={pinnedFilter}
                    onChange={(e) => setPinnedFilter(e.target.checked)}
                    className="mr-2"
                  />
                  ピン留めのみ
                </label>
              </div>
            </div>
          </div>

          {/* エラー表示 */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
              <div className="text-red-800">{error}</div>
            </div>
          )}

          {/* ブックマーク一覧 */}
          {bookmarksLoading ? (
            <div className="text-center py-12">
              <div className="text-lg font-medium text-gray-900">
                読み込み中...
              </div>
            </div>
          ) : bookmarks.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-lg font-medium text-gray-900 mb-2">
                ブックマークが見つかりません
              </div>
              <div className="text-sm text-gray-500">
                {searchTerm ||
                statusFilter !== 'all' ||
                favoriteFilter ||
                pinnedFilter
                  ? '検索条件を変更してみてください'
                  : 'ブックマークを追加してみましょう'}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {bookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        <a
                          href={bookmark.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-lg font-medium text-blue-600 hover:text-blue-800 truncate"
                        >
                          {bookmark.title || 'Untitled'}
                        </a>
                        {bookmark.is_pinned && (
                          <span className="inline-block w-4 h-4 text-yellow-500">
                            📌
                          </span>
                        )}
                        {bookmark.is_favorite && (
                          <span className="inline-block w-4 h-4 text-red-500">
                            ❤️
                          </span>
                        )}
                        <span
                          className={`inline-block px-2 py-1 text-xs rounded-full ${
                            bookmark.status === 'read'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {bookmark.status === 'read' ? '既読' : '未読'}
                        </span>
                      </div>
                      {bookmark.description && (
                        <p className="text-gray-600 mb-2">
                          {bookmark.description}
                        </p>
                      )}
                      {bookmark.memo && (
                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-2">
                          <p className="text-sm text-gray-700">
                            {bookmark.memo}
                          </p>
                        </div>
                      )}
                      <div className="text-sm text-gray-500">
                        作成日:{' '}
                        {new Date(bookmark.created_at).toLocaleString('ja-JP')}
                      </div>
                    </div>
                    <div className="flex flex-col space-y-2 ml-4">
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleFavorite(
                            bookmark.id,
                            bookmark.is_favorite,
                          )
                        }
                        className={`px-3 py-1 text-sm rounded ${
                          bookmark.is_favorite
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {bookmark.is_favorite ? 'お気に入り解除' : 'お気に入り'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleTogglePin(bookmark.id, bookmark.is_pinned)
                        }
                        className={`px-3 py-1 text-sm rounded ${
                          bookmark.is_pinned
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {bookmark.is_pinned ? 'ピン解除' : 'ピン留め'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleToggleReadStatus(bookmark.id, bookmark.status)
                        }
                        className={`px-3 py-1 text-sm rounded ${
                          bookmark.status === 'read'
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {bookmark.status === 'read'
                          ? '未読にする'
                          : '既読にする'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
