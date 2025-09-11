'use client'

import { useState, useMemo } from 'react'
import BookmarkCard from '@/components/bookmarks/bookmark-card'
import BookmarkDeleteDialog from '@/components/bookmarks/bookmark-delete-dialog'
import BookmarkEditForm from '@/components/bookmarks/bookmark-edit-form'
import BookmarkForm from '@/components/bookmarks/bookmark-form'
import BookmarksSidebar from '@/components/bookmarks/sidebar'
import Header, { type NavItem } from '@/components/layout/header'
import { useBookmarks } from '@/hooks/use-bookmarks'
import type { Bookmark } from '@/types/database'

export default function BookmarksPage() {
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null)
  const [showMobileTagFilter, setShowMobileTagFilter] = useState(false)

  // フィルター条件をuseBookmarksに渡す
  const filters = useMemo(
    () => ({
      tags: selectedTagId || undefined,
    }),
    [selectedTagId],
  )

  const {
    bookmarks,
    allBookmarks,
    loading: isLoading,
    error,
    createBookmark,
    deleteBookmark,
    updateBookmark,
  } = useBookmarks(filters)

  const [showModal, setShowModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null)
  const [deletingBookmark, setDeletingBookmark] = useState<Bookmark | null>(
    null,
  )
  const navItems: NavItem[] = [
    { href: '/dashboard', label: 'ダッシュボード' },
    { href: '/bookmarks', label: 'ブックマーク', isActive: true },
    { href: '/tags', label: 'タグ', isActive: false },
  ]

  // タグごとのブックマーク数を計算（全ブックマークを基準）
  const bookmarkCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    allBookmarks?.forEach((bookmark) => {
      // bookmark_tagsリレーションからタグIDを取得
      if (bookmark.bookmark_tags) {
        bookmark.bookmark_tags.forEach((tagRelation) => {
          const tagId = tagRelation.tag_id
          counts[tagId] = (counts[tagId] || 0) + 1
        })
      }
    })
    return counts
  }, [allBookmarks])

  const handleTagFilter = (tagId: string | null) => {
    setSelectedTagId(tagId)
  }

  const handleBookmarkCreated = () => {
    // useBookmarksのRealtime機能で自動更新されるため、モーダルを閉じるだけ
    setShowModal(false)
  }

  const handleBookmarkEdit = (bookmark: Bookmark) => {
    setEditingBookmark(bookmark)
    setShowEditModal(true)
  }

  const handleBookmarkUpdated = () => {
    // useBookmarksのRealtime機能で自動更新されるため、モーダルを閉じるだけ
    setShowEditModal(false)
    setEditingBookmark(null)
  }

  const handleEditModalClose = () => {
    setShowEditModal(false)
    setEditingBookmark(null)
  }

  const handleBookmarkDelete = (bookmark: Bookmark) => {
    setDeletingBookmark(bookmark)
    setShowDeleteModal(true)
  }

  const handleDeleteModalClose = () => {
    setShowDeleteModal(false)
    setDeletingBookmark(null)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header navItems={navItems} />

      <main className="flex">
        {/* サイドバー */}
        <BookmarksSidebar
          selectedTagId={selectedTagId}
          onTagFilter={handleTagFilter}
          bookmarkCounts={bookmarkCounts}
        />

        {/* メインコンテンツ */}
        <div className="flex-1 py-6 px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  ブックマーク
                </h1>
                <p className="mt-1 text-sm text-gray-600">
                  保存したページとリンクを管理します
                </p>
                {/* モバイル用タグフィルターボタン */}
                <div className="mt-3 lg:hidden">
                  <button
                    onClick={() => setShowMobileTagFilter(!showMobileTagFilter)}
                    className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50"
                    type="button"
                  >
                    <svg
                      className="w-4 h-4 mr-1"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <title>タグ</title>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                      />
                    </svg>
                    タグで絞り込み
                    {selectedTagId && (
                      <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        1
                      </span>
                    )}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none transition-colors duration-200 cursor-pointer"
              >
                <svg
                  className="w-5 h-5 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <title>追加</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                新しいブックマーク
              </button>
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

            {isLoading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <p className="mt-2 text-sm text-gray-500">読み込み中...</p>
              </div>
            ) : !bookmarks || bookmarks.length === 0 ? (
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
                  <BookmarkCard
                    key={bookmark.id}
                    bookmark={bookmark}
                    onEdit={handleBookmarkEdit}
                    onDelete={handleBookmarkDelete}
                  />
                ))}
              </div>
            )}

            {/* モバイル用タグフィルターモーダル */}
            {showMobileTagFilter && (
              <div className="fixed inset-0 z-50 lg:hidden">
                <button
                  className="fixed inset-0 bg-black/25"
                  onClick={() => setShowMobileTagFilter(false)}
                  type="button"
                  aria-label="モーダルを閉じる"
                />
                <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-lg shadow-lg max-h-96 overflow-y-auto">
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-gray-900">
                        タグで絞り込み
                      </h3>
                      <button
                        onClick={() => setShowMobileTagFilter(false)}
                        className="text-gray-400 hover:text-gray-600"
                        type="button"
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
                  </div>
                  <div className="p-4">
                    <BookmarksSidebar
                      selectedTagId={selectedTagId}
                      onTagFilter={(tagId) => {
                        handleTagFilter(tagId)
                        setShowMobileTagFilter(false)
                      }}
                      bookmarkCounts={bookmarkCounts}
                      compact={true}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 新規作成モーダル */}
      {showModal && (
        <BookmarkForm
          onSuccess={handleBookmarkCreated}
          onClose={() => setShowModal(false)}
          createBookmark={createBookmark}
        />
      )}

      {/* 編集モーダル */}
      {showEditModal && editingBookmark && (
        <BookmarkEditForm
          bookmark={editingBookmark}
          onSuccess={handleBookmarkUpdated}
          onClose={handleEditModalClose}
          updateBookmark={updateBookmark}
        />
      )}

      {/* 削除確認モーダル */}
      {showDeleteModal && deletingBookmark && (
        <BookmarkDeleteDialog
          bookmark={deletingBookmark}
          onDelete={deleteBookmark}
          onClose={handleDeleteModalClose}
        />
      )}
    </div>
  )
}
