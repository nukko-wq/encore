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
        <div className="px-4 sm:px-6 lg:px-8 xl:px-12">
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
        <div className="py-6 px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="py-6">
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                {bookmarks.map((bookmark) => (
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
                          {new Date(bookmark.created_at).toLocaleDateString(
                            'ja-JP',
                          )}
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
