'use client'

import { useState, useRef } from 'react'
import {
  Button,
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from 'react-aria-components'
import BookmarkTagManager from './bookmark-tag-manager'
import { useBookmarkTags } from '@/hooks/use-bookmark-tags'
import type { Bookmark } from '@/types/database'

interface BookmarkCardProps {
  bookmark: Bookmark
  onDelete: (bookmark: Bookmark) => void
  onEdit?: (bookmark: Bookmark) => void
}

export default function BookmarkCard({
  bookmark,
  onDelete,
  onEdit,
}: BookmarkCardProps) {
  // もう削除スピナーは出さない
  // const [isDeleting, setIsDeleting] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  // ブックマークのタグを取得
  const { tags: bookmarkTags, loading: tagsLoading } = useBookmarkTags(
    bookmark.id,
  )

  // スケルトンUI判定: 一時ブックマークまたはローディング中の場合
  const isLoadingBookmark =
    bookmark.id.startsWith('temp-') || (bookmark as any).isLoading

  const handleDelete = () => {
    onDelete(bookmark)
  }

  const handleCardClick = () => {
    window.open(bookmark.url, '_blank', 'noopener,noreferrer')
  }

  const handleEdit = () => {
    if (onEdit) {
      onEdit(bookmark)
    }
  }

  const handleTagManager = () => {
    // メニューを先に閉じてから、少し遅延してタグマネージャーを開く
    setIsMenuOpen(false)
    setTimeout(() => {
      setIsTagManagerOpen(true)
    }, 100) // 100ms遅延でMenuTriggerのPopoverが完全に閉じてから開く
  }

  return (
    <div className="bg-white overflow-hidden shadow rounded-lg hover:shadow-lg transition-all duration-200 flex flex-col h-80 sm:h-96 hover:scale-105 cursor-pointer group relative">
      {/* More Vert Menu */}
      <div
        className="absolute bottom-2 right-2 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <MenuTrigger
          isOpen={isMenuOpen && !isTagManagerOpen}
          onOpenChange={(open) => {
            // タグマネージャーが開いている時はメニューを開かない
            if (!isTagManagerOpen) {
              setIsMenuOpen(open)
            }
          }}
        >
          <Button
            ref={menuButtonRef}
            aria-label="ブックマークアクション"
            className={`w-8 h-8 rounded-full hover:bg-black/10 transition-colors duration-200 flex items-center justify-center outline-none cursor-pointer ${
              isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
            }`}
            onPress={() => {
              // メニューボタンクリック時は何もしない（メニューを開く）
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              height="20px"
              viewBox="0 -960 960 960"
              width="20px"
              fill="#3f3f46"
              aria-label="メニューを開く"
            >
              <title>メニューを開く</title>
              <path d="M480-160q-33 0-56.5-23.5T400-240q0-33 23.5-56.5T480-320q33 0 56.5 23.5T560-240q0 33-23.5 56.5T480-160Zm0-240q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm0-240q-33 0-56.5-23.5T400-720q0-33 23.5-56.5T480-800q33 0 56.5 23.5T560-720q0 33-23.5 56.5T480-640Z" />
            </svg>
          </Button>
          <Popover className="min-w-32 bg-white rounded-md shadow-lg ring-1 ring-black/5 entering:animate-in entering:fade-in-0 entering:zoom-in-95 exiting:animate-out exiting:fade-out-0 exiting:zoom-out-95 fill-mode-forwards">
            <Menu className="outline-none">
              <MenuItem
                onAction={handleTagManager}
                className="w-full px-3 py-3 text-sm text-left rounded text-gray-700 outline-none cursor-pointer flex items-center gap-2 hover:bg-gray-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="18px"
                  viewBox="0 -960 960 960"
                  width="18px"
                  fill="currentColor"
                >
                  <title>タグ</title>
                  <path d="m240-160 40-160H120l20-80h160l40-160H180l20-80h160l40-160h80l-40 160h160l40-160h80l-40 160h160l-20 80H660l-40 160h160l-20 80H600l-40 160h-80l40-160H360l-40 160h-80Zm140-240h160l40-160H420l-40 160Z" />
                </svg>
                タグ
              </MenuItem>
              <MenuItem
                onAction={handleEdit}
                className="w-full px-3 py-3 text-sm text-left rounded text-gray-700 outline-none cursor-pointer flex items-center gap-2 hover:bg-gray-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="18px"
                  viewBox="0 -960 960 960"
                  width="18px"
                  fill="currentColor"
                >
                  <title>編集</title>
                  <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h357l-80 80H200v560h560v-278l80-80v358q0 33-23.5 56.5T760-120H200Zm280-360ZM360-360v-170l367-367q12-12 27-18t30-6q16 0 30.5 6t26.5 18l56 57q11 12 17 26.5t6 29.5q0 15-5.5 29.5T897-728L530-360H360Zm481-424-56-56 56 56ZM440-440h56l232-232-28-28-29-28-231 231v57Zm260-260-29-28 29 28 28 28-28-28Z" />
                </svg>
                編集
              </MenuItem>
              <MenuItem
                onAction={handleDelete}
                className="w-full px-3 py-3 text-sm text-left rounded text-gray-700 outline-none cursor-pointer flex items-center gap-2 hover:bg-gray-100"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height="18px"
                  viewBox="0 -960 960 960"
                  width="18px"
                  fill="currentColor"
                >
                  <title>削除</title>
                  <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z" />
                </svg>
                削除
              </MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>
      </div>

      {/* カードコンテンツ - クリック可能 */}
      <button
        type="button"
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleCardClick()
          }
        }}
        className="flex flex-col h-full text-left bg-transparent border-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
        aria-label={`${bookmark.title || 'タイトルなし'}のページを開く`}
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
          {isLoadingBookmark ? (
            <div className="space-y-2 mb-2">
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
            </div>
          ) : (
            <h3 className="text-base font-medium text-gray-900 line-clamp-2 mb-2">
              {bookmark.title || 'タイトルなし'}
            </h3>
          )}

          {/* URL */}
          <div className="text-xs text-blue-600 truncate mb-2">
            {bookmark.url}
          </div>

          {/* 説明文 */}
          {isLoadingBookmark ? (
            <div className="space-y-1 mb-3">
              <div className="h-3 bg-gray-200 rounded animate-pulse"></div>
              <div className="h-3 bg-gray-200 rounded animate-pulse w-5/6"></div>
              <div className="h-3 bg-gray-200 rounded animate-pulse w-2/3"></div>
            </div>
          ) : (
            bookmark.description && (
              <p className="text-sm text-gray-700 line-clamp-3 mb-3">
                {bookmark.description}
              </p>
            )
          )}

          {/* タグ表示 */}
          {isLoadingBookmark || tagsLoading ? (
            <div className="mb-3">
              <div className="flex flex-wrap gap-1">
                <div className="h-6 w-16 bg-gray-200 rounded-full animate-pulse"></div>
                <div className="h-6 w-20 bg-gray-200 rounded-full animate-pulse"></div>
                <div className="h-6 w-12 bg-gray-200 rounded-full animate-pulse"></div>
              </div>
            </div>
          ) : (
            bookmarkTags &&
            bookmarkTags.length > 0 && (
              <div className="mb-3">
                <div className="flex flex-wrap gap-1">
                  {bookmarkTags.slice(0, 4).map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                  {bookmarkTags.length > 4 && (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                      +{bookmarkTags.length - 4}個
                    </span>
                  )}
                </div>
              </div>
            )
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
      </button>

      {/* タグ管理ポップオーバー */}
      <BookmarkTagManager
        bookmark={bookmark}
        isOpen={isTagManagerOpen}
        onOpenChange={setIsTagManagerOpen}
        triggerRef={menuButtonRef}
      />
    </div>
  )
}
