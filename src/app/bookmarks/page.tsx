import Link from 'next/link'
import BookmarkForm from '@/components/bookmark-form'
import SignOutButton from '@/components/sign-out-button'
import { bookmarkService } from '@/lib/services/bookmarks'
import { getCurrentUser } from '@/lib/supabase-server'
import type { Bookmark } from '@/types/database'

export default async function BookmarksPage() {
  // middlewareで既に認証確認済みのため、getCurrentUserを使用
  const user = await getCurrentUser()

  // BookmarkServiceを使用してブックマーク取得
  let bookmarks: Bookmark[] = []
  let error: string | null = null

  try {
    const result = await bookmarkService.getBookmarks()
    bookmarks = result.bookmarks
  } catch (err) {
    console.error('Error fetching bookmarks:', err)
    error =
      err instanceof Error ? err.message : 'ブックマークの取得に失敗しました'
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Link
                  href="/dashboard"
                  className="text-xl font-bold text-gray-900 hover:text-gray-700"
                >
                  Encore
                </Link>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:items-center">
                <nav className="flex space-x-8">
                  <Link
                    href="/dashboard"
                    className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium"
                  >
                    ダッシュボード
                  </Link>
                  <span className="text-blue-600 px-3 py-2 text-sm font-medium">
                    ブックマーク
                  </span>
                </nav>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">{user?.email}</span>
              <SignOutButton />
            </div>
          </div>
        </div>
      </nav>

      <main>
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900">ブックマーク</h1>
              <p className="mt-1 text-sm text-gray-600">
                保存したページとリンクを管理します
              </p>
            </div>

            {/* ブックマーク追加フォーム */}
            <div className="mb-8 bg-white shadow rounded-lg">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  新しいブックマークを追加
                </h3>
                <BookmarkForm />
              </div>
            </div>

            {error && (
              <div className="mb-6 rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      データの取得でエラーが発生しました
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      ブックマークデータを読み込めませんでした。ページをリロードしてみてください。
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!bookmarks || bookmarks.length === 0 ? (
              <div className="text-center py-12">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  ブックマークがありません
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  ブラウザ拡張機能やURLの手動追加でブックマークを作成できます。
                </p>
              </div>
            ) : (
              <div className="grid gap-6">
                {bookmarks.map((bookmark) => (
                  <div
                    key={bookmark.id}
                    className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow duration-200"
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-medium text-gray-900 truncate">
                            {bookmark.title || 'タイトルなし'}
                          </h3>
                          <a
                            href={bookmark.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 text-sm text-blue-600 hover:text-blue-800 truncate block"
                          >
                            {bookmark.url}
                          </a>
                          {bookmark.description && (
                            <p className="mt-2 text-sm text-gray-700 line-clamp-3">
                              {bookmark.description}
                            </p>
                          )}
                          {bookmark.memo && (
                            <div className="mt-3 p-3 bg-yellow-50 rounded-md">
                              <p className="text-sm text-yellow-800">
                                <span className="font-medium">メモ: </span>
                                {bookmark.memo}
                              </p>
                            </div>
                          )}
                          <div className="mt-4 flex items-center text-xs text-gray-500">
                            <span>
                              作成日:{' '}
                              {new Date(bookmark.created_at).toLocaleDateString(
                                'ja-JP',
                              )}
                            </span>
                            {bookmark.status && (
                              <span className="ml-4">
                                ステータス:{' '}
                                {bookmark.status === 'read' ? '既読' : '未読'}
                              </span>
                            )}
                            {bookmark.is_favorite && (
                              <span className="ml-4 text-yellow-600">
                                ★ お気に入り
                              </span>
                            )}
                            {bookmark.is_pinned && (
                              <span className="ml-4 text-blue-600">
                                📌 ピン留め
                              </span>
                            )}
                          </div>
                        </div>
                        {bookmark.thumbnail_url && (
                          <div className="ml-4 flex-shrink-0">
                            <img
                              className="h-16 w-16 rounded-lg object-cover"
                              src={bookmark.thumbnail_url}
                              alt=""
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
