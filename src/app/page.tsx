'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/components/auth/AuthProvider'

export const dynamic = 'force-dynamic'

export default function Home() {
  const { user, loading, isWhitelisted } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading) {
      if (user && isWhitelisted) {
        router.push('/dashboard')
      }
    }
  }, [user, isWhitelisted, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <div className="mt-4 text-lg font-medium text-gray-900">
            読み込み中...
          </div>
          <div className="mt-2 text-sm text-gray-500">
            認証状態を確認しています
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex flex-col items-center justify-center min-h-screen px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Encore</h1>
          <p className="text-xl text-gray-600 mb-8">ブックマーク管理システム</p>

          <div className="space-y-4">
            <Link
              href="/login"
              className="inline-flex items-center justify-center w-full px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
            >
              ログインして開始
            </Link>

            <p className="text-sm text-gray-500">
              ログインには事前に登録されたGoogleアカウントが必要です
            </p>
          </div>
        </div>

        <div className="mt-16 text-center">
          <h2 className="text-lg font-medium text-gray-900 mb-4">主な機能</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  role="img"
                  aria-label="ブックマーク管理アイコン"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                ブックマーク管理
              </h3>
              <p className="text-sm text-gray-600">
                お気に入りのWebサイトを整理し、いつでも簡単にアクセス
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  role="img"
                  aria-label="高速検索アイコン"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                高速検索
              </h3>
              <p className="text-sm text-gray-600">
                タイトル、説明、メモから瞬時に目的のブックマークを発見
              </p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-purple-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  role="img"
                  aria-label="読み状況管理アイコン"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                読み状況管理
              </h3>
              <p className="text-sm text-gray-600">
                未読・既読状態を管理し、効率的な情報収集をサポート
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
