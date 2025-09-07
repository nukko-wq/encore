'use client'

import Link from 'next/link'
import { useAuth } from '@/components/auth/AuthProvider'
import { LoginButton } from '@/components/auth/LoginButton'

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  const { user, loading, isWhitelisted } = useAuth()

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
              ダッシュボードにアクセスするには、ホワイトリストに登録されたアカウントでログインが必要です。
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
            <div className="flex items-center">
              <h1 className="text-3xl font-bold text-gray-900">
                Encore ダッシュボード
              </h1>
            </div>
            <LoginButton />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="border-4 border-dashed border-gray-200 rounded-lg p-8">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                ようこそ、{user.user_metadata?.full_name || user.email} さん
              </h2>
              <p className="text-gray-600 mb-8">
                ブックマーク管理システムへようこそ。下記から各機能にアクセスできます。
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-lg mx-auto">
                <Link
                  href="/bookmarks"
                  className="group relative bg-white p-6 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <span className="text-blue-600 bg-blue-100 rounded-lg inline-flex p-3 ring-4 ring-white">
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        role="img"
                        aria-label="ブックマークアイコン"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                        />
                      </svg>
                    </span>
                  </div>
                  <div className="mt-8">
                    <h3 className="text-lg font-medium text-gray-900 group-hover:text-gray-600">
                      ブックマーク管理
                    </h3>
                    <p className="mt-2 text-sm text-gray-500">
                      ブックマークの閲覧、追加、編集を行います
                    </p>
                  </div>
                  <span
                    className="pointer-events-none absolute top-6 right-6 text-gray-300 group-hover:text-gray-400"
                    aria-hidden="true"
                  >
                    <svg
                      className="w-6 h-6"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      role="img"
                      aria-label="矢印アイコン"
                    >
                      <path
                        fillRule="evenodd"
                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                </Link>

                <div className="group relative bg-gray-100 p-6 border border-gray-200 rounded-lg opacity-60">
                  <div>
                    <span className="text-gray-400 bg-gray-200 rounded-lg inline-flex p-3 ring-4 ring-white">
                      <svg
                        className="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        role="img"
                        aria-label="設定アイコン"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                    </span>
                  </div>
                  <div className="mt-8">
                    <h3 className="text-lg font-medium text-gray-500">設定</h3>
                    <p className="mt-2 text-sm text-gray-400">
                      将来実装予定の機能です
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
