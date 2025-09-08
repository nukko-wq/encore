'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function ErrorContent() {
  const searchParams = useSearchParams()
  const message = searchParams.get('message')

  const getErrorMessage = (errorType: string | null) => {
    switch (errorType) {
      case 'unauthorized':
        return {
          title: 'アクセスが拒否されました',
          description:
            'お使いのアカウントはこのアプリケーションへのアクセス権限がありません。',
          suggestion:
            'アクセス権限が必要な場合は、管理者にお問い合わせください。',
        }
      case 'callback_error':
        return {
          title: 'ログイン処理でエラーが発生しました',
          description: '認証プロバイダーとの通信中にエラーが発生しました。',
          suggestion: 'しばらく時間を置いてから、再度お試しください。',
        }
      case 'no_email':
        return {
          title: 'メールアドレスの取得に失敗しました',
          description:
            'Googleアカウントからメールアドレス情報を取得できませんでした。',
          suggestion:
            'Googleアカウントでメールアドレスが公開されているか確認してください。',
        }
      case 'unexpected_error':
        return {
          title: '予期しないエラーが発生しました',
          description: 'システム内部でエラーが発生しました。',
          suggestion: '問題が解決しない場合は、管理者にお問い合わせください。',
        }
      case 'config_error':
        return {
          title: '設定エラー',
          description: '認証システムの設定に問題があります。',
          suggestion: 'システム管理者にお問い合わせください。',
        }
      case 'session_conflict':
        return {
          title: 'セッション競合',
          description: '既存のセッションと新しい認証が競合しました。',
          suggestion:
            'ブラウザをリフレッシュしてから再度ログインをお試しください。',
        }
      default:
        return {
          title: 'ログインエラー',
          description: '認証中に問題が発生しました。',
          suggestion: 'もう一度お試しください。',
        }
    }
  }

  const errorInfo = getErrorMessage(message)

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h2 className="mt-6 text-2xl font-bold text-gray-900">
            {errorInfo.title}
          </h2>
          <p className="mt-2 text-sm text-gray-600">{errorInfo.description}</p>
          <p className="mt-4 text-sm text-gray-500">{errorInfo.suggestion}</p>
        </div>

        <div className="mt-8">
          <Link
            href="/login"
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            ログインページに戻る
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">読み込み中...</p>
          </div>
        </div>
      }
    >
      <ErrorContent />
    </Suspense>
  )
}
