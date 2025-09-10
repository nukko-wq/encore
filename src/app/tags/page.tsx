'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import SignOutButton from '@/components/common/sign-out-button'
import TagEditForm from '@/components/tags/tag-edit-form'
import TagForm from '@/components/tags/tag-form'
import TagsTree from '@/components/tags/tags-tree'
import { type TagRow, useTags } from '@/hooks/use-tags'

export default function TagsPage() {
  const { tags, tagsTree, loading: isLoading, error } = useTags()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingTag, setEditingTag] = useState<TagRow | null>(null)
  const [selectedParentId, setSelectedParentId] = useState<string | undefined>(
    undefined,
  )
  const [selectedTagId, setSelectedTagId] = useState<string | undefined>(
    undefined,
  )
  const [user, setUser] = useState<{ email?: string } | null>(null)

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userResponse = await fetch('/api/auth/user')
        if (userResponse.ok) {
          const userData = await userResponse.json()
          setUser(userData.user)
        }
      } catch (err) {
        console.error('Error fetching user data:', err)
      }
    }

    fetchUserData()
  }, [])

  const handleCreateTag = () => {
    setSelectedParentId(selectedTagId)
    setShowCreateModal(true)
  }

  const handleTagCreated = () => {
    setShowCreateModal(false)
    setSelectedParentId(undefined)
  }

  const handleTagSelect = (tagId: string) => {
    setSelectedTagId(tagId)
  }

  const handleTagEdit = (tag: TagRow) => {
    setEditingTag(tag)
    setShowEditModal(true)
  }

  const handleTagUpdated = () => {
    setShowEditModal(false)
    setEditingTag(null)
  }

  const handleEditModalClose = () => {
    setShowEditModal(false)
    setEditingTag(null)
  }

  const selectedTag = selectedTagId
    ? tags.find((t) => t.id === selectedTagId)
    : null

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
                  <Link
                    href="/bookmarks"
                    className="text-gray-500 hover:text-gray-700 px-3 py-2 text-sm font-medium"
                  >
                    ブックマーク
                  </Link>
                  <span className="text-blue-600 px-3 py-2 text-sm font-medium">
                    タグ
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
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">タグ管理</h1>
                <p className="mt-1 text-sm text-gray-600">
                  階層タグの作成・編集・整理を行います
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={handleCreateTag}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none transition-colors duration-200"
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
                  新しいタグ
                </button>
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
                      タグデータを読み込めませんでした。ページをリロードしてみてください。
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* タグツリー */}
              <div className="lg:col-span-2">
                <div className="bg-white shadow rounded-lg p-6">
                  {isLoading ? (
                    <div className="text-center py-12">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <p className="mt-2 text-sm text-gray-500">
                        読み込み中...
                      </p>
                    </div>
                  ) : tags.length === 0 ? (
                    <div className="text-center py-12">
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                        />
                      </svg>
                      <h3 className="mt-2 text-sm font-medium text-gray-900">
                        タグがありません
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">
                        最初のタグを作成してブックマークを整理しましょう。
                      </p>
                      <div className="mt-6">
                        <button
                          type="button"
                          onClick={handleCreateTag}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
                        >
                          <svg
                            className="w-5 h-5 mr-2"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 4v16m8-8H4"
                            />
                          </svg>
                          最初のタグを作成
                        </button>
                      </div>
                    </div>
                  ) : (
                    <TagsTree
                      onTagSelect={handleTagSelect}
                      selectedTagId={selectedTagId}
                      onTagEdit={handleTagEdit}
                    />
                  )}
                </div>
              </div>

              {/* タグ詳細・統計 */}
              <div className="lg:col-span-1">
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    {selectedTag ? 'タグ詳細' : 'タグ統計'}
                  </h3>

                  {selectedTag ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          タグ名
                        </label>
                        <div className="mt-1 flex items-center space-x-2">
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: selectedTag.color }}
                          />
                          <span className="text-sm text-gray-900">
                            {selectedTag.name}
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          作成日
                        </label>
                        <p className="mt-1 text-sm text-gray-500">
                          {new Date(selectedTag.created_at).toLocaleDateString(
                            'ja-JP',
                            {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            },
                          )}
                        </p>
                      </div>

                      <div className="pt-4">
                        <button
                          type="button"
                          onClick={() => handleTagEdit(selectedTag)}
                          className="w-full inline-flex justify-center items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                        >
                          編集
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          総タグ数
                        </label>
                        <p className="mt-1 text-2xl font-semibold text-gray-900">
                          {tags.length}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          ルートタグ数
                        </label>
                        <p className="mt-1 text-2xl font-semibold text-gray-900">
                          {tagsTree.length}
                        </p>
                      </div>

                      {tags.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            最近のタグ
                          </label>
                          <div className="space-y-2">
                            {tags
                              .sort(
                                (a, b) =>
                                  new Date(b.created_at).getTime() -
                                  new Date(a.created_at).getTime(),
                              )
                              .slice(0, 3)
                              .map((tag) => (
                                <div
                                  key={tag.id}
                                  className="flex items-center space-x-2"
                                >
                                  <div
                                    className="w-3 h-3 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: tag.color }}
                                  />
                                  <span className="text-xs text-gray-600 truncate">
                                    {tag.name}
                                  </span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* 新規作成モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/25 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">新しいタグ</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
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
                parentTagId={selectedParentId}
                onSuccess={handleTagCreated}
                onCancel={() => setShowCreateModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      {showEditModal && editingTag && (
        <TagEditForm
          tag={editingTag}
          onSuccess={handleTagUpdated}
          onClose={handleEditModalClose}
        />
      )}
    </div>
  )
}
