'use client'

import { useAuth } from './AuthProvider'

export function LoginButton() {
  const { user, loading, isWhitelisted, signInWithGoogle, signOut } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-sm text-gray-500">読み込み中...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={signInWithGoogle}
        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
      >
        Googleでログイン
      </button>
    )
  }

  if (!isWhitelisted) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-yellow-800">
              アクセス権限がありません
            </h3>
            <div className="mt-2 text-sm text-yellow-700">
              <p>
                このアプリケーションを使用するにはホワイトリストに登録されたメールアドレスでログインする必要があります。
              </p>
              <p className="mt-1">
                現在のメールアドレス:{' '}
                <span className="font-mono">{user.email}</span>
              </p>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={signOut}
                className="text-sm font-medium text-yellow-800 underline hover:text-yellow-900"
              >
                別のアカウントでログイン
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center space-x-4">
      <div className="flex items-center space-x-2">
        {user.user_metadata?.avatar_url && (
          // biome-ignore lint: Next.js Image component requires additional setup for external URLs
          <img
            src={user.user_metadata.avatar_url}
            alt="Avatar"
            className="w-8 h-8 rounded-full"
          />
        )}
        <div className="text-sm">
          <div className="font-medium text-gray-900">
            {user.user_metadata?.full_name || user.email}
          </div>
          <div className="text-gray-500">{user.email}</div>
        </div>
      </div>
      <button
        type="button"
        onClick={signOut}
        className="text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
      >
        ログアウト
      </button>
    </div>
  )
}
