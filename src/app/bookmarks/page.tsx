'use client'

import { useState } from 'react'
import BookmarkCard from '@/components/bookmarks/bookmark-card'
import BookmarkDeleteDialog from '@/components/bookmarks/bookmark-delete-dialog'
import BookmarkEditForm from '@/components/bookmarks/bookmark-edit-form'
import BookmarkForm from '@/components/bookmarks/bookmark-form'
import Header, { type NavItem } from '@/components/layout/header'
import { useBookmarks } from '@/hooks/use-bookmarks'
import type { Bookmark } from '@/types/database'

export default function BookmarksPage() {
  const {
    bookmarks,
    loading: isLoading,
    error,
    createBookmark,
    deleteBookmark,
    updateBookmark,
  } = useBookmarks()
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

      <main>
        <div className="py-6 px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="py-6">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  ブックマーク
                </h1>
                <p className="mt-1 text-sm text-gray-600">
                  保存したページとリンクを管理します
                </p>
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
